import { avalancheFuji } from 'wagmi/chains';

/** Expected chain — Avalanche Fuji testnet only (no mainnet). */
export const FUJI_CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID) || avalancheFuji.id;

export const FUJI_CHAIN = avalancheFuji;

export const FUJI_RPC_URL =
  import.meta.env.VITE_RPC_URL || 'https://api.avax-test.network/ext/bc/C/rpc';

export const FUJI_EXPLORER_URL = 'https://testnet.snowtrace.io';
