import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // The Luma guests CSV is uploaded through a server action (about 400 KB for 500 guests).
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
