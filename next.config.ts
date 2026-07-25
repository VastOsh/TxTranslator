import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project. A stray empty lockfile one level up
  // (C:\Dev\Injective) made Turbopack infer the wrong root; this makes it
  // explicit and portable to CI/Vercel instead of relying on auto-detection.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
