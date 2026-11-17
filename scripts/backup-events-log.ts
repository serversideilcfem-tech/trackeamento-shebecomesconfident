/**
 * Backup pré-TTL de events_log.
 *
 * Exporta para NDJSON todas as rows com created_at < now() - 30 days
 * (i.e. rows que vão ter os JSONBs zerados pela migration 004 / pelo cron).
 *
 * Uso: npx tsx scripts/backup-events-log.ts
 *
 * Requer em .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL=...
 *   SUPABASE_SERVICE_ROLE_KEY=...     (bypassa RLS)
 *
 * Saída: backups/events_log/events_log_pre_ttl_<ISO>.ndjson
 * Diretório backups/ é gitignored.
 */

import { createClient } from "@supabase/supabase-js";
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  appendFileSync,
  statSync,
  existsSync,
} from "node:fs";
import { join, resolve } from "node:path";

function loadEnvLocal(filepath: string): Record<string, string> {
  if (!existsSync(filepath)) return {};
  const text = readFileSync(filepath, "utf8");
  const env: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

async function main(): Promise<void> {
  const root = process.cwd();
  const fileEnv = loadEnvLocal(resolve(root, ".env.local"));
  const url = fileEnv.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey =
    fileEnv.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error(
      "Faltando NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY em .env.local"
    );
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const outDir = resolve(root, "backups", "events_log");
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = join(outDir, `events_log_pre_ttl_${stamp}.ndjson`);
  writeFileSync(outPath, "");

  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  console.log(`Backup cutoff (created_at <): ${cutoff}`);
  console.log(`Output: ${outPath}`);

  const PAGE_SIZE = 1000;
  let offset = 0;
  let total = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("events_log")
      .select("*")
      .lt("created_at", cutoff)
      .order("created_at", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error("Query error:", error);
      process.exit(2);
    }
    if (!data || data.length === 0) break;

    const lines = data.map((row) => JSON.stringify(row)).join("\n") + "\n";
    appendFileSync(outPath, lines);
    total += data.length;
    console.log(`  +${data.length} rows (total ${total})`);

    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const size = statSync(outPath).size;
  console.log(`Done: exported ${total} rows to ${outPath} (${size} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(3);
});
