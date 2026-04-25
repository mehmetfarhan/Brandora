import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow loading dev-only resources (HMR, RSC chunks) from these origins.
  // Without this, React never hydrates and forms fall back to native submits.
  allowedDevOrigins: ["127.0.0.1", "localhost", "192.168.100.232"],
};

export default nextConfig;
