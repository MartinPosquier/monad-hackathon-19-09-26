import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Le tunnel cloudflared (npm run tunnel) sert l'app sous *.trycloudflare.com :
  // sans cette entrée, `next dev` refuse ses requêtes vers les assets de dev.
  allowedDevOrigins: ["*.trycloudflare.com"],
};

export default nextConfig;
