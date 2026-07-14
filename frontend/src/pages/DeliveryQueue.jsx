import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAccount, useReadContract, useReadContracts } from 'wagmi';
import { formatEther } from 'viem';
import { AlertCircle, Briefcase, ChevronRight, FileUp, Shield } from 'lucide-react';
import { ESCROW_VAULT_ABI, JOB_BOARD_ABI, getContractAddress } from '../contracts.js';
import EmptyState from '../components/EmptyState.jsx';
import AmountDisplay from '../components/AmountDisplay.jsx';
import AddressDisplay from '../components/AddressDisplay.jsx';
import SkeletonCard from '../components/SkeletonCard.jsx';
import Notice from '../components/Notice.jsx';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const FUNDED = 1;

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
    assignedFreelancer: isTuple ? res[7] : res.assignedFreelancer,
    escrowVault: isTuple ? res[8] : res.escrowVault,
  };
}

function getJobTitle(job) {
  const pages = job.checklist?.requiredPages ?? [];
  if (pages.length > 0) return `Build ${pages.slice(0, 3).map((page) => `/${page}`).join(', ')}`;
  return `Job #${String(job.jobId)}`;
}

export default function DeliveryQueue() {
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
          assignedFreelancer: normalized?.assignedFreelancer ?? ZERO_ADDRESS,
          escrowVault: normalized?.escrowVault ?? ZERO_ADDRESS,
        };
      })
      .filter((job) => job && job.escrowVault !== ZERO_ADDRESS && job.assignedFreelancer?.toLowerCase() === address.toLowerCase());
    setJobs(parsed);
  }, [rawJobs, address]);

  const milestoneCalls = useMemo(() => jobs.flatMap((job) => [
    { address: job.escrowVault, abi: ESCROW_VAULT_ABI, functionName: 'getMilestoneState', args: [0] },
    { address: job.escrowVault, abi: ESCROW_VAULT_ABI, functionName: 'milestoneAmounts', args: [0n] },
    { address: job.escrowVault, abi: ESCROW_VAULT_ABI, functionName: 'deadline' },
  ]), [jobs]);

  const { data: rawMilestones, isLoading: vaultsLoading } = useReadContracts({
    contracts: milestoneCalls,
    query: { enabled: jobs.length > 0, refetchInterval: 10000 },
  });

  const pendingDeliveries = jobs
    .map((job, index) => {
      const offset = index * 3;
      return {
        ...job,
        milestoneState: rawMilestones?.[offset]?.result,
        milestoneAmount: rawMilestones?.[offset + 1]?.result ?? 0n,
        deadline: rawMilestones?.[offset + 2]?.result ?? 0n,
      };
    })
    .filter((job) => Number(job.milestoneState) === FUNDED);

  const isLoading = countLoading || jobsLoading || vaultsLoading;

  if (!isConnected) {
    return (
      <div className="page-wrapper">
        <Notice variant="warning" label="Wallet not connected">
          Connect as a freelancer to view funded milestones awaiting delivery upload.
        </Notice>
      </div>
    );
  }

  return (
    <div className="page-wrapper">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <p className="eyebrow">Freelancer Dashboard</p>
          <h1 className="page-title">Delivery Upload</h1>
          <p className="page-subtitle">
            Escrow vaults where a funded milestone is awaiting your delivery upload.
          </p>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex flex-col gap-2">
          <SkeletonCard height="140px" lines={3} />
          <SkeletonCard height="140px" lines={3} />
          <SkeletonCard height="140px" lines={3} />
        </div>
      )}

      {/* Empty */}
      {!isLoading && pendingDeliveries.length === 0 && (
        <EmptyState
          icon={FileUp}
          title="No active deliveries"
          message="As a freelancer, funded milestones that need your delivery upload will appear here. You must be the assigned freelancer on the job."
        />
      )}

      {/* Delivery cards */}
      {!isLoading && pendingDeliveries.length > 0 && (
        <div className="flex flex-col gap-2">
          {pendingDeliveries.map((job) => (
            <article className="card card-hover" key={`${String(job.jobId)}-${job.escrowVault}`}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex flex-col gap-2 min-w-0 flex-1">
                  {/* Badge row */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="badge badge-funded">Awaiting Delivery</span>
                    <span className="chip">
                      <Briefcase size={12} />
                      Job #{String(job.jobId)}
                    </span>
                  </div>

                  <h2 className="font-600 truncate" style={{ fontSize: '1.1rem' }}>
                    {getJobTitle(job)}
                  </h2>

                  {/* Milestone amount + deadline */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="flex items-center gap-2 text-sm text-muted">
                      <Shield size={13} />
                      Funded:
                    </span>
                    <AmountDisplay wei={job.milestoneAmount} size="sm" chip />
                    <span className="text-xs text-muted">
                      · Due {new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(Number(job.deadline) * 1000))}
                    </span>
                  </div>

                  {/* Vault address */}
                  <AddressDisplay address={job.escrowVault} label="Vault:" />
                </div>

                {/* CTA */}
                <Link className="btn btn-primary shrink-0" to={`/escrow/${job.escrowVault}`}>
                  Upload Delivery <ChevronRight size={15} />
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
