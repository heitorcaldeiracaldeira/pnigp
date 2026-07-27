import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Headers de segurança p/ app B2G público. SEM CSP de propósito (quebraria charts/MapLibre/inline);
  // adicionar CSP exige testar a app inteira — fica como follow-up. HSTS é seguro (Vercel é 100% HTTPS).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
        ],
      },
    ];
  },
};

export default nextConfig;
