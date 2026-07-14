import { useParams } from 'react-router-dom';
import { useAccount, useReadContracts } from 'wagmi';
import { Trophy, AlertOctagon, Handshake, TrendingUp, Shield, AlertCircle } from 'lucide-react';
import { REPUTATION_SBT_ABI, getContractAddress } from '../contracts.js';
import AddressDisplay from '../components/AddressDisplay.jsx';
import SkeletonCard from '../components/SkeletonCard.jsx';
import Notice from '../components/Notice.jsx';

/* ─── ScoreGauge: SVG ring chart — logic untouched ─── */
function ScoreGauge({ score, label, color = 'var(--accent-primary)' }) {
  const pct = Math.max(0, Math.min(100, Number(score)));
  const circumference = 2 * Math.PI * 40;
  const dashOffset = circumference - (pct / 100) * circumference;

  return (
    <div className="text-center">
      <svg width={100} height={100} viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="50" cy="50" r="40" fill="none" stroke="var(--bg-subtle)" strokeWidth="8" />
        <circle
          cx="50" cy="50" r="40"
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <div style={{ marginTop: '-60px', fontFamily: 'Outfit, sans-serif', fontSize: '1.5rem', fontWeight: 700 }}>
        {String(score)}
      </div>
      <div className="text-muted text-sm" style={{ marginTop: '32px', fontWeight: 500 }}>
        {label}
      </div>
    </div>
  );
}

/* ─── StatCard: icon + value + label ─── */
function StatCard({ icon: Icon, value, label, variant = 'teal' }) {
  const iconClass = variant === 'danger' ? 'text-red' : variant === 'amber' ? 'text-amber' : 'text-teal';
  const bgStyle = variant === 'danger'
    ? { background: 'var(--accent-danger-dim)' }
    : variant === 'amber'
    ? { background: 'var(--accent-value-dim)' }
    : { background: 'var(--accent-primary-soft)' };

  return (
    <div className="card stat-card">
      <div className="stat-card-icon" style={bgStyle}>
        <Icon size={20} className={iconClass} />
      </div>
      <div className="stat-card-value">{String(value)}</div>
      <div className="stat-card-label">{label}</div>
    </div>
  );
}

export default function ReputationProfile() {
  const { address: routeAddress } = useParams();
  const { address: walletAddress } = useAccount();
  const target = routeAddress || walletAddress;

  const reputationSbtAddr = getContractAddress('ReputationSBT');

  // Read reputation info from blockchain
  const { data: repData, isLoading: repLoading } = useReadContracts({
    contracts: [
      { address: reputationSbtAddr, abi: REPUTATION_SBT_ABI, functionName: 'hasPassport', args: [target] },
      { address: reputationSbtAddr, abi: REPUTATION_SBT_ABI, functionName: 'passportOf', args: [target] },
      { address: reputationSbtAddr, abi: REPUTATION_SBT_ABI, functionName: 'freelancerScore', args: [target] },
      { address: reputationSbtAddr, abi: REPUTATION_SBT_ABI, functionName: 'freelancerJobsCompleted', args: [target] },
      { address: reputationSbtAddr, abi: REPUTATION_SBT_ABI, functionName: 'freelancerJobsFailed', args: [target] },
      { address: reputationSbtAddr, abi: REPUTATION_SBT_ABI, functionName: 'clientScore', args: [target] },
      { address: reputationSbtAddr, abi: REPUTATION_SBT_ABI, functionName: 'clientMilestonesReleased', args: [target] },
      { address: reputationSbtAddr, abi: REPUTATION_SBT_ABI, functionName: 'clientDisputesLost', args: [target] },
    ],
    query: {
      enabled: !!target && !!reputationSbtAddr,
      refetchInterval: 5000,
    }
  });

  if (!target) {
    return (
      <div className="page-wrapper">
        <Notice variant="warning" label="Wallet not connected">
          Connect your wallet to view your on-chain reputation profile.
        </Notice>
      </div>
    );
  }

  if (repLoading) {
    return (
      <div className="page-wrapper">
        <SkeletonCard height="200px" lines={3} />
        <div className="four-col-grid mt-4">
          <SkeletonCard height="100px" lines={1} />
          <SkeletonCard height="100px" lines={1} />
          <SkeletonCard height="100px" lines={1} />
          <SkeletonCard height="100px" lines={1} />
        </div>
        <SkeletonCard height="220px" lines={4} />
      </div>
    );
  }

  const hasPassport = repData?.[0]?.result ?? false;
  const passportId = repData?.[1]?.result ? Number(repData[1].result) : null;
  const freelancerScore = repData?.[2]?.result !== undefined ? Number(repData[2].result) : 0;
  const freelancerJobsCompleted = repData?.[3]?.result !== undefined ? Number(repData[3].result) : 0;
  const freelancerJobsFailed = repData?.[4]?.result !== undefined ? Number(repData[4].result) : 0;
  const clientScore = repData?.[5]?.result !== undefined ? Number(repData[5].result) : 0;
  const clientMilestonesReleased = repData?.[6]?.result !== undefined ? Number(repData[6].result) : 0;
  const clientDisputesLost = repData?.[7]?.result !== undefined ? Number(repData[7].result) : 0;

  return (
    <div className="page-wrapper">

      {/* ── Reputation Header Card ── */}
      <div className="card card-lg mb-4" style={{ background: 'linear-gradient(135deg, var(--accent-primary-soft) 0%, var(--bg-elevated) 100%)', borderColor: 'var(--border-accent)' }}>
        <div className="flex justify-between items-start flex-wrap gap-4 reputation-header-flex">

          {/* Left: avatar + address + passport badge */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              {/* Avatar */}
              <div
                className="reputation-avatar shrink-0"
                style={{
                  width: 52, height: 52, borderRadius: '50%',
                  background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-value))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.2rem', fontWeight: 700, color: '#fff',
                  fontFamily: 'Outfit, sans-serif',
                }}
              >
                {target.slice(2, 4).toUpperCase()}
              </div>

              {/* Address */}
              <div className="flex flex-col gap-2">
                <AddressDisplay address={target} label="" />
                {hasPassport && (
                  <span className="text-xs text-muted">Passport minted</span>
                )}
              </div>
            </div>

            {/* Passport chip */}
            {hasPassport ? (
              <span className="chip chip-teal" style={{ width: 'fit-content' }}>
                <Shield size={12} /> Soulbound Passport #{passportId}
              </span>
            ) : (
              <span className="chip" style={{ width: 'fit-content' }}>
                <AlertCircle size={12} /> No passport minted yet
              </span>
            )}
          </div>

          {/* Right: Score Gauges */}
          <div className="flex gap-4 items-center flex-wrap justify-center">
            <ScoreGauge score={freelancerScore} label="Freelancer Score" color="var(--accent-primary)" />
            <ScoreGauge score={clientScore} label="Client Score" color="var(--accent-value)" />
          </div>
        </div>
      </div>

      {/* ── Stats Grid ── */}
      <div className="four-col-grid mb-4">
        <StatCard icon={Trophy} value={freelancerJobsCompleted} label="Jobs Completed" variant="teal" />
        <StatCard icon={AlertOctagon} value={freelancerJobsFailed} label="Disputes Lost (F)" variant="danger" />
        <StatCard icon={Handshake} value={clientMilestonesReleased} label="Milestones Released" variant="teal" />
        <StatCard icon={AlertOctagon} value={clientDisputesLost} label="Disputes Lost (C)" variant="danger" />
      </div>

      {/* ── Reputation Explanation ── */}
      <div className="card">
        <h2 className="flex items-center gap-2 font-600 mb-4" style={{ fontSize: '1.05rem' }}>
          <TrendingUp size={18} className="text-teal" />
          How Reputation is Scored
        </h2>

        <Notice variant="info" label="On-chain &amp; fully transparent">
          All scores are stored directly on the EscrowMind Soulbound Passport (ERC-721) — immutable and controlled only by smart contracts.
        </Notice>

        <div className="kv-list mt-4">
          <div className="kv-row">
            <span className="kv-key">Freelancer score</span>
            <span className="kv-value text-sm" style={{ lineHeight: 1.6 }}>
              +10 per milestone auto-released (score ≥ 90%), +5 per client-released milestone, −20 per dispute lost, −5 per timeout refund triggered.
            </span>
          </div>
          <div className="kv-row">
            <span className="kv-key">Client score</span>
            <span className="kv-value text-sm" style={{ lineHeight: 1.6 }}>
              +5 per milestone released (auto or manual), −10 per dispute lost.
            </span>
          </div>
          <div className="kv-row">
            <span className="kv-key">Soulbound</span>
            <span className="kv-value text-sm" style={{ lineHeight: 1.6 }}>
              Passport tokens cannot be transferred — your reputation follows your wallet address, not whoever holds the NFT.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
