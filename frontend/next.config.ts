import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_ACCOUNT_SYNC_STAGE: process.env.NEXT_PUBLIC_ACCOUNT_SYNC_STAGE ?? (process.env.VERCEL === "1" ? "recipes" : "off"),
  },
};

export default nextConfig;
