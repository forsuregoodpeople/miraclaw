import type { NextConfig } from "next";

const API_URL = process.env.API_URL || "http://localhost:3003";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,

  webpack(config) {
    // Cari rule default Next untuk file (termasuk svg)
    const fileLoaderRule = config.module.rules.find((rule: any) =>
      rule.test?.test?.(".svg")
    );

    // Exclude svg supaya tidak bentrok
    if (fileLoaderRule) {
      fileLoaderRule.exclude = /\.svg$/;
    }

    // Gunakan SVGR untuk import sebagai React component
    config.module.rules.push({
      test: /\.svg$/,
      use: ["@svgr/webpack"],
    });

    return config;
  },

  // Turbopack support (Next 14+)
  turbopack: {
    rules: {
      "*.svg": {
        loaders: ["@svgr/webpack"],
        as: "*.tsx",
      },
    },
  },

  async rewrites() {
    return [
      {
        source: "/v1/:path*",
        destination: `${API_URL}/v1/:path*`,
      },
      {
        source: "/uploads/:path*",
        destination: `${API_URL}/uploads/:path*`,
      },
    ];
  },
};

export default nextConfig;