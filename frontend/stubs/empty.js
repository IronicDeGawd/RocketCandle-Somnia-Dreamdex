/*
 * A module that is deliberately nothing.
 *
 * Turbopack cannot stub a dependency by aliasing it to `false` the way the
 * webpack config did, so the packages we never use are pointed here instead.
 * They are pulled in by the wallet-connector barrel (Coinbase's payment SDK
 * declares the x402 packages as peers that npm does not install, and
 * MetaMask's SDK reaches for React Native storage) and this app touches
 * neither, so resolving them to an empty object is correct rather than a
 * workaround.
 */
module.exports = {};
