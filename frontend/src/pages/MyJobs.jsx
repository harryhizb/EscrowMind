import { useState, useEffect, useMemo } from 'react';
import { useReadContract, useReadContracts, useAccount } from 'wagmi';
import { formatEther } from 'viem';
import {
  AlertCircle, Briefcase, Clock, DollarSign, CheckSquare,
  ChevronRight, PlusCircle, Users
} from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import { JOB_BOARD_ABI, getContractAddress } from '../contracts.js';
import EmptyState from '../components/EmptyState.jsx';
import AmountDisplay from '../components/AmountDisplay.jsx';
import AddressDisplay from '../components/AddressDisplay.jsx';
import Button from '../components/Button.jsx';
import SkeletonCard from '../components/SkeletonCard.jsx';
import { bytes32ToCid } from '../utils/cid.js';
import { parseOnChainNotes } from '../utils/cid.js';

const JOB_STATE_LABELS = { 0: 'Open', 1: 'Assigned', 2: 'Completed' };
const JOB_STATE_COLORS = {
  0: 'badge-pending',
  1: 'badge-delivered',
  2: 'badge-released',
};

// ─── Mini job card for dashboard ─────────────────────────────────────────────
function DashboardJobCard({ job, bids, latestMessageTime }) {
  const { address } = useAccount();
  const navigate = useNavigate();
  const isOpen = Number(job.state) === 0;
  const isAssigned = Number(job.state) === 1;
  const daysLeft = Math.max(0, Math.ceil((Number(job.deadline) - Date.now() / 1000) / 86400));

  const safeFormat = (v) => (v !== undefined && v !== null) ? formatEther(v) : '—';

  const deadlineDate = Number(job.deadline)
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(Number(job.deadline) * 1000))
    : '—';

  const hasVault =
    isAssigned &&
    job.escrowVault &&
    job.escrowVault !== '0x0000000000000000000000000000000000000000';

  const storageKey = `escrowmind_last_viewed_${String(job.jobId)}_${address?.toLowerCase()}`;
  const lastViewed = localStorage.getItem(storageKey);
  const isUnread = latestMessageTime && (!lastViewed || Number(lastViewed) < Number(latestMessageTime));

  const [metadata, setMetadata] = useState(null);

  useEffect(() => {
    if (!job.specDocCID || job.specDocCID === '0x0000000000000000000000000000000000000000000000000000000000000000') return;
    let active = true;
    const fetchMetadata = async () => {
      try {
        const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');
        const res = await fetch(`${BACKEND_URL}/metadata/${job.specDocCID}`);
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        if (active) setMetadata(data);
      } catch (err) {
        console.error('Failed to fetch metadata in DashboardJobCard:', err);
      }
    };
    fetchMetadata();
    return () => { active = false; };
  }, [job.specDocCID]);

  const getJobTitleLocal = (j) => {
    const pages = j.checklist?.requiredPages ?? [];
    if (pages.length > 0) return `Build ${pages.slice(0, 3).map((page) => `/${page}`).join(', ')}`;
    return `Job #${String(j.jobId)}`;
  };

  const onChainData = useMemo(() => {
    return parseOnChainNotes(job.checklist?.extraNotes || "", getJobTitleLocal(job));
  }, [job]);

  const displayTitle = (metadata && !metadata.isRestored) ? metadata.title : onChainData.title;
  const displayDescription = metadata?.description || onChainData.description || onChainData.notes || '';

  return (
    <div className="card card-hover">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-700">Job</span>
          <span className="mini-chip font-mono">#{String(job.jobId)}</span>
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
          <span className={`badge ${JOB_STATE_COLORS[Number(job.state)] ?? 'badge-pending'}`}>
            {JOB_STATE_LABELS[Number(job.state)] ?? 'Unknown'}
          </span>
        </div>
        {bids !== undefined && (
          <span className="chip">
            <Users size={12} /> {bids.length} bid{bids.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Title */}
      <h3 className="text-lg font-600 mb-2">{displayTitle}</h3>

      {/* Description */}
      {displayDescription && (
        <p className="text-secondary text-sm mb-4" style={{ lineHeight: 1.6 }}>
          {displayDescription}
        </p>
      )}

      {/* Required pages chips */}
      {job.checklist?.requiredPages?.length > 0 && (
        <div className="chip-row mb-4">
          {job.checklist.requiredPages.map(p => (
            <span key={p} className="mini-chip">/{p}</span>
          ))}
        </div>
      )}

      {/* Flags */}
      {(job.checklist?.mustBeResponsive || job.checklist?.mustHaveContactForm) && (
        <div className="chip-row mb-4">
          {job.checklist.mustBeResponsive && <span className="chip chip-teal">✓ Responsive</span>}
          {job.checklist.mustHaveContactForm && <span className="chip chip-teal">✓ Contact Form</span>}
        </div>
      )}

      {/* Stats row */}
      <div className="flex flex-wrap gap-4 mb-4" style={{ gap: '1rem' }}>
        <div>
          <div className="section-label mb-1">Budget</div>
          <AmountDisplay wei={job.budgetMin} size="sm" />
          <span className="text-muted text-sm"> – </span>
          <AmountDisplay wei={job.budgetMax} size="sm" />
        </div>
        <div>
          <div className="section-label mb-1">Deadline</div>
          <span className="flex items-center gap-1 text-sm">
            <Clock size={13} /> {deadlineDate} ({daysLeft}d left)
          </span>
        </div>
      </div>

      {/* Assigned freelancer */}
      {isAssigned && job.assignedFreelancer && job.assignedFreelancer !== '0x0000000000000000000000000000000000000000' && (
        <div className="mb-4">
          <AddressDisplay address={job.assignedFreelancer} label="Assigned to:" />
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 items-center">
        <Link
          to={`/jobs/${String(job.jobId)}`}
          className="btn btn-outline btn-sm"
        >
          View Job <ChevronRight size={14} />
        </Link>

        {isOpen && bids && bids.length > 0 && (
          <Link
            to={`/my-jobs/${String(job.jobId)}/bids`}
            className="btn btn-outline btn-sm"
          >
            View Bids ({bids.length}) <ChevronRight size={14} />
          </Link>
        )}

        {isOpen && (!bids || bids.length === 0) && (
          <span className="text-muted text-sm">No bids yet</span>
        )}

        {hasVault && (
          <Link
            to={`/escrow/${job.escrowVault}`}
            className="btn btn-value btn-sm"
          >
            Escrow Vault <ChevronRight size={14} />
          </Link>
        )}
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function MyJobs() {
  const navigate = useNavigate();
  const { address, isConnected } = useAccount();
  const jobBoardAddr = getContractAddress('JobBoard');

  const [myJobs, setMyJobs] = useState([]);
  const [bidsMap, setBidsMap] = useState({});
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

  // 1. Read total count
  const { data: jobCount, isLoading: countLoading } = useReadContract({
    address: jobBoardAddr,
    abi: JOB_BOARD_ABI,
    functionName: 'jobCounter',
    query: { enabled: isConnected && !!jobBoardAddr, refetchInterval: 12000 },
  });

  const count = jobCount !== undefined ? Number(jobCount) : 0;

  // 2. Batch-read all jobs
  const jobCalls = Array.from({ length: count }, (_, i) => ({
    address: jobBoardAddr,
    abi: JOB_BOARD_ABI,
    functionName: 'jobs',
    args: [BigInt(i)],
  }));

  const { data: rawJobs, isLoading: jobsLoading } = useReadContracts({
    contracts: jobCalls,
    query: { enabled: count > 0 && isConnected, refetchInterval: 12000 },
  });

  // 3. Parse and filter to my address
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
    if (!isTuple) {
      return {
        client: res.client,
        checklist: normalizeChecklist(res.checklist),
        specDocCID: bytes32ToCid(res.specDocCID),
        budgetMin: res.budgetMin,
        budgetMax: res.budgetMax,
        deadline: res.deadline,
        state: res.state,
        assignedFreelancer: res.assignedFreelancer,
        escrowVault: res.escrowVault,
      };
    }
    return {
      client: res[0],
      checklist: normalizeChecklist(res[1]),
      specDocCID: bytes32ToCid(res[2]),
      budgetMin: res[3],
      budgetMax: res[4],
      deadline: res[5],
      state: res[6],
      assignedFreelancer: res[7],
      escrowVault: res[8],
    };
  };

  useEffect(() => {
    if (!rawJobs || !address) return;
    const mine = rawJobs
      .map((r, i) => {
        if (r.status !== 'success' || !r.result) return null;
        const res = r.result;
        const normalized = normalizeJobResult(res);

        return {
          jobId: BigInt(i),
          client: normalized?.client ?? '',
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
      .filter(j => j && j.client?.toLowerCase() === address?.toLowerCase());
    setMyJobs(mine);
  }, [rawJobs, address]);

  // 4. Batch-read bids for my jobs
  const bidCalls = myJobs.map(j => ({
    address: jobBoardAddr,
    abi: JOB_BOARD_ABI,
    functionName: 'getBids',
    args: [j.jobId],
  }));

  const { data: rawBids } = useReadContracts({
    contracts: bidCalls,
    query: { enabled: myJobs.length > 0, refetchInterval: 12000 },
  });

  useEffect(() => {
    if (!rawBids) return;
    const map = {};
    rawBids.forEach((r, i) => {
      if (r.status === 'success') {
        map[String(myJobs[i].jobId)] = r.result ?? [];
      }
    });
    setBidsMap(map);
  }, [rawBids, myJobs]);

  const isLoading = countLoading || jobsLoading;
  const openJobs = myJobs.filter(j => Number(j.state) === 0);
  const activeJobs = myJobs.filter(j => Number(j.state) === 1);
  const closedJobs = myJobs.filter(j => Number(j.state) === 2);
  const totalBids = Object.values(bidsMap).reduce((s, b) => s + b.length, 0);

  // ── Not connected ──────────────────────────────────────────────────────────
  if (!isConnected) {
    return (
      <div className="page-wrapper">
        <EmptyState
          icon={AlertCircle}
          title="Connect Your Wallet"
          message="Please connect your wallet to view your jobs and escrows."
        />
      </div>
    );
  }

  return (
    <div className="page-wrapper">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">My Posted Jobs</h1>
          <p className="page-subtitle">
            <AddressDisplay address={address} label="Wallet:" />
          </p>
        </div>
        <Button variant="primary" onClick={() => navigate('/post-job')} icon={PlusCircle}>
          Post New Job
        </Button>
      </div>

      {/* Stats strip */}
      {myJobs.length > 0 && (
        <div className="stats-grid mb-4">
          {[
            { label: 'Total Jobs', value: myJobs.length, icon: <Briefcase size={20} /> },
            { label: 'Open', value: openJobs.length, icon: <Clock size={20} /> },
            { label: 'Assigned', value: activeJobs.length, icon: <CheckSquare size={20} /> },
            { label: 'Total Bids', value: totalBids, icon: <Users size={20} /> },
          ].map(stat => (
            <div key={stat.label} className="stat-card">
              <div className="stat-card-icon">{stat.icon}</div>
              <div className="stat-card-value">{stat.value}</div>
              <div className="stat-card-label">{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="flex flex-col" style={{ gap: '1rem' }}>
          <SkeletonCard height="160px" lines={3} />
          <SkeletonCard height="160px" lines={3} />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && myJobs.length === 0 && (
        <EmptyState
          icon={Briefcase}
          title="No jobs posted yet"
          message="Post your first job and get matched with vetted freelancers automatically."
          action={{ label: 'Post Your First Job', to: '/post-job' }}
        />
      )}

      {/* Open jobs */}
      {!isLoading && openJobs.length > 0 && (
        <section className="mb-4">
          <h2 className="section-label flex items-center gap-2 mb-4" style={{ fontSize: '1.05rem' }}>
            <Clock size={16} className="text-amber" /> Open Jobs
            <span className="mini-chip">{openJobs.length}</span>
          </h2>
          <div className="flex flex-col" style={{ gap: '1rem' }}>
            {openJobs.map(j => (
              <DashboardJobCard key={String(j.jobId)} job={j} bids={bidsMap[String(j.jobId)]} latestMessageTime={latestMessagesMap[String(j.jobId)]} />
            ))}
          </div>
        </section>
      )}

      {/* Assigned / Active jobs */}
      {!isLoading && activeJobs.length > 0 && (
        <section className="mb-4">
          <h2 className="section-label flex items-center gap-2 mb-4" style={{ fontSize: '1.05rem' }}>
            <CheckSquare size={16} className="text-teal" /> Active Escrows
            <span className="mini-chip">{activeJobs.length}</span>
          </h2>
          <div className="flex flex-col" style={{ gap: '1rem' }}>
            {activeJobs.map(j => (
              <DashboardJobCard key={String(j.jobId)} job={j} bids={bidsMap[String(j.jobId)]} latestMessageTime={latestMessagesMap[String(j.jobId)]} />
            ))}
          </div>
        </section>
      )}

      {/* Closed jobs */}
      {!isLoading && closedJobs.length > 0 && (
        <section className="mb-4" style={{ opacity: 0.75 }}>
          <h2 className="section-label flex items-center gap-2 mb-4" style={{ fontSize: '1.05rem' }}>
            <Briefcase size={16} /> Completed / Closed
            <span className="mini-chip">{closedJobs.length}</span>
          </h2>
          <div className="flex flex-col" style={{ gap: '1rem' }}>
            {closedJobs.map(j => (
              <DashboardJobCard key={String(j.jobId)} job={j} bids={bidsMap[String(j.jobId)]} latestMessageTime={latestMessagesMap[String(j.jobId)]} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
