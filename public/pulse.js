// Trackeamento.Online — pulse client — Digistore24 integration
(function () {
  'use strict';

  // Guard contra dupla inicialização (ex: SPA re-render)
  if (window.__rm_initialized) return;
  window.__rm_initialized = true;

  // ── Config via atributos do <script> tag ──────────────────────────────────
  // currentScript é null quando builder/cloaker injeta o script de forma
  // dinâmica — cai pra busca pelo src.
  var SCRIPT_TAG  = document.currentScript || document.querySelector('script[src*="/pulse.js"]');
  // IDs vêm do dash (/api/config); data-* na tag só sobrescreve (compat)
  var PIXEL_ID    = SCRIPT_TAG ? SCRIPT_TAG.getAttribute('data-pixel-id') : null;
  var GA4_ID      = SCRIPT_TAG ? SCRIPT_TAG.getAttribute('data-ga4-id') : null;
  var TIKTOK_ID   = SCRIPT_TAG ? SCRIPT_TAG.getAttribute('data-tiktok-pixel-id') : null;
  var IGNORED_REFERRERS = [];
  var API_BASE    = (function() {
    if (SCRIPT_TAG) {
      var attr = SCRIPT_TAG.getAttribute('data-api-base');
      if (attr) return attr.replace(/\/$/, '');
      var src = SCRIPT_TAG.src;
      if (src) {
        var m = src.match(/^(https?:\/\/[^\/]+)/);
        if (m) return m[1];
      }
    }
    return '';
  })();
  var COOKIE_NAME = '_rm_uid';
  var COOKIE_DAYS = 90;
  // Matcheia digistore24.com (produto direto) E checkout-ds24.com (promolinks afiliados)
  var DIGISTORE_RE = /digistore24\.com|checkout-ds24\.com/i;

  // ── Utilidades ────────────────────────────────────────────────────────────
  function uuid4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  function getCookie(name) {
    var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function setCookie(name, value, days) {
    var expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = name + '=' + encodeURIComponent(value) +
      '; expires=' + expires + '; path=/; SameSite=Lax';
  }

  // Identificador persistente do usuário.
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function getOrCreateUserId() {
    var cookieUid = getCookie(COOKIE_NAME);
    if (cookieUid) { lsSet(COOKIE_NAME, cookieUid); return Promise.resolve(cookieUid); }

    var lsUid = lsGet(COOKIE_NAME);
    var url = API_BASE + '/api/uid' + (lsUid ? '?uid=' + encodeURIComponent(lsUid) : '');
    return fetch(url, { credentials: 'include' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var uid = (j && j.user_id) || lsUid || uuid4();
        lsSet(COOKIE_NAME, uid);
        if (!getCookie(COOKIE_NAME)) setCookie(COOKIE_NAME, uid, COOKIE_DAYS);
        return uid;
      })
      .catch(function () {
        var uid = lsUid || uuid4();
        lsSet(COOKIE_NAME, uid);
        setCookie(COOKIE_NAME, uid, COOKIE_DAYS);
        return uid;
      });
  }

  // ── UTM persistence: URL → cookie → referrer ───────────────────────────
  var UTM_COOKIE = '_rm_utms';
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

  function isIgnoredReferrer(hostname) {
    var h = (hostname || '').toLowerCase();
    for (var i = 0; i < IGNORED_REFERRERS.length; i++) {
      var d = IGNORED_REFERRERS[i];
      if (h === d || h.slice(-(d.length + 1)) === '.' + d) return true;
    }
    return false;
  }

  // Referrer do cloaker não vai pro log (senão vira "origem" em Campanhas)
  function pageReferrer() {
    try {
      if (isIgnoredReferrer(new URL(document.referrer).hostname)) return null;
    } catch (e) {}
    return document.referrer || null;
  }

  // Cloaker precisa repassar a query do anúncio pra oferta (o browser corta
  // query do referrer cross-origin, então não dá pra recuperar depois).
  function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function getUtmsFromUrl() {
    var utms = {};
    var hasAny = false;
    UTM_KEYS.forEach(function (k) {
      var v = getParam(k);
      if (v) { utms[k] = v; hasAny = true; }
    });
    return hasAny ? utms : null;
  }

  function getUtmsFromCookie() {
    var raw = getCookie(UTM_COOKIE);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function getUtmsFromReferrer() {
    var ref = document.referrer;
    if (!ref) return null;
    try {
      var url = new URL(ref);
      // Safe page / link do cloaker não é fonte de tráfego
      if (url.hostname === window.location.hostname || isIgnoredReferrer(url.hostname)) return null;
      return { utm_source: url.hostname, utm_medium: 'referral' };
    } catch (e) { return null; }
  }

  function saveUtmsCookie(utms) {
    setCookie(UTM_COOKIE, JSON.stringify(utms), 30);
  }

  // Click id persistido (cookie + localStorage) pra sobreviver a navegação
  // interna e voltar na compra.
  function getPersistedParam(name, storageKey) {
    var v = getParam(name);
    if (v) {
      setCookie(storageKey, v, 90);
      lsSet(storageKey, v);
      return v;
    }
    return getCookie(storageKey) || lsGet(storageKey);
  }

  function clearPersisted(storageKey) {
    setCookie(storageKey, '', -1);
    try { localStorage.removeItem(storageKey); } catch (e) {}
  }

  function getUrlParams() {
    // Clique novo de uma plataforma invalida o click id antigo da outra
    // (senão ttclid de 30 dias atrás marca visita do Meta como TikTok)
    var urlTt = getParam('ttclid'), urlFb = getParam('fbclid');
    if (urlTt && !urlFb) clearPersisted('_rm_fbclid');
    if (urlFb && !urlTt) clearPersisted('_rm_ttclid');

    var fromUrl = getUtmsFromUrl();
    var utms = fromUrl || getUtmsFromCookie() || getUtmsFromReferrer() || {};
    if (fromUrl) saveUtmsCookie(fromUrl);
    return {
      utm_source:   utms.utm_source || null,
      utm_medium:   utms.utm_medium || null,
      utm_campaign: utms.utm_campaign || null,
      utm_term:     utms.utm_term || null,
      utm_content:  utms.utm_content || null,
      fbclid:       getPersistedParam('fbclid', '_rm_fbclid'),
      ttclid:       getPersistedParam('ttclid', '_rm_ttclid'),
    };
  }

  function getFreshFbCookies(fbclid) {
    var fbp = getCookie('_fbp');
    var fbc = getCookie('_fbc');
    if (!fbc && fbclid) {
      fbc = 'fb.1.' + Date.now() + '.' + fbclid;
      setCookie('_fbc', fbc, 90);
    }
    return { fbp: fbp, fbc: fbc };
  }

  // ── Meta Pixel SDK Loader ────────────────────────────────────────────────
  function loadMetaPixel(pixelId) {
    if (window.fbq) return;
    !function(f,b,e,v,n,t,s){
      if(f.fbq)return;n=f.fbq=function(){n.callMethod?
      n.callMethod.apply(n,arguments):n.queue.push(arguments)};
      if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
      n.queue=[];t=b.createElement(e);t.async=!0;
      t.src=v;s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s)
    }(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', pixelId);
  }

  // ── TikTok Pixel Loader (snippet oficial) ─────────────────────────────────
  function loadTikTokPixel(pixelId) {
    if (window.ttq && window.ttq._i) return;
    !function (w, d, t) {
      w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=d.createElement("script");n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=d.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
      ttq.load(pixelId);
      ttq.page();
    }(window, document, 'ttq');
  }

  // ── GA4 gtag.js Loader ────────────────────────────────────────────────────
  // gtag cuida nativamente de session_id, engagement_time, first_visit, etc.
  // Em paralelo, nosso server MP envia Purchase via webhook Digistore (único
  // caminho onde o cliente não está mais na página). Para page_view/begin_checkout,
  // gtag é a fonte de verdade — server MP é apenas fallback para events_log.
  function loadGA4(measurementId) {
    if (window.__rm_ga4_loaded) return;
    window.__rm_ga4_loaded = true;

    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(measurementId);
    document.head.appendChild(s);

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    // config dispara page_view automaticamente; send_page_view:true é default
    window.gtag('config', measurementId, {
      // transport_type 'beacon' ajuda a não perder eventos durante navegação
      transport_type: 'beacon',
    });
  }

  // Lê o session_id que gtag guarda no cookie _ga_<container>
  // Formato: GS1.1.<session_id>.<session_count>.<engaged>.<timestamp>...
  function getGA4SessionId(measurementId) {
    if (!measurementId) return null;
    // Cookie name: _ga_<container_id> (G-XXXXXXXXXX → _ga_XXXXXXXXXX)
    var container = measurementId.replace(/^G-/i, '');
    var cookieName = '_ga_' + container;
    var raw = getCookie(cookieName);
    if (!raw) return null;
    var parts = raw.split('.');
    // index 2 é o session_id (timestamp da sessão)
    return parts.length >= 3 ? parts[2] : null;
  }

  // ── Envio de evento server-side (CAPI + GA4 MP) ───────────────────────────
  function postEvent(eventName, userId, pixelId, utms, fbclid, eventId) {
    var fb = getFreshFbCookies(fbclid);
    var sessionId = getGA4SessionId(GA4_ID);
    var payload = {
      event_name: eventName, event_id: eventId || uuid4(),
      user_id: userId, pixel_id: pixelId,
      user_agent: navigator.userAgent, page_url: window.location.href,
      page_referrer: pageReferrer(),
      utm_source: utms.utm_source, utm_medium: utms.utm_medium,
      utm_campaign: utms.utm_campaign, utm_term: utms.utm_term,
      utm_content: utms.utm_content,
      fbp: fb.fbp, fbc: fb.fbc,
      ga4_session_id: sessionId,
      fbclid: fbclid || null, ttclid: utms.ttclid || null, ttp: getCookie('_ttp'),
    };
    fetch(API_BASE + '/api/event', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), keepalive: true,
    })
      .then(function (r) {
        if (!r.ok) console.warn('[Pulse] /api/event HTTP', r.status, eventName);
      })
      .catch(function (e) { console.warn('[Pulse] /api/event error', e); });
  }

  // ── Captura de lead (perfil persistente no banco) ─────────────────────────
  function postLead(userId, pixelId, utms, fbclid) {
    var fb = getFreshFbCookies(fbclid);
    var payload = {
      user_id: userId, pixel_id: pixelId,
      user_agent: navigator.userAgent, url: window.location.href,
      page_referrer: pageReferrer(),
      utm_source: utms.utm_source, utm_medium: utms.utm_medium,
      utm_campaign: utms.utm_campaign, utm_term: utms.utm_term,
      utm_content: utms.utm_content,
      fbp: fb.fbp, fbc: fb.fbc,
      fbclid: fbclid || null, ttclid: utms.ttclid || null, ttp: getCookie('_ttp'),
    };
    return fetch(API_BASE + '/api/lead', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), keepalive: true,
    })
      .then(function (r) {
        if (!r.ok) console.warn('[Pulse] /api/lead HTTP', r.status);
      })
      .catch(function (e) { console.warn('[Pulse] /api/lead error', e); });
  }

  // ── Decoração de URL do Digistore24 com dados de tracking ────────────────
  // Usa naming nativo Digistore (cid para o click id e utm_* individuais).
  // Esses viram placeholders {cid}, {utm_source}, etc. no postback S2S.
  function decorateDigistoreUrl(href, userId, utms) {
    try {
      var url = new URL(href);

      // Referrer só como fallback e nunca o do cloaker/mesmo site
      var refUtms = getUtmsFromReferrer();
      var source = utms.utm_source || (refUtms && refUtms.utm_source) || '';

      // cid = click id nativo Digistore (vira {cid} no postback)
      if (userId)             url.searchParams.set('cid', userId);
      if (source)             url.searchParams.set('utm_source',   source);
      if (utms.utm_medium)    url.searchParams.set('utm_medium',   utms.utm_medium);
      if (utms.utm_campaign)  url.searchParams.set('utm_campaign', utms.utm_campaign);
      if (utms.utm_content)   url.searchParams.set('utm_content',  utms.utm_content);
      if (utms.utm_term)      url.searchParams.set('utm_term',     utms.utm_term);

      // Também passa `custom` packed pra compat com IPN antigo
      var customParts = [userId || '', source || '', utms.utm_medium || '', utms.utm_campaign || '', utms.utm_content || '', utms.utm_term || ''];
      url.searchParams.set('custom', customParts.join('|'));

      return url.toString();
    } catch (e) { return href; }
  }

  // ── Interceptor de navegação programática (window.open, location.href, etc) ──
  // Cobre fluxos onde o checkout é aberto via JS (ex: player de VSL que faz
  // window.location.href = ... no fim do vídeo), em vez de <a href> estático.
  function installNavigationInterceptors(userId, utms) {
    function maybeDecorate(url) {
      try {
        if (!url) return url;
        var s = String(url);
        return DIGISTORE_RE.test(s) ? decorateDigistoreUrl(s, userId, utms) : url;
      } catch (e) { return url; }
    }

    // API pública pra integradores chamarem explicitamente, ex:
    //   window.location.href = window.rmDecorate('https://www.checkout-ds24.com/...')
    window.rmDecorate = maybeDecorate;

    // Hook em window.open
    try {
      var origOpen = window.open;
      if (typeof origOpen === 'function') {
        window.open = function (url, target, features) {
          return origOpen.call(this, maybeDecorate(url), target, features);
        };
      }
    } catch (e) {}

    // Hook em window.location.assign / .replace
    try {
      var loc = window.location;
      var origAssign  = loc.assign  && loc.assign.bind(loc);
      var origReplace = loc.replace && loc.replace.bind(loc);
      if (origAssign)  loc.assign  = function (url) { return origAssign(maybeDecorate(url)); };
      if (origReplace) loc.replace = function (url) { return origReplace(maybeDecorate(url)); };
    } catch (e) {}

    // Hook em window.location.href setter (best effort — alguns browsers
    // não permitem redefinir; ignora se falhar)
    try {
      var locProto = Object.getPrototypeOf(window.location);
      var hrefDesc = Object.getOwnPropertyDescriptor(locProto, 'href');
      if (hrefDesc && typeof hrefDesc.set === 'function') {
        var origSet = hrefDesc.set;
        var origGet = hrefDesc.get;
        Object.defineProperty(window.location, 'href', {
          configurable: true,
          get: function () { return origGet ? origGet.call(window.location) : ''; },
          set: function (v) { origSet.call(window.location, maybeDecorate(v)); }
        });
      }
    } catch (e) {}
  }

  // ── Interceptor de cliques em links do Digistore24 ────────────────────────
  function attachDigistoreInterceptors(userId, pixelId, utms) {
    var fbclid = utms.fbclid;
    var checkoutLock = false;

    // InitiateCheckout uma vez por visita. Só o lock de 3s deixava passar um
    // segundo evento quando o checkout demorava a abrir e o visitante clicava
    // de novo (ou voltava do checkout e clicava outra vez). O clique repetido
    // continua levando pro checkout decorado — só não gera evento novo.
    var IC_KEY = '_rm_ic_at';
    var IC_WINDOW_MS = 30 * 60 * 1000;
    var icSentAt = 0;
    function checkoutTracked() {
      var at = icSentAt;
      try { at = Math.max(at, Number(sessionStorage.getItem(IC_KEY)) || 0); } catch (e) {}
      return Date.now() - at < IC_WINDOW_MS;
    }
    function markCheckoutTracked() {
      icSentAt = Date.now();
      try { sessionStorage.setItem(IC_KEY, String(icSentAt)); } catch (e) {}
    }
    // Não segura o clique: sem preventDefault/stopPropagation. O link é
    // decorado (cid/UTMs) no próprio clique, antes da ação padrão do browser,
    // e a navegação segue nativa — o player (ex: VTurb) conta o clique dele e
    // abre o checkout normalmente. Eventos saem em paralelo (fetch keepalive
    // sobrevive à navegação; o pixel client-side é best effort, o server-side
    // com o mesmo event_id garante o evento).
    function findCheckoutLink(e) {
      var path = (e.composedPath && e.composedPath()) || [];
      for (var i = 0; i < path.length; i++) {
        var n = path[i];
        if (n && n.tagName === 'A' && n.getAttribute && DIGISTORE_RE.test(n.getAttribute('href') || '')) return n;
      }
      var el = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      return el && DIGISTORE_RE.test(el.getAttribute('href') || '') ? el : null;
    }
    document.addEventListener('click', function (e) {
      var el;
      try { el = findCheckoutLink(e); } catch (err) { return; }
      if (!el) return;

      try {
        var decorated = decorateDigistoreUrl(el.href, userId, utms);
        if (decorated && decorated !== el.href) el.setAttribute('href', decorated);
        // Oferta dentro de iframe (cloaker): checkout abre na janela de cima
        if (window.top !== window && !el.getAttribute('target')) el.setAttribute('target', '_top');
      } catch (err) {}

      if (checkoutLock) return;
      checkoutLock = true;
      setTimeout(function () { checkoutLock = false; }, 3000);

      if (checkoutTracked()) return;
      markCheckoutTracked();

      try {
        var eventId = uuid4();
        // Meta Pixel client-side (dedup com CAPI via eventID)
        if (window.fbq && PIXEL_ID) fbq('track', 'InitiateCheckout', {}, { eventID: eventId });
        // TikTok Pixel client-side (dedup com Events API via event_id)
        if (window.ttq && TIKTOK_ID) window.ttq.track('InitiateCheckout', {}, { event_id: eventId });
        // GA4 gtag client-side begin_checkout (gtag anexa session_id nativamente)
        if (window.gtag) {
          window.gtag('event', 'begin_checkout', {
            event_id: eventId,
            source:   utms.utm_source   || undefined,
            medium:   utms.utm_medium   || undefined,
            campaign: utms.utm_campaign || undefined,
            content:  utms.utm_content  || undefined,
            term:     utms.utm_term     || undefined,
          });
        }
        postLead(userId, pixelId, utms, fbclid);
        postEvent('InitiateCheckout', userId, pixelId, utms, fbclid, eventId);
      } catch (err) {}
    }, true);
  }

  // ── Inicialização ─────────────────────────────────────────────────────────
  // Mesma regra de urlAllowed (src/lib/domains.ts): "dominio.com/slug",
  // domínio ou subdomínio + caminho por segmento; lista vazia = todas
  function pixelAllowed(rules) {
    if (!rules || !rules.length) return true;
    var h = window.location.hostname.toLowerCase();
    var p = window.location.pathname.toLowerCase().replace(/\/+$/, '');
    return rules.some(function (r) {
      var i = r.indexOf('/');
      var d = i < 0 ? r : r.slice(0, i);
      var slug = i < 0 ? '' : r.slice(i);
      var hostOk = h === d || h.slice(-(d.length + 1)) === '.' + d;
      return hostOk && (!slug || p === slug || p.indexOf(slug + '/') === 0);
    });
  }

  // IDs configurados no dash. Falha de rede não derruba: segue com data-*.
  function loadConfig() {
    // Timeout: config lento não pode atrasar o interceptor do checkout
    var timeout = new Promise(function (_, reject) {
      setTimeout(function () { reject(new Error('timeout')); }, 1500);
    });
    return Promise.race([fetch(API_BASE + '/api/config'), timeout])
      .then(function (r) { return r.json(); })
      .then(function (c) {
        PIXEL_ID  = PIXEL_ID  || c.meta_pixel_id;
        GA4_ID    = GA4_ID    || c.ga4_id;
        TIKTOK_ID = TIKTOK_ID || c.tiktok_pixel_id;
        IGNORED_REFERRERS = c.ignored_referrers || [];
        // Pixel fora da URL configurada no dash não carrega nem dispara.
        // Server aplica a mesma regra via page_url (/api/event).
        if (!pixelAllowed(c.meta_urls))   PIXEL_ID  = null;
        if (!pixelAllowed(c.tiktok_urls)) TIKTOK_ID = null;
      })
      .catch(function (e) { console.warn('[Pulse] /api/config error', e); });
  }

  function init() {
    Promise.all([getOrCreateUserId(), loadConfig()]).then(function (r) {
      // Sem pixel segue mesmo assim: decoração do checkout (cid/UTMs) é o que
      // garante a atribuição da compra no webhook
      if (!PIXEL_ID && !GA4_ID && !TIKTOK_ID) {
        console.warn('[Pulse] Nenhum pixel configurado em /dashboard/configuracoes');
      }
      initWithUid(r[0]);
    });
  }

  function initWithUid(userId) {
    var utms = getUrlParams();
    var pageViewId = uuid4();

    // Carrega SDKs client-side
    if (PIXEL_ID) loadMetaPixel(PIXEL_ID);
    if (GA4_ID)   loadGA4(GA4_ID);
    if (TIKTOK_ID) loadTikTokPixel(TIKTOK_ID);

    // PageView — delay para _fbp setar (crítico pra Meta EMQ)
    // gtag já dispara page_view sozinho no config (ignoramos aqui)
    setTimeout(function () {
      if (window.fbq && PIXEL_ID) fbq('track', 'PageView', {}, { eventID: pageViewId });
      // Server manda PageView como ViewContent pro TikTok — mesmo event_id dedup
      if (window.ttq && TIKTOK_ID) window.ttq.track('ViewContent', {}, { event_id: pageViewId });
      if (PIXEL_ID || TIKTOK_ID) postEvent('PageView', userId, PIXEL_ID || '', utms, utms.fbclid, pageViewId);
    }, 1500);

    installNavigationInterceptors(userId, utms);
    attachDigistoreInterceptors(userId, PIXEL_ID || '', utms);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
