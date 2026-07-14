import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useQueryClient } from '@tanstack/react-query';
import { formatEther } from 'viem';
import { AlertCircle, Users, ChevronRight, ExternalLink } from 'lucide-react';
import { JOB_BOARD_ABI, getContractAddress } from '../contracts.js';
import { useNetworkGuard } from '../hooks/useNetworkGuard.js';
import EmptyState from '../components/EmptyState.jsx';
import AmountDisplay from '../components/AmountDisplay.jsx';
import AddressDisplay from '../components/AddressDisplay.jsx';
import Notice from '../components/Notice.jsx';
import Button from '../components/Button.jsx';
import SkeletonCard from '../components/SkeletonCard.jsx';

const JOB_STATE_LABELS = { 0: 'Open', 1: 'Assigned', 2: 'Completed' };
const JOB_STATE_BADGES = {
  0: 'badge-pending',
  1: 'badge-delivered',
  2: 'badge-released',
};

const normalizeChecklist = (checklist) => {
  if (!checklist || typeof checklist !== 'object') {
    return { requiredPages: [], mustBeResponsive: false, mustHaveContactForm: false, extraNotes: '' };
  }
  const isTupleChecklist = Array.isArray(checklist) || Object.prototype.hasOwnProperty.call(checklist, 0);
  return {
    requiredPages: isTupleChecklist ? checklist[0] ?? [] : checklist.requiredPages ?? [],
    mustBeResponsive: isTupleChecklist ? checklist[1] ?? false : checklist.mustBeResponsive ?? false,
    mustHaveContactForm: isTupleChecklist ? checklist[2] ?? false : checklist.mustHaveContactForm ?? false,
    extraNotes: isTupleChecklist ? checklist[3] ?? '' : checklist.extraNotes ?? '',
  };
};

const normalizeJobResult = (res) => {
  if (!res || typeof res !== 'object') return null;
  const isTuple = Array.isArray(res) || Object.prototype.hasOwnProperty.call(res, 0);
  return {
    client: isTuple ? res[0] : res.client,
    checklist: normalizeChecklist(isTuple ? res[1] : res.checklist),
    specDocCID: isTuple ? res[2] : res.specDocCID,
    budgetMin: isTuple ? res[3] : res.budgetMin,
    budgetMax: isTuple ? res[4] : res.budgetMax,
    deadline: isTuple ? res[5] : res.deadline,
    state: isTuple ? res[6] : res.state,
    assignedFreelancer: isTuple ? res[7] : res.assignedFreelancer,
    escrowVault: isTuple ? res[8] : res.escrowVault,
  };
};

const normalizeBids = (result) => {
  if (!result) return [];
  return result.map((bid, index) => {
    const isTuple = Array.isArray(bid) || Object.prototype.hasOwnProperty.call(bid, 0);
    return {
      index,
      freelancer: isTuple ? bid[0] : bid.freelancer,
      amount: isTuple ? bid[1] : bid.amount,
      proposalCID: isTuple ? bid[2] : bid.proposalCID,
      estimatedDays: isTuple ? bid[3] : bid.estimatedDays,
      withdrawn: isTuple ? bid[4] : bid.withdrawn,
    };
  });
};

export default function MyBids() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { address, isConnected } = useAccount();
  const { canTransact } = useNetworkGuard();
  const [myBids, setMyBids] = useState([]);
  const [error, setError] = useState('');
  const [latestMessagesMap, setLatestMessagesMap] = useState({});

  useEffect(() => {
    if (!address) return;
    const fetchLatest = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'}/messages/latest?viewerAddress=${address}`);
        if (res.ok) {
          setLatestMessagesMap(await res.json());
        }
      } catch (err) {
        console.error('Failed to fetch latest messages map:', err);
      }
    };
    fetchLatest();
    const interval = setInterval(fetchLatest, 8000);
    return () => clearInterval(interval);
  }, [address]);

  const jobBoardAddress = getContractAddress('JobBoard');
  const { data: jobCountData } = useReadContract({
    address: jobBoardAddress,
    abi: JOB_BOARD_ABI,
    functionName: 'jobCounter',
    query: { enabled: isConnected && !!jobBoardAddress, refetchInterval: 10000 },
  });

  const count = jobCountData !== undefined ? Number(jobCountData) : 0;
  const jobCalls = Array.from({ length: count }, (_, i) => ({
    address: jobBoardAddress,
    abi: JOB_BOARD_ABI,
    functionName: 'jobs',
    args: [BigInt(i)],
  }));

  const { data: rawJobs, isLoading: jobsLoading } = useReadContracts({
    contracts: jobCalls,
    query: { enabled: isConnected && count > 0, refetchInterval: 10000 },
  });

  const bidCalls = Array.from({ length: count }, (_, i) => ({
    address: jobBoardAddress,
    abi: JOB_BOARD_ABI,
    functionName: 'getBids',
    args: [BigInt(i)],
  }));

  const { data: rawBids, isLoading: bidsLoading } = useReadContracts({
    contracts: bidCalls,
    query: { enabled: isConnected && count > 0, refetchInterval: 10000 },
  });

  const { writeContract, data: txHash, error: txError, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (!rawJobs || !rawBids || !address) return;

    const jobs = rawJobs
      .map((r, i) => {
        if (r?.status !== 'success' || !r?.result) return null;
        const normalized = normalizeJobResult(r.result);
        return {
          jobId: BigInt(i),
          client: normalized?.client ?? '0x0000000000000000000000000000000000000000',
          checklist: normalized?.checklist ?? { requiredPages: [], mustBeResponsive: false, mustHaveContactForm: false, extraNotes: '' },
          specDocCID: normalized?.specDocCID ?? '0x0000000000000000000000000000000000000000000000000000000000000000',
          budgetMin: normalized?.budgetMin ?? 0n,
          budgetMax: normalized?.budgetMax ?? 0n,
          deadline: normalized?.deadline ?? 0n,
          state: normalized?.state ?? 0n,
          assignedFreelancer: normalized?.assignedFreelancer ?? '0x0000000000000000000000000000000000000000',
          escrowVault: normalized?.escrowVault ?? '0x0000000000000000000000000000000000000000',
        };
      })
      .filter(Boolean);

    const bids = [];
    rawBids.forEach((r, i) => {
      if (r?.status !== 'success' || !r?.result) return;
      const job = jobs[i];
      if (!job) return;
      normalizeBids(r.result).forEach((bid) => {
        if (String(bid.freelancer).toLowerCase() === String(address).toLowerCase()) {
          bids.push({ ...bid, job });
        }
      });
    });

    setMyBids(bids);
  }, [rawJobs, rawBids, address]);

  useEffect(() => {
    if (isSuccess) {
      queryClient.invalidateQueries();
      setError('');
    }
  }, [isSuccess, queryClient]);

  useEffect(() => {
    if (txError) {
      setError(txError.message);
    }
  }, [txError]);

  const handleWithdraw = (jobId, bidIndex) => {
    if (!canTransact) return alert('Please switch to Avalanche Fuji Testnet before withdrawing a bid.');
    setError('');
    writeContract({
      address: jobBoardAddress,
      abi: JOB_BOARD_ABI,
      functionName: 'withdrawBid',
      args: [jobId, BigInt(bidIndex)],
    });
  };

  const isLoading = isPending || isConfirming;
  const pageLoading = jobsLoading || bidsLoading;

  // ── Not connected ─────────────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div className="page-wrapper">
        <EmptyState
          icon={AlertCircle}
          title="Connect Your Wallet"
          message="Connect to view jobs where you have active bids."
        />
      </div>
    );
  }

  return (
    <div className="page-wrapper">
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">My Bids</h1>
          <p className="page-subtitle">
            Track bids you submitted, withdraw open offers, and jump directly to escrow once a bid is accepted.
          </p>
        </div>
        <Button variant="secondary" onClick={() => navigate('/browse-jobs')}>
          Browse Jobs
        </Button>
      </div>

      {/* Error notice */}
      {error && (
        <Notice variant="danger" label="Transaction Error">
          {error}
        </Notice>
      )}

      {/* Loading skeleton */}
      {pageLoading && (
        <div className="flex flex-col" style={{ gap: '1rem' }}>
          <SkeletonCard height="120px" lines={3} />
          <SkeletonCard height="120px" lines={3} />
          <SkeletonCard height="120px" lines={3} />
        </div>
      )}

      {/* Empty state */}
      {!pageLoading && myBids.length === 0 && (
        <EmptyState
          icon={Users}
          title="No bids submitted yet"
          message="Once you place bids, this page will show the job status and let you withdraw open proposals."
          action={{ label: 'Browse Jobs', to: '/browse-jobs' }}
        />
      )}

      {/* Bids list */}
      {!pageLoading && myBids.length > 0 && (
        <div className="flex flex-col" style={{ gap: '1rem' }}>
          {myBids.map((entry) => {
            const jobStateNum = Number(entry.job.state);
            const isAccepted = entry.job.assignedFreelancer?.toLowerCase() === address?.toLowerCase();
            const hasVault =
              entry.job.escrowVault &&
              entry.job.escrowVault !== '0x0000000000000000000000000000000000000000';

            // Determine bid status label + badge class
            let bidStatusLabel = 'Pending';
            let bidStatusBadge = 'badge badge-pending';
            if (entry.withdrawn) {
              bidStatusLabel = 'Withdrawn';
              bidStatusBadge = 'badge badge-refunded';
            } else if (jobStateNum !== 0) {
              if (isAccepted) {
                bidStatusLabel = 'Accepted';
                bidStatusBadge = 'badge badge-released';
              } else {
                bidStatusLabel = 'Rejected';
                bidStatusBadge = 'badge badge-refunded';
              }
            }

            const latestMessageTime = latestMessagesMap[String(entry.job.jobId)];
            const storageKey = `escrowmind_last_viewed_${String(entry.job.jobId)}_${address?.toLowerCase()}`;
            const lastViewed = localStorage.getItem(storageKey);
            const isUnread = latestMessageTime && (!lastViewed || Number(lastViewed) < Number(latestMessageTime));

            return (
              <div
                key={`${String(entry.job.jobId)}-${entry.index}`}
                className="card card-hover"
                style={entry.withdrawn ? { opacity: 0.6 } : undefined}
              >
                {/* Card header row */}
                <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-700">Job</span>
                    <span className="mini-chip font-mono">#{String(entry.job.jobId)}</span>
                    {isUnread && (
                      <span 
                        className="chip chip-teal animate-pulse" 
                        style={{ 
                          background: 'var(--accent-primary)', 
                          color: 'white', 
                          padding: '2px 6px', 
                          fontSize: '10px', 
                          borderRadius: '10px', 
                          boxShadow: '0 0 8px var(--accent-primary)' 
                        }}
                      >
                        New message
                      </span>
                    )}
                    <span className={`badge ${JOB_STATE_BADGES[jobStateNum] ?? 'badge-refunded'}`}>
                      {JOB_STATE_LABELS[jobStateNum] ?? 'Unknown'}
                    </span>
                  </div>
                  <span className={bidStatusBadge}>{bidStatusLabel}</span>
                </div>

                {/* Main content */}
                <div className="flex justify-between gap-4 flex-wrap">
                  <div className="flex flex-col gap-4" style={{ flex: '1 1 300px' }}>
                    {/* Bid amount */}
                    <div>
                      <div className="section-label mb-2">Your Bid Amount</div>
                      <AmountDisplay wei={entry.amount} size="lg" chip />
                    </div>

                    {/* Meta chips */}
                    <div className="chip-row">
                      <span className="chip">{String(entry.estimatedDays)} days</span>
                      {entry.proposalCID && (
                        <span className="mini-chip font-mono">
                          {entry.proposalCID.slice(0, 12)}…
                        </span>
                      )}
                    </div>

                    {/* Freelancer address */}
                    <AddressDisplay address={entry.freelancer} label="Freelancer:" />
                  </div>

                  {/* Actions column */}
                  <div className="flex flex-col gap-2" style={{ minWidth: 154 }}>
                    <Link
                      to={`/jobs/${String(entry.job.jobId)}`}
                      className="btn btn-outline btn-sm"
                    >
                      View Job <ChevronRight size={13} />
                    </Link>

                    {jobStateNum === 1 && isAccepted && hasVault && (
                      <Link
                        to={`/escrow/${entry.job.escrowVault}`}
                        className="btn btn-value btn-sm"
                      >
                        Escrow Vault <ExternalLink size={13} />
                      </Link>
                    )}

                    {jobStateNum === 0 && !entry.withdrawn && (
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={isLoading}
                        onClick={() => handleWithdraw(entry.job.jobId, entry.index)}
                        disabled={isLoading || !canTransact}
                      >
                        Withdraw Bid
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
