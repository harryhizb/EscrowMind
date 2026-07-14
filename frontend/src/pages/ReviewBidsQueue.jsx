import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccount, useReadContract, useReadContracts } from 'wagmi';
import { formatEther } from 'viem';
import { AlertCircle, Briefcase, ChevronRight, Clock, Users } from 'lucide-react';
import { JOB_BOARD_ABI, getContractAddress } from '../contracts.js';
import EmptyState from '../components/EmptyState.jsx';
import AmountDisplay from '../components/AmountDisplay.jsx';
import SkeletonCard from '../components/SkeletonCard.jsx';
import Notice from '../components/Notice.jsx';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const JOB_STATE_LABELS = { 0: 'Open', 1: 'Assigned', 2: 'Closed' };

function normalizeChecklist(checklist) {
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
}

function normalizeJobResult(res) {
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
}

function normalizeBid(bid, index) {
  const isTuple = Array.isArray(bid) || Object.prototype.hasOwnProperty.call(bid, 0);
  return {
    index,
    freelancer: isTuple ? bid[0] : bid.freelancer,
    amount: isTuple ? bid[1] : bid.amount,
    proposalCID: isTuple ? bid[2] : bid.proposalCID,
    estimatedDays: isTuple ? bid[3] : bid.estimatedDays,
    withdrawn: isTuple ? bid[4] : bid.withdrawn,
  };
}

function getJobTitle(job) {
  const pages = job.checklist?.requiredPages ?? [];
  if (pages.length > 0) return `Build ${pages.slice(0, 3).map((page) => `/${page}`).join(', ')}`;
  return `Job #${String(job.jobId)}`;
}

export default function ReviewBidsQueue() {
  const { address, isConnected } = useAccount();
  const [jobs, setJobs] = useState([]);
  const jobBoardAddress = getContractAddress('JobBoard');

  const { data: jobCount, isLoading: countLoading } = useReadContract({
    address: jobBoardAddress,
    abi: JOB_BOARD_ABI,
    functionName: 'jobCounter',
    query: { enabled: isConnected && !!jobBoardAddress, refetchInterval: 10000 },
  });

  const count = jobCount !== undefined ? Number(jobCount) : 0;
  const jobCalls = useMemo(() => Array.from({ length: count }, (_, index) => ({
    address: jobBoardAddress,
    abi: JOB_BOARD_ABI,
    functionName: 'jobs',
    args: [BigInt(index)],
  })), [count, jobBoardAddress]);
  const bidCalls = useMemo(() => Array.from({ length: count }, (_, index) => ({
    address: jobBoardAddress,
    abi: JOB_BOARD_ABI,
    functionName: 'getBids',
    args: [BigInt(index)],
  })), [count, jobBoardAddress]);

  const { data: rawJobs, isLoading: jobsLoading } = useReadContracts({
    contracts: jobCalls,
    query: { enabled: isConnected && count > 0, refetchInterval: 10000 },
  });
  const { data: rawBids, isLoading: bidsLoading } = useReadContracts({
    contracts: bidCalls,
    query: { enabled: isConnected && count > 0, refetchInterval: 10000 },
  });

  useEffect(() => {
    if (!rawJobs || !address) return;
    const parsed = rawJobs
      .map((result, index) => {
        if (result.status !== 'success' || !result.result) return null;
        const normalized = normalizeJobResult(result.result);
        const bids = (rawBids?.[index]?.result ?? []).map(normalizeBid).filter((bid) => !bid.withdrawn);
        return {
          jobId: BigInt(index),
          client: normalized?.client ?? ZERO_ADDRESS,
          checklist: normalized?.checklist ?? { requiredPages: [], mustBeResponsive: false, mustHaveContactForm: false, extraNotes: '' },
          budgetMin: normalized?.budgetMin ?? 0n,
          budgetMax: normalized?.budgetMax ?? 0n,
          deadline: normalized?.deadline ?? 0n,
          state: normalized?.state ?? 0n,
          assignedFreelancer: normalized?.assignedFreelancer ?? ZERO_ADDRESS,
          escrowVault: normalized?.escrowVault ?? ZERO_ADDRESS,
          bids,
        };
      })
      .filter((job) => job && job.client?.toLowerCase() === address.toLowerCase() && Number(job.state) === 0 && job.bids.length > 0);
    setJobs(parsed);
  }, [rawJobs, rawBids, address]);

  const isLoading = countLoading || jobsLoading || bidsLoading;

  if (!isConnected) {
    return (
      <div className="page-wrapper">
        <Notice variant="warning" label="Wallet not connected">
          Connect as a client to review pending bids on your posted jobs.
        </Notice>
      </div>
    );
  }

  return (
    <div className="page-wrapper">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <p className="eyebrow">Client Dashboard</p>
          <h1 className="page-title">Review Bids</h1>
          <p className="page-subtitle">
            Select the best proposals from freelancers who have bid on your posted jobs.
          </p>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-col gap-2">
          <SkeletonCard height="120px" lines={2} />
          <SkeletonCard height="120px" lines={2} />
          <SkeletonCard height="120px" lines={2} />
        </div>
      )}

      {/* Empty */}
      {!isLoading && jobs.length === 0 && (
        <EmptyState
          icon={Users}
          title="No jobs with pending bids"
          message="When freelancers submit bids on your open jobs, they will appear here for you to review and compare."
        />
      )}

      {/* Jobs list */}
      {!isLoading && jobs.length > 0 && (
        <div className="flex flex-col gap-2">
          {jobs.map((job) => (
            <article key={String(job.jobId)} className="card card-hover">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex flex-col gap-2 min-w-0 flex-1">
                  {/* Top row: badge + bid chip */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="badge badge-pending">{JOB_STATE_LABELS[Number(job.state)]}</span>
                    <span className="chip chip-teal">
                      <Users size={12} />
                      {job.bids.length} bid{job.bids.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  <h2 className="font-600 truncate" style={{ fontSize: '1.1rem' }}>
                    {getJobTitle(job)}
                  </h2>

                  {/* Meta row */}
                  <div className="flex items-center gap-2 flex-wrap text-sm text-muted">
                    <span className="flex items-center gap-2">
                      <Briefcase size={13} />
                      Job #{String(job.jobId)}
                    </span>
                    <span className="flex items-center gap-2">
                      <Clock size={13} />
                      Due {new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(Number(job.deadline) * 1000))}
                    </span>
                  </div>

                  {/* Budget range */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted">Budget:</span>
                    <AmountDisplay wei={job.budgetMin} size="sm" />
                    <span className="text-xs text-muted">–</span>
                    <AmountDisplay wei={job.budgetMax} size="sm" />
                  </div>
                </div>

                {/* CTA */}
                <Link className="btn btn-primary shrink-0" to={`/my-jobs/${String(job.jobId)}/bids`}>
                  Compare Bids <ChevronRight size={15} />
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
