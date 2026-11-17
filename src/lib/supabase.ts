import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false },
      global: {
        // Desabilita o Data Cache do Next.js para queries do dashboard,
        // garantindo que sempre lemos linhas recém-inseridas.
        fetch: (url, options = {}) =>
          fetch(url, { ...options, cache: "no-store" }),
      },
    }
  );
}

/**
 * Usuário autenticado da sessão do dashboard, ou null.
 * Usa getUser() (valida o JWT no servidor do Supabase) — nunca confiar só na
 * presença do cookie, que o visitante controla.
 */
export async function getSessionUser() {
  const { data, error } = await createSupabaseServerClient().auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

export function createSupabaseServerClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // read-only em Server Components — safe to ignore
          }
        },
      },
    }
  );
}
