import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccount, useReadContract, useReadContracts } from 'wagmi';
import { formatEther } from 'viem';
import { AlertCircle, Briefcase, ChevronRight, Clock, Shield } from 'lucide-react';
import { ESCROW_VAULT_ABI, JOB_BOARD_ABI, getContractAddress } from '../contracts.js';
import { useMode } from '../context/useMode.js';
import StatusBadge from '../components/StatusBadge.jsx';
import AddressDisplay from '../components/AddressDisplay.jsx';
import AmountDisplay from '../components/AmountDisplay.jsx';
import EmptyState from '../components/EmptyState.jsx';
import SkeletonCard from '../components/SkeletonCard.jsx';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

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
    budgetMin: isTuple ? res[3] : res.budgetMin,
    budgetMax: isTuple ? res[4] : res.budgetMax,
    deadline: isTuple ? res[5] : res.deadline,
    state: isTuple ? res[6] : res.state,
    assignedFreelancer: isTuple ? res[7] : res.assignedFreelancer,
    escrowVault: isTuple ? res[8] : res.escrowVault,
  };
}

function getJobTitle(job) {
  const pages = job.checklist?.requiredPages ?? [];
  if (pages.length > 0) return `Build ${pages.slice(0, 3).map((page) => `/${page}`).join(', ')}`;
  return `Job #${String(job.jobId)}`;
}

export default function MyVaults() {
  const { address, isConnected } = useAccount();
  const { isClientMode } = useMode();
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

  const { data: rawJobs, isLoading: jobsLoading } = useReadContracts({
    contracts: jobCalls,
    query: { enabled: isConnected && count > 0, refetchInterval: 10000 },
  });

  useEffect(() => {
    if (!rawJobs || !address) return;
    const parsed = rawJobs
      .map((result, index) => {
        if (result.status !== 'success' || !result.result) return null;
        const normalized = normalizeJobResult(result.result);
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
        };
      })
      .filter((job) => {
        if (!job || job.escrowVault === ZERO_ADDRESS) return false;
        return isClientMode
          ? job.client?.toLowerCase() === address.toLowerCase()
          : job.assignedFreelancer?.toLowerCase() === address.toLowerCase();
      });
    setJobs(parsed);
  }, [rawJobs, address, isClientMode]);

  const milestoneCalls = useMemo(() => jobs.flatMap((job) => [
    { address: job.escrowVault, abi: ESCROW_VAULT_ABI, functionName: 'getMilestoneCount' },
    { address: job.escrowVault, abi: ESCROW_VAULT_ABI, functionName: 'deadline' },
    { address: job.escrowVault, abi: ESCROW_VAULT_ABI, functionName: 'getMilestoneState', args: [0] },
    { address: job.escrowVault, abi: ESCROW_VAULT_ABI, functionName: 'milestoneAmounts', args: [0n] },
  ]), [jobs]);

  const { data: rawMilestones, isLoading: vaultsLoading } = useReadContracts({
    contracts: milestoneCalls,
    query: { enabled: jobs.length > 0, refetchInterval: 10000 },
  });

  const withVaultData = jobs.map((job, index) => {
    const offset = index * 4;
    return {
      ...job,
      milestoneCount: rawMilestones?.[offset]?.result ?? 0n,
      vaultDeadline: rawMilestones?.[offset + 1]?.result ?? job.deadline,
      firstMilestoneState: rawMilestones?.[offset + 2]?.result ?? 0,
      firstMilestoneAmount: rawMilestones?.[offset + 3]?.result ?? 0n,
    };
  });

  if (!isConnected) {
    return (
      <div className="page-wrapper">
        <div className="empty-state">
          <div className="empty-state-icon">
            <AlertCircle size={24} aria-hidden="true" />
          </div>
          <p className="empty-state-title">Connect Your Wallet</p>
          <p className="empty-state-message">Connect to view your escrow vaults.</p>
        </div>
      </div>
    );
  }

  const isLoading = countLoading || jobsLoading || vaultsLoading;

  return (
    <div className="page-wrapper">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">My Escrow Vaults</h1>
          <p className="page-subtitle">
            {isClientMode
              ? 'Vaults where this wallet is the client.'
              : 'Vaults where this wallet is the freelancer.'}
          </p>
        </div>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="jobs-grid">
          <SkeletonCard height="120px" lines={3} />
          <SkeletonCard height="120px" lines={3} />
          <SkeletonCard height="120px" lines={3} />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && withVaultData.length === 0 && (
        <EmptyState
          icon={Shield}
          title="No active escrows yet"
          message="Accepted jobs with escrow vaults will appear here."
        />
      )}

      {/* Vault cards grid */}
      {!isLoading && withVaultData.length > 0 && (
        <div className="jobs-grid">
          {withVaultData.map((job) => (
            <article className="card card-hover" key={`${String(job.jobId)}-${job.escrowVault}`}>
              {/* Card top: title + role badge */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <h2 className="font-700 truncate" style={{ fontSize: '1.05rem' }}>
                    {getJobTitle(job)}
                  </h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-dim text-xs">
                      <Briefcase size={12} style={{ display: 'inline', marginRight: 3 }} />
                      Job #{String(job.jobId)}
                    </span>
                    <span className="text-dim text-xs">
                      <Shield size={12} style={{ display: 'inline', marginRight: 3 }} />
                      {String(job.milestoneCount)} milestone{Number(job.milestoneCount) === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>
                <span className={isClientMode ? 'chip chip-teal' : 'chip'}>
                  {isClientMode ? 'Client' : 'Freelancer'}
                </span>
              </div>

              {/* Vault address */}
              <div className="mb-3">
                <AddressDisplay address={job.escrowVault} label="Vault:" />
              </div>

              {/* Total funds: AmountDisplay large amber */}
              <div className="vault-amount-display mb-3">
                <AmountDisplay wei={job.firstMilestoneAmount} size="lg" />
              </div>

              {/* Milestone state row */}
              <div className="chip-row mb-4">
                <StatusBadge state={Number(job.firstMilestoneState)} />
              </div>

              {/* Deadline row */}
              <div className="flex items-center gap-2 text-dim text-xs mb-4">
                <Clock size={13} />
                <span>
                  Deadline:{' '}
                  {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
                    new Date(Number(job.vaultDeadline) * 1000)
                  )}
                </span>
              </div>

              {/* CTA */}
              <Link
                className="btn btn-outline btn-sm w-full"
                to={`/escrow/${job.escrowVault}`}
                style={{ justifyContent: 'center' }}
              >
                View Vault <ChevronRight size={15} />
              </Link>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
