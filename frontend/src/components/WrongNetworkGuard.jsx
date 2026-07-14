import { AlertTriangle, Loader } from 'lucide-react';
import { useNetworkGuard } from '../hooks/useNetworkGuard.js';

/**
 * WrongNetworkGuard — blocking banner when wallet is not on Avalanche Fuji (43113).
 * Visual-only rebuild; all guard logic (useNetworkGuard) is untouched.
 */
export default function WrongNetworkGuard() {
  const {
    isConnected,
    isWrongNetwork,
    chainId,
    switchToFuji,
    isSwitching,
    requiredChainId,
  } = useNetworkGuard();

  if (!isConnected || !isWrongNetwork) return null;

  return (
    <>
      <div className="wrong-network-banner" role="alert" aria-live="assertive">
        <div className="wrong-network-content">
          <AlertTriangle size={20} aria-hidden="true" style={{ flexShrink: 0 }} />
          <div className="wrong-network-text">
            <strong>Wrong Network — Switch to Avalanche Fuji Testnet</strong>
            <p>
              Connected to chain ID {chainId ?? 'unknown'}. EscrowMind only runs on
              Fuji (chain ID {requiredChainId}). Real AVAX on mainnet must not be used here.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm wrong-network-switch"
            onClick={switchToFuji}
            disabled={isSwitching}
          >
            {isSwitching ? (
              <>
                <Loader size={14} className="spinner" aria-hidden="true" />
                Switching…
              </>
            ) : (
              'Switch Network'
            )}
          </button>
        </div>
      </div>

      <div className="wrong-network-overlay" aria-hidden="true" />
    </>
  );
}
