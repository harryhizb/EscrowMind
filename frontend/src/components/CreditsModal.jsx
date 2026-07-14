import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useQueryClient } from '@tanstack/react-query';
import { X, Zap, Gift, Calendar, CircleDollarSign, CheckCircle, AlertCircle } from 'lucide-react';
import { parseEther } from 'viem';
import { CREDIT_MANAGER_ABI, getContractAddress } from '../contracts.js';
import { useNetworkGuard } from '../hooks/useNetworkGuard.js';

export default function CreditsModal({ onClose }) {
  const { address, isConnected } = useAccount();
  const { canTransact } = useNetworkGuard();
  const queryClient = useQueryClient();
  const [avaxAmount, setAvaxAmount] = useState('0.01');
  const [timeRemaining, setTimeRemaining] = useState('');

  // ── Contract Reads ─────────────────────────────────────────────────────────
  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: getContractAddress('CreditManager'),
    abi: CREDIT_MANAGER_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: hasClaimedStarter, refetch: refetchStarter } = useReadContract({
    address: getContractAddress('CreditManager'),
    abi: CREDIT_MANAGER_ABI,
    functionName: 'hasClaimedStarter',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: lastHourlyClaim } = useReadContract({
    address: getContractAddress('CreditManager'),
    abi: CREDIT_MANAGER_ABI,
    functionName: 'lastHourlyClaim',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: hourlyCooldown } = useReadContract({
    address: getContractAddress('CreditManager'),
    abi: CREDIT_MANAGER_ABI,
    functionName: 'HOURLY_CLAIM_COOLDOWN',
  });

  const { data: rate } = useReadContract({
    address: getContractAddress('CreditManager'),
    abi: CREDIT_MANAGER_ABI,
    functionName: 'creditsPerAvax',
  });

  // ── Contract Writes ────────────────────────────────────────────────────────
  const { writeContract, data: txHash, isPending, isError: isWriteError, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess, isError: isReceiptError, error: receiptError } = useWaitForTransactionReceipt({ hash: txHash });

  const activeError = writeError || receiptError;
  const isErr = isWriteError || isReceiptError;

  // Refresh on success
  useEffect(() => {
    if (isSuccess) {
      queryClient.invalidateQueries();
      refetchBalance();
      refetchStarter();
    }
  }, [isSuccess, queryClient, refetchBalance, refetchStarter]);

  // Hourly cooldown countdown (with 60-second safety buffer for block clock drift)
  useEffect(() => {
    if (!lastHourlyClaim || Number(lastHourlyClaim) === 0) {
      setTimeRemaining('');
      return;
    }
    const interval = setInterval(() => {
      const last = Number(lastHourlyClaim) * 1000;
      // Add a 60-second safety buffer to prevent clicking before the block timestamp catches up
      const next = last + Number(hourlyCooldown ?? 3600) * 1000 + 60000;
      const diff = next - Date.now();

      if (diff <= 0) {
        setTimeRemaining('');
        clearInterval(interval);
      } else {
        const hrs = Math.floor(diff / (3600 * 1000));
        const mins = Math.floor((diff % (3600 * 1000)) / (60 * 1000));
        const secs = Math.floor((diff % (60 * 1000)) / 1000);
        setTimeRemaining(`${hrs}h ${mins}m ${secs}s`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lastHourlyClaim, hourlyCooldown]);

  const rateMultiplier = rate ? Number(rate) : 500;
  const creditsComputed = parseFloat(avaxAmount || 0) * rateMultiplier;
  // Show real on-chain balance only — no fake +10 bonus
  const shownBalance = balance !== undefined ? Number(balance) : 0;

  const claimStarter = () => {
    if (!canTransact) return alert('Please switch to Avalanche Fuji Testnet before claiming credits.');
    writeContract({ address: getContractAddress('CreditManager'), abi: CREDIT_MANAGER_ABI, functionName: 'claimStarterCredits' });
  };

  const claimHourly = () => {
    if (!canTransact) return alert('Please switch to Avalanche Fuji Testnet before claiming credits.');
    writeContract({ address: getContractAddress('CreditManager'), abi: CREDIT_MANAGER_ABI, functionName: 'claimHourlyTask' });
  };

  const buyCredits = () => {
    if (!canTransact) return alert('Please switch to Avalanche Fuji Testnet before buying credits.');
    writeContract({ address: getContractAddress('CreditManager'), abi: CREDIT_MANAGER_ABI, functionName: 'purchaseCredits', value: parseEther(avaxAmount || '0') });
  };

  return createPortal(
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel" style={{ maxWidth: 540 }}>
        {/* Header */}
        <div className="modal-header">
          <div className="flex items-center gap-3">
            <div className="stat-card-icon">
              <Zap size={18} />
            </div>
            <div>
              <h2 className="modal-title">Platform Credits</h2>
              <p className="text-sm text-muted mt-2" style={{ marginTop: 2 }}>
                Spam-prevention connects — required to post jobs and submit bids.
              </p>
            </div>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Balance display */}
        <div className="card card-sm" style={{ textAlign: 'center', borderColor: 'var(--border-accent)' }}>
          <p className="text-xs text-dim" style={{ textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
            Your Balance
          </p>
          <div className="flex items-center justify-center gap-3" style={{ marginBottom: 4 }}>
            <Zap size={24} color="var(--accent-primary)" />
            <span style={{ fontSize: '2.4rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
              {isConnected ? shownBalance : '—'}
            </span>
          </div>
          <p className="text-xs text-dim">Credits</p>
        </div>

        {/* Status notices */}
        {isSuccess && (
          <div className="notice notice-success fade-in">
            <CheckCircle size={15} className="notice-icon" />
            <div className="notice-content">
              <span className="notice-label">Confirmed</span>
              <span className="notice-body">Transaction confirmed! Balance syncing…</span>
            </div>
          </div>
        )}

        {isErr && (
          <div className="notice notice-danger fade-in">
            <AlertCircle size={15} className="notice-icon" />
            <div className="notice-content">
              <span className="notice-label">Transaction Failed</span>
              <span className="notice-body">{activeError?.shortMessage || activeError?.message || 'Transaction failed'}</span>
            </div>
          </div>
        )}

        {/* Claim Starter */}
        {isConnected && !hasClaimedStarter && (
          <div className="card card-sm" style={{ borderStyle: 'dashed', borderColor: 'var(--border-accent)' }}>
            <div className="flex gap-3 items-start">
              <div className="stat-card-icon" style={{ flexShrink: 0 }}>
                <Gift size={16} />
              </div>
              <div className="flex-1">
                <p className="font-600" style={{ marginBottom: 4 }}>Claim 10 Starter Credits</p>
                <p className="text-sm text-muted" style={{ marginBottom: 12, lineHeight: 1.5 }}>
                  Free connects for new accounts to post a job or submit bids.
                </p>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={claimStarter}
                  disabled={isPending || isConfirming || !canTransact}
                >
                  {isPending || isConfirming ? 'Confirming…' : 'Claim Starter Credits'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Hourly task */}
        <div className="card card-sm">
          <div className="flex gap-3 items-start">
            <div className="stat-card-icon" style={{ flexShrink: 0 }}>
              <Calendar size={16} />
            </div>
            <div className="flex-1">
              <p className="font-600" style={{ marginBottom: 4 }}>Hourly Task Check-in</p>
              <p className="text-sm text-muted" style={{ marginBottom: 12, lineHeight: 1.5 }}>
                Earn 1 free credit per hour — stand-in for skill tasks and community rewards.
              </p>
              {timeRemaining ? (
                <button className="btn btn-secondary btn-sm" disabled>
                  Cooldown: {timeRemaining}
                </button>
              ) : (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={claimHourly}
                  disabled={isPending || isConfirming || !canTransact}
                >
                  {isPending || isConfirming ? 'Confirming…' : 'Claim +1 Credit'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Buy credits */}
        <div className="card card-sm">
          <div className="flex gap-3 items-start" style={{ marginBottom: 12 }}>
            <div className="stat-card-icon" style={{ flexShrink: 0, background: 'var(--accent-value-dim)', borderColor: 'var(--accent-value-border)', color: 'var(--accent-value)' }}>
              <CircleDollarSign size={16} />
            </div>
            <div>
              <p className="font-600" style={{ marginBottom: 2 }}>Buy Connects</p>
              <p className="text-xs text-dim">
                Fuji testnet AVAX only · Rate: {rateMultiplier} credits / 1 AVAX
              </p>
            </div>
          </div>
          <div className="flex gap-3 items-start">
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                className="form-input"
                type="number"
                step="0.001"
                min="0.001"
                value={avaxAmount}
                onChange={(e) => setAvaxAmount(e.target.value)}
                style={{ paddingRight: '3.5rem' }}
                aria-label="AVAX amount"
              />
              <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                AVAX
              </span>
            </div>
            <button
              className="btn btn-value"
              onClick={buyCredits}
              disabled={isPending || isConfirming || !canTransact || Number(avaxAmount) <= 0}
            >
              Buy {Number.isFinite(creditsComputed) ? creditsComputed.toFixed(0) : '0'} Credits
            </button>
          </div>
          <p className="text-xs text-dim mt-3" style={{ textAlign: 'center' }}>
            Fuji testnet only — do not use mainnet funds
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
