/** @type {import('next').NextConfig} */
// CORS aberto (*) intencional: este é um tracker público chamado por landing pages
// arbitrárias. Webhooks (/api/webhook/kiwify) são protegidos por HMAC-SHA1, não por
// Origin; rotas do dashboard exigem auth Supabase e não dependem de CORS.
const nextConfig = {
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type" },
        ],
      },
    ];
  },
};

export default nextConfig;
