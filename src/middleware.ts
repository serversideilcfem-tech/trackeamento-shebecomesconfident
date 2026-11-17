import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Recriado dentro do setAll pra propagar tokens renovados pro browser
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() valida o JWT contra o Supabase. Checar só a presença do cookie
  // deixava qualquer visitante abrir o dashboard mandando um cookie inventado.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (pathname.startsWith("/dashboard") && !user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (pathname === "/login" && user) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  // Inclui as rotas de API autenticadas: sem passar pelo middleware elas não
  // renovam o access token (expira em 1h) e devolvem 401 mesmo com sessão viva.
  // Endpoints públicos de tracking (/api/uid, /api/event, /api/lead, webhooks)
  // ficam de fora de propósito — não precisam de sessão nem da latência extra.
  matcher: ["/dashboard/:path*", "/login", "/api/settings", "/api/test-webhook"],
};
