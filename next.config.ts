import type { NextConfig } from "next";

// Si BACKEND_URL est défini (ex. sur Vercel), toutes les routes /api/* sont relayées vers ce
// serveur unique : le lobby vit en mémoire dans un seul processus, ce qui est impossible sur
// des fonctions serverless (une instance par requête). Sans BACKEND_URL : comportement local normal.
const backend = process.env.BACKEND_URL?.trim().replace(/\/+$/, "");

const nextConfig: NextConfig = {
  // Le tunnel cloudflared (npm run tunnel) sert l'app sous *.trycloudflare.com :
  // sans cette entrée, `next dev` refuse ses requêtes vers les assets de dev.
  allowedDevOrigins: ["*.trycloudflare.com"],
  // beforeFiles : sans lui, les route handlers /api/* locaux (qui existent dans l'app)
  // seraient servis en priorité et le relais ne s'appliquerait jamais.
  async rewrites() {
    return {
      beforeFiles: backend ? [{ source: "/api/:path*", destination: `${backend}/api/:path*` }] : [],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
