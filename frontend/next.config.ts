import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
  // Production optimizations
  
  // Suppress hydration warnings in development
  onDemandEntries: {
    // period (in ms) where the server will keep pages in the buffer
    maxInactiveAge: 25 * 1000,
    // number of pages that should be kept simultaneously without being disposed
    pagesBufferLength: 2,
  },
  
  // Additional development overlay settings
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: false,
  },

  webpack: (config) => {
    // The wallet connector barrel pulls in Coinbase's payment SDK, which
    // declares the x402 packages as peer dependencies that npm does not
    // install. We never touch Coinbase payments - only injected wallets and
    // MetaMask - so these resolve to nothing rather than being installed as
    // four unused dependencies.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@x402/core": false,
      "@x402/evm": false,
      "@x402/extensions": false,
      "@x402/svm": false,
      // MetaMask's SDK reaches for React Native storage when running on a
      // phone. This is a browser build, so there is nothing to resolve.
      "@react-native-async-storage/async-storage": false,
    };
    return config;
  },
};

export default nextConfig;
