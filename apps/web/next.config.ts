import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: [
    "@quadstack/api",
    "@quadstack/auth",
    "@quadstack/db",
    "@quadstack/ui",
    "@quadstack/validators",
  ],
};

export default config;
