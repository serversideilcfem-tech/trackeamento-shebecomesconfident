// Check de click id e domínios do dash. Uso: node scripts/check-tracking-input.mjs
// (Node >= 23.6 importa .ts direto, sem build)
import assert from "node:assert/strict";
import { cleanClickId, sendsTo } from "../src/lib/platform.ts";
import { parseDomains, cookieDomainFor, parsePixelUrls, urlAllowed } from "../src/lib/domains.ts";
import { normalizePhone } from "../src/lib/hash.ts";

// ttclid real do TikTok tem ~300-350 chars (formato E_C_P_...)
const ttclid = "E_C_P_Ct8B" + "a".repeat(306);
assert.equal(cleanClickId(ttclid), ttclid);
assert.equal(cleanClickId("IwAR0abc-def_1.2"), "IwAR0abc-def_1.2");
assert.equal(cleanClickId("x".repeat(1025)), null);
assert.equal(cleanClickId("a b"), null);
assert.equal(cleanClickId({}), null);

assert.deepEqual(parseDomains(".shebackex.com", " A.com , ,b.com"), ["shebackex.com", "a.com", "b.com"]);
assert.deepEqual(parseDomains(undefined, ""), []);
assert.deepEqual(parseDomains("https://safepage.com/man, x.com:443"), ["safepage.com", "x.com"]);
const domains = parseDomains(".rightmenconnection.com", "shecancomeback.com");
assert.equal(cookieDomainFor("data.rightmenconnection.com", domains), ".rightmenconnection.com");
assert.equal(cookieDomainFor("data.shecancomeback.com", domains), ".shecancomeback.com");
assert.equal(cookieDomainFor("shecancomeback.com", domains), ".shecancomeback.com");
assert.equal(cookieDomainFor("evilshecancomeback.com", domains), undefined);
assert.equal(cookieDomainFor("manconnection.vercel.app", domains), undefined);

// URL de disparo do pixel: vazio = todas; senão domínio (ou subdomínio) + slug
assert.deepEqual(parsePixelUrls(" https://www.A.com/Met/?x=1 , b.com:443/recover/,"), ["www.a.com/met", "b.com/recover"]);
const meta = parsePixelUrls("rightmenconnection.com/met");
const tiktok = parsePixelUrls("rightmenconnection.com/recover");
assert.equal(urlAllowed("www.rightmenconnection.com", "/met", meta), true);
assert.equal(urlAllowed("www.rightmenconnection.com", "/met/", meta), true);
assert.equal(urlAllowed("www.rightmenconnection.com", "/met/obrigado", meta), true);
assert.equal(urlAllowed("www.rightmenconnection.com", "/metx", meta), false);
assert.equal(urlAllowed("www.rightmenconnection.com", "/met", tiktok), false);
assert.equal(urlAllowed("www.rightmenconnection.com", "/recover/", tiktok), true);
assert.equal(urlAllowed("evilrightmenconnection.com", "/met", meta), false);
assert.equal(urlAllowed("home.maleskills.com", "/x", parsePixelUrls("maleskills.com")), true);
assert.equal(urlAllowed("qualquer.com", "/", []), true);

// Telefone → E.164 sem "+": EUA/Canadá ganham o DDI 1 quando vêm só os 10 dígitos
assert.equal(normalizePhone("(555) 010-9999", "US"), "15550109999");
assert.equal(normalizePhone("+1 555 010 9999", "US"), "15550109999");
assert.equal(normalizePhone("1-555-010-9999", "us"), "15550109999");
assert.equal(normalizePhone("604 555 0100", "CA"), "16045550100");
assert.equal(normalizePhone("+44 7911 123456", "GB"), "447911123456");
assert.equal(normalizePhone("11987654321", "BR"), "5511987654321");
assert.equal(normalizePhone("+55 11 98765-4321", "BR"), "5511987654321");
assert.equal(normalizePhone("", "US"), null);
assert.equal(normalizePhone(null, "US"), null);

// Purchase só vai pra plataforma de origem; origem desconhecida vai pras duas
assert.equal(sendsTo("tiktok", "tiktok"), true);
assert.equal(sendsTo("meta", "tiktok"), false);
assert.equal(sendsTo("meta", "meta"), true);
assert.equal(sendsTo("tiktok", "meta"), false);
assert.equal(sendsTo("meta", null), true);
assert.equal(sendsTo("tiktok", undefined), true);

console.log("ok");
