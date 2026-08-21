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
  // Next 16 removed the `eslint` config key. This project has no ESLint
  // config at all (`npm run lint` fails outright), so there was nothing for it
  // to control - the type check is what guards the build.
  typescript: {
    ignoreBuildErrors: false,
  },

  /*
   * The same stubbing as the webpack config below, for Turbopack.
   *
   * Next 16 builds with Turbopack by default and refuses to run with a webpack
   * config and no Turbopack one - correctly, since the aliases below are
   * load-bearing: without them the build cannot resolve packages that are
   * declared as peers but never installed. Turbopack has no equivalent of
   * webpack's `false`, so each one points at an empty module instead.
   */
  turbopack: {
    resolveAlias: {
      "@x402/core": "./stubs/empty.js",
      "@x402/evm": "./stubs/empty.js",
      "@x402/extensions": "./stubs/empty.js",
      "@x402/svm": "./stubs/empty.js",
      "@react-native-async-storage/async-storage": "./stubs/empty.js",
    },
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
