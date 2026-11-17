"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { parseDomains } from "@/lib/domains";

interface SettingInfo {
  value: string;
  isSecret: boolean;
  fromEnv: boolean;
  hasValue: boolean;
}

const GROUPS: { title: string; description: string; fields: { key: string; label: string; placeholder?: string }[] }[] = [
  {
    title: "Meta Ads",
    description: "Pixel e Conversions API (Events Manager → Settings → Conversions API), domínio onde o pixel dispara, cookie e cloaker",
    fields: [
      { key: "META_PIXEL_ID", label: "Pixel ID" },
      { key: "META_ACCESS_TOKEN", label: "Access Token" },
      { key: "META_TEST_EVENT_CODE", label: "Test Event Code (opcional, só para testes)" },
      { key: "META_PIXEL_DOMAINS", label: "Páginas onde o pixel dispara — domínio/slug, separadas por vírgula (vazio = todas)", placeholder: "shebecomesconfident.com/love" },
      { key: "COOKIE_DOMAIN", label: "Cookie Domain", placeholder: ".dominiodaoferta.com" },
      { key: "IGNORED_REFERRER_DOMAINS", label: "Domínios do cloaker (separados por vírgula)", placeholder: "safepage.com, link-do-whiterabbit.com" },
    ],
  },
  {
    title: "TikTok Ads",
    description: "Pixel e Events API (Ads Manager → Tools → Events → Web Events → Settings), domínio onde o pixel dispara, cookie e cloaker. A oferta deve carregar o pulse.js de data.<domínio do TikTok> (CNAME na Vercel)",
    fields: [
      { key: "TIKTOK_PIXEL_ID", label: "Pixel ID" },
      { key: "TIKTOK_ACCESS_TOKEN", label: "Access Token" },
      { key: "TIKTOK_TEST_EVENT_CODE", label: "Test Event Code (opcional, só para testes)" },
      { key: "TIKTOK_PIXEL_DOMAINS", label: "Páginas onde o pixel dispara — domínio/slug, separadas por vírgula (vazio = todas)", placeholder: "home.maleskills.com/recover" },
      { key: "COOKIE_DOMAIN_TIKTOK", label: "Cookie Domain", placeholder: ".dominiodaoferta-tiktok.com" },
      { key: "IGNORED_REFERRER_DOMAINS_TIKTOK", label: "Domínios do cloaker (separados por vírgula)", placeholder: "safepage.com, link-do-whiterabbit.com" },
    ],
  },
  {
    title: "Google Analytics 4",
    description: "GA4 Admin → Data Streams → Measurement Protocol",
    fields: [
      { key: "GA4_MEASUREMENT_ID", label: "Measurement ID", placeholder: "G-XXXXXXXXXX" },
      { key: "GA4_API_SECRET", label: "API Secret" },
    ],
  },
  {
    title: "Digistore24",
    description: "Passphrase do IPN e segredo do postback S2S — mesmos valores configurados no painel Digistore",
    fields: [
      { key: "DIGISTORE_IPN_PASSPHRASE", label: "IPN Passphrase (SHA-512)" },
      { key: "DIGISTORE_POSTBACK_SECRET", label: "Postback Secret (S2S)" },
      { key: "DIGISTORE_ACCEPT_TEST", label: "Aceitar pagamentos de teste (1 = sim)", placeholder: "vazio = não" },
    ],
  },
];

export default function ConfiguracoesPage() {
  const [settings, setSettings] = useState<Record<string, SettingInfo> | null>(null);
  const [dirty, setDirty] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d) => setSettings(d.settings ?? {}))
      .catch(() => setMessage({ ok: false, text: "Falha ao carregar configurações." }));
  }, []);

  const hasChanges = Object.keys(dirty).length > 0;

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: dirty }),
      });
      const data = await res.json();
      if (res.status === 401) {
        setMessage({ ok: false, text: "Sessão expirada — recarregue a página e faça login de novo. Seus valores continuam preenchidos até recarregar." });
        return;
      }
      if (!res.ok) throw new Error(data.error || "save failed");
      setMessage({ ok: true, text: "Salvo. Webhooks passam a usar os valores novos em até 1 minuto." });
      setDirty({});
      // Recarrega para exibir valores mascarados atualizados
      const refreshed = await fetch("/api/settings").then((r) => r.json());
      setSettings(refreshed.settings ?? {});
    } catch (err) {
      setMessage({ ok: false, text: `Erro ao salvar: ${String(err)}` });
    } finally {
      setSaving(false);
    }
  }

  if (!settings) {
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Valores salvos aqui têm prioridade sobre as env vars da Vercel. Campo
          vazio volta a usar a env var (se existir).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Script de instalação</CardTitle>
          <CardDescription>
            Cole no &lt;head&gt; da página da oferta. O host vem do Cookie Domain salvo abaixo
            (data.&lt;domínio&gt; precisa de CNAME → cname.vercel-dns.com e estar no projeto Vercel).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { label: "Oferta Meta", key: "COOKIE_DOMAIN" },
            { label: "Oferta TikTok", key: "COOKIE_DOMAIN_TIKTOK" },
          ].map(({ label, key }) => {
            const domain = parseDomains(settings[key]?.value)[0];
            const host = domain ? `data.${domain}` : window.location.host;
            const tag = `<script src="https://${host}/pulse.js" async></script>`;
            return (
              <div key={key} className="space-y-1">
                <p className="text-sm font-medium">{label}</p>
                <div className="flex gap-2">
                  <code className="flex-1 rounded-md border bg-muted px-3 py-2 text-xs break-all">{tag}</code>
                  <button
                    onClick={() => navigator.clipboard.writeText(tag).then(() => setCopied(key))}
                    className="px-3 rounded-md border text-sm"
                  >
                    {copied === key ? "Copiado" : "Copiar"}
                  </button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {GROUPS.map((group) => (
        <Card key={group.title}>
          <CardHeader>
            <CardTitle>{group.title}</CardTitle>
            <CardDescription>{group.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {group.fields.map(({ key, label, placeholder }) => {
              const info = settings[key];
              const edited = key in dirty;
              return (
                <div key={key} className="space-y-1">
                  <label htmlFor={key} className="text-sm font-medium flex items-center gap-2">
                    {label}
                    {info?.fromEnv && !edited && (
                      <span className="text-xs text-muted-foreground font-normal">(usando env var da Vercel)</span>
                    )}
                  </label>
                  <input
                    id={key}
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    // Segredo salvo nunca desce ao browser: input começa vazio,
                    // placeholder indica que existe valor; digitar substitui
                    placeholder={
                      info?.isSecret && info.hasValue
                        ? "•••••••• (salvo — digite para substituir)"
                        : placeholder
                    }
                    value={edited ? dirty[key] : info?.value ?? ""}
                    onChange={(e) => setDirty((d) => ({ ...d, [key]: e.target.value }))}
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={!hasChanges || saving}
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
        >
          {saving ? "Salvando…" : "Salvar alterações"}
        </button>
        {message && (
          <p className={`text-sm ${message.ok ? "text-muted-foreground" : "text-red-500"}`}>
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
