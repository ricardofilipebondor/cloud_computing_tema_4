import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "applicationinsights",
    "@azure/monitor-opentelemetry",
    "@opentelemetry/instrumentation"
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb"
    }
  }
};

export default nextConfig;
