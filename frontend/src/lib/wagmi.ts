import { http, createConfig } from 'wagmi'
import { defineChain } from 'viem'
import { injected, metaMask } from 'wagmi/connectors'

// Define Somnia Network
export const somniaNetwork = defineChain({
  id: 50312,
  name: 'Somnia Shannon Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'STT',
    symbol: 'STT',
  },
  rpcUrls: {
    default: {
      http: ['https://dream-rpc.somnia.network'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Somnia Explorer',
      url: 'https://shannon-explorer.somnia.network',
    },
  },
  testnet: true,
})

export const wagmiConfig = createConfig({
  chains: [somniaNetwork],
  transports: {
    [somniaNetwork.id]: http(),
  },
  connectors: [
    injected({
      shimDisconnect: true,
    }),
    metaMask(),
  ],
})