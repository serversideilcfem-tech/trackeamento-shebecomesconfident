import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, getSessionUser } from "@/lib/supabase";
import {
  SETTING_KEYS,
  SECRET_KEYS,
  REQUIRED_KEYS,
  SettingKey,
  invalidateSettingsCache,
} from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * GET /api/settings
 * Retorna { key: { value, isSecret, fromEnv, hasValue } }.
 * Segredos NUNCA descem ao browser — value vem vazio, só hasValue indica
 * que existe valor salvo. fromEnv=true quando vale a env var da Vercel.
 */
export async function GET() {
  if (!(await getSessionUser())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await createAdminClient()
    .from("app_settings")
    .select("key, value");

  if (error) {
    console.error("[api/settings] fetch failed:", error);
    return NextResponse.json({ error: "fetch failed" }, { status: 500 });
  }

  const dbValues = new Map((data ?? []).map((r) => [r.key, r.value as string]));

  const settings: Record<
    string,
    { value: string; isSecret: boolean; fromEnv: boolean; hasValue: boolean }
  > = {};
  for (const key of SETTING_KEYS) {
    const isSecret = SECRET_KEYS.includes(key);
    const dbValue = dbValues.get(key);
    const envValue = process.env[key];
    const raw = dbValue || envValue || "";
    settings[key] = {
      value: isSecret ? "" : raw,
      isSecret,
      fromEnv: !dbValue && !!envValue,
      hasValue: !!raw,
    };
  }

  return NextResponse.json({ settings });
}

/**
 * POST /api/settings
 * Body: { settings: { KEY: "valor" } } — só as keys alteradas.
 * Valor vazio ("") apaga a linha (volta a valer a env var, se existir);
 * chaves em REQUIRED_KEYS não podem ficar sem valor nenhum.
 * Valida tudo antes de gravar; grava em 2 chamadas (upsert batch + delete in).
 */
export async function POST(request: NextRequest) {
  if (!(await getSessionUser())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const incoming = body?.settings;
  if (!incoming || typeof incoming !== "object") {
    return NextResponse.json({ error: "missing settings" }, { status: 400 });
  }

  // ── Validação completa ANTES de qualquer write (sem save parcial) ──
  const toUpsert: { key: string; value: string; updated_at: string }[] = [];
  const toDelete: string[] = [];
  for (const [key, value] of Object.entries(incoming)) {
    if (!SETTING_KEYS.includes(key as SettingKey)) {
      return NextResponse.json({ error: `unknown key: ${key}` }, { status: 400 });
    }
    if (typeof value !== "string") {
      return NextResponse.json({ error: `invalid value for ${key}` }, { status: 400 });
    }
    // Caracteres de controle quebrariam headers HTTP (Authorization, Set-Cookie)
    // eslint-disable-next-line no-control-regex
    if (/[\x00-\x1f\x7f]/.test(value)) {
      return NextResponse.json(
        { error: `${key}: valor contém caracteres de controle` },
        { status: 400 }
      );
    }

    const trimmed = value.trim();
    if (trimmed === "") {
      if (REQUIRED_KEYS.includes(key as SettingKey) && !process.env[key]) {
        return NextResponse.json(
          { error: `${key} é obrigatória e não pode ficar vazia` },
          { status: 400 }
        );
      }
      toDelete.push(key);
    } else {
      toUpsert.push({ key, value: trimmed, updated_at: new Date().toISOString() });
    }
  }

  const supabase = createAdminClient();

  if (toUpsert.length > 0) {
    const { error } = await supabase.from("app_settings").upsert(toUpsert);
    if (error) {
      console.error("[api/settings] upsert failed:", error);
      return NextResponse.json({ error: "save failed" }, { status: 500 });
    }
  }
  if (toDelete.length > 0) {
    const { error } = await supabase.from("app_settings").delete().in("key", toDelete);
    if (error) {
      console.error("[api/settings] delete failed:", error);
      return NextResponse.json({ error: "save failed" }, { status: 500 });
    }
  }

  invalidateSettingsCache();
  return NextResponse.json({ success: true });
}
