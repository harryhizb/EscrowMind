import { useAccount, useSwitchChain } from 'wagmi';
import { FUJI_CHAIN_ID } from '../config/network.js';

/**
 * Returns Fuji network status and a switch helper.
 * canTransact is false unless the wallet is connected on chain 43113.
 */
export function useNetworkGuard() {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending: isSwitching, error: switchError } = useSwitchChain();

  const isWrongNetwork = isConnected && chainId !== FUJI_CHAIN_ID;
  const isCorrectNetwork = !isConnected || chainId === FUJI_CHAIN_ID;
  const canTransact = isConnected && chainId === FUJI_CHAIN_ID;

  const switchToFuji = () => {
    if (switchChain) {
      switchChain({ chainId: FUJI_CHAIN_ID });
    }
  };

  return {
    chainId,
    isConnected,
    isWrongNetwork,
    isCorrectNetwork,
    canTransact,
    switchToFuji,
    isSwitching,
    switchError,
    requiredChainId: FUJI_CHAIN_ID,
  };
}
