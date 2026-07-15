import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  useAccount, useReadContract, useReadContracts, useWaitForTransactionReceipt, useWriteContract
} from 'wagmi';
import { formatEther } from 'viem';
import {
  AlertCircle, ArrowLeft, CheckCircle, ChevronDown, ChevronUp,
  Download, ExternalLink, Loader, ShieldCheck, Users, Clock
} from 'lucide-react';
import { JOB_BOARD_ABI, REPUTATION_SBT_ABI, getContractAddress } from '../contracts.js';
import { useNetworkGuard } from '../hooks/useNetworkGuard.js';
import AddressDisplay from '../components/AddressDisplay.jsx';
import AmountDisplay from '../components/AmountDisplay.jsx';
import Notice from '../components/Notice.jsx';
import Button from '../components/Button.jsx';
import EmptyState from '../components/EmptyState.jsx';
import SkeletonCard from '../components/SkeletonCard.jsx';
import { downloadFile } from '../utils/filePipeline.js';
import { bytes32ToCid } from '../utils/cid.js';

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const JOB_STATE_LABELS = { 0: 'Open', 1: 'Assigned', 2: 'Closed' };
const JOB_STATE_BADGES = { 0: 'badge-pending', 1: 'badge-delivered', 2: 'badge-released' };

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
    specDocCID: bytes32ToCid(isTuple ? res[2] : res.specDocCID),
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
    proposalCID: bytes32ToCid(isTuple ? bid[2] : bid.proposalCID),
    estimatedDays: isTuple ? bid[3] : bid.estimatedDays,
    withdrawn: isTuple ? bid[4] : bid.withdrawn,
  };
}

function getJobTitle(job, jobId) {
  const pages = job?.checklist?.requiredPages ?? [];
  if (pages.length > 0) return `Build ${pages.slice(0, 3).map((page) => `/${page}`).join(', ')}`;
  return `Job #${jobId}`;
}

async function fetchProposal(hash) {
  const response = await fetch(`${BACKEND_URL}/download/${hash}`);
  if (!response.ok) throw new Error('Proposal file is not available from this backend');
  const text = await response.text();
  return JSON.parse(text);
}

function BidCard({ bid, job, proposal, reputation, expanded, onToggle, onAccept, isAccepting, canAccept }) {
  const isAccepted = Number(job.state) === 1 && job.assignedFreelancer?.toLowerCase() === bid.freelancer?.toLowerCase();
  const notSelected = Number(job.state) !== 0 && !isAccepted;
  const reputationScore = reputation?.score !== undefined ? Number(reputation.score) : 0;
  const completed = reputation?.completed !== undefined ? Number(reputation.completed) : 0;
  const failed = reputation?.failed !== undefined ? Number(reputation.failed) : 0;
  const proposalData = proposal?.data;
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownloadAttachment = () => {
    if (!proposalData?.attachment?.hash) return;
    downloadFile(proposalData.attachment.hash, proposalData.attachment.name || 'attachment.bin', {
      onStart: () => setIsDownloading(true),
      onSuccess: () => setIsDownloading(false),
      onError: (err) => {
        setIsDownloading(false);
        alert(err.message || 'Download failed');
      }
    });
  };

  return (
    <article className="card" style={bid.withdrawn ? { opacity: 0.6 } : undefined}>
      <div className="flex justify-between gap-4 flex-wrap items-start">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <span className="font-700">Bid #{bid.index}</span>
            <AddressDisplay address={bid.freelancer} />
            <Link to={`/profile/${bid.freelancer}`} className="text-xs text-teal flex items-center gap-1 font-600">
              Profile <ExternalLink size={12} />
            </Link>
            {isAccepted && <span className="badge badge-released">Selected</span>}
            {notSelected && <span className="badge badge-refunded">Not Selected</span>}
            {bid.withdrawn && <span className="badge badge-refunded">Withdrawn</span>}
          </div>

          <div className="flex flex-wrap gap-4 mb-1">
            <div>
              <div className="section-label mb-1">Bid Amount</div>
              <AmountDisplay wei={bid.amount} size="md" chip />
            </div>
            <div>
              <div className="section-label mb-1">Timeline</div>
              <span className="chip"><Clock size={12} /> {String(bid.estimatedDays)} days</span>
            </div>
            <div>
              <div className="section-label mb-1">Reputation</div>
              <span className="chip chip-teal">{reputationScore} score</span>
            </div>
            <div>
              <div className="section-label mb-1">Done / Failed</div>
              <span className="chip">{completed} / {failed}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 shrink-0" style={{ minWidth: 160 }}>
          <Button variant="secondary" size="sm" onClick={onToggle} icon={expanded ? ChevronUp : ChevronDown}>
            {expanded ? 'Hide Proposal' : 'View Proposal'}
          </Button>
          {canAccept && !bid.withdrawn && (
            <Button
              variant="primary"
              size="sm"
              loading={isAccepting}
              onClick={() => onAccept(bid.index)}
              icon={ShieldCheck}
            >
              Accept Bid
            </Button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border-muted)' }}>
          {proposal?.loading && (
            <Notice variant="info" label="Loading">
              Loading full proposal from IPFS…
            </Notice>
          )}
          {proposal?.error && (
            <Notice variant="warning" label="Proposal Not Found">
              {proposal.error}. Raw IPFS hash: <span className="font-mono text-xs break-all">{bid.proposalCID}</span>
            </Notice>
          )}
          {proposalData && (
            <div className="flex flex-col gap-4">
              <div>
                <div className="form-label mb-2">Proposal / Cover Letter</div>
                <p className="text-primary text-sm" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.65 }}>
                  {proposalData.coverLetter || 'No cover letter was included.'}
                </p>
              </div>

              {proposalData.portfolioLinks?.length > 0 && (
                <div>
                  <div className="form-label mb-2">Portfolio Links</div>
                  <div className="flex flex-col gap-2">
                    {proposalData.portfolioLinks.map((link) => (
                      <a key={link} href={link} target="_blank" rel="noreferrer" className="text-sm text-teal font-600 inline-flex items-center gap-1">
                        {link} <ExternalLink size={12} />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {proposalData.attachment && (
                <div>
                  <div className="form-label mb-2">Attached File</div>
                  <Button
                    type="button"
                    onClick={handleDownloadAttachment}
                    variant="secondary"
                    size="sm"
                    icon={Download}
                    loading={isDownloading}
                  >
                    {proposalData.attachment.name || 'Download attachment'}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

export default function ReviewBids() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { address, isConnected } = useAccount();
  const { canTransact } = useNetworkGuard();
  const { jobId: jobIdParam } = useParams();
  const [sortBy, setSortBy] = useState('amount');
  const [expanded, setExpanded] = useState({});
  const [proposalMap, setProposalMap] = useState({});
  const [actionError, setActionError] = useState('');
  const parsedJobId = useMemo(() => {
    try {
      return BigInt(jobIdParam);
    } catch {
      return null;
    }
  }, [jobIdParam]);

  const jobBoardAddress = getContractAddress('JobBoard');
  const reputationAddress = getContractAddress('ReputationSBT');

  const { data: rawJob, isLoading: jobLoading } = useReadContract({
    address: jobBoardAddress,
    abi: JOB_BOARD_ABI,
    functionName: 'jobs',
    args: parsedJobId !== null ? [parsedJobId] : undefined,
    query: { enabled: parsedJobId !== null, refetchInterval: 10000 },
  });

  const { data: rawBids, isLoading: bidsLoading } = useReadContract({
    address: jobBoardAddress,
    abi: JOB_BOARD_ABI,
    functionName: 'getBids',
    args: parsedJobId !== null ? [parsedJobId] : undefined,
    query: { enabled: parsedJobId !== null, refetchInterval: 10000 },
  });

  const job = rawJob ? { jobId: parsedJobId, ...normalizeJobResult(rawJob) } : null;
  const bids = (rawBids ?? []).map(normalizeBid);
  const reputationCalls = bids.flatMap((bid) => [
    { address: reputationAddress, abi: REPUTATION_SBT_ABI, functionName: 'freelancerScore', args: [bid.freelancer] },
    { address: reputationAddress, abi: REPUTATION_SBT_ABI, functionName: 'freelancerJobsCompleted', args: [bid.freelancer] },
    { address: reputationAddress, abi: REPUTATION_SBT_ABI, functionName: 'freelancerJobsFailed', args: [bid.freelancer] },
  ]);

  const { data: rawReputation } = useReadContracts({
    contracts: reputationCalls,
    query: { enabled: bids.length > 0, refetchInterval: 12000 },
  });

  const reputationByBid = useMemo(() => {
    const map = {};
    bids.forEach((bid, bidIndex) => {
      const offset = bidIndex * 3;
      map[bid.index] = {
        score: rawReputation?.[offset]?.result ?? 0n,
        completed: rawReputation?.[offset + 1]?.result ?? 0n,
        failed: rawReputation?.[offset + 2]?.result ?? 0n,
      };
    });
    return map;
  }, [bids, rawReputation]);

  const { writeContractAsync, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const isOwner = !!address && !!job?.client && address.toLowerCase() === job.client.toLowerCase();
  const canAccept = isOwner && Number(job?.state) === 0 && canTransact;

  const [metadata, setMetadata] = useState(null);

  useEffect(() => {
    if (!job?.specDocCID || job.specDocCID === '0x0000000000000000000000000000000000000000000000000000000000000000') return;
    let active = true;
    const fetchMetadata = async () => {
      try {
        const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '');
        const res = await fetch(`${BACKEND_URL}/metadata/${job.specDocCID}`);
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        if (active) {
          setMetadata(data);
        }
      } catch (err) {
        console.error("Failed to load spec metadata in ReviewBids:", err);
      }
    };
    fetchMetadata();
    return () => { active = false; };
  }, [job?.specDocCID]);

  const displayTitle = metadata?.title || getJobTitle(job, jobIdParam);

  useEffect(() => {
    if (!isSuccess) return;
    queryClient.invalidateQueries();
  }, [isSuccess, queryClient]);

  useEffect(() => {
    if (!isSuccess || !job?.escrowVault || job.escrowVault === ZERO_ADDRESS) return;
    navigate(`/escrow/${job.escrowVault}`, { replace: true });
  }, [isSuccess, job?.escrowVault, navigate]);

  useEffect(() => {
    Object.entries(expanded).forEach(([bidIndex, isOpen]) => {
      if (!isOpen || proposalMap[bidIndex]) return;
      const bid = bids.find((item) => String(item.index) === String(bidIndex));
      if (!bid) return;

      setProposalMap((current) => ({ ...current, [bidIndex]: { loading: true } }));
      fetchProposal(bid.proposalCID)
        .then((data) => setProposalMap((current) => ({ ...current, [bidIndex]: { data } })))
        .catch((error) => setProposalMap((current) => ({
          ...current,
          [bidIndex]: { error: error.message || 'Unable to fetch proposal' }
        })));
    });
  }, [expanded, bids, proposalMap]);

  const sortedBids = [...bids].sort((a, b) => {
    if (sortBy === 'reputation') {
      return Number(reputationByBid[b.index]?.score ?? 0n) - Number(reputationByBid[a.index]?.score ?? 0n);
    }
    if (sortBy === 'timeline') return Number(a.estimatedDays) - Number(b.estimatedDays);
    return a.amount < b.amount ? -1 : a.amount > b.amount ? 1 : 0;
  });

  const acceptBid = async (bidIndex) => {
    setActionError('');
    try {
      await writeContractAsync({
        address: jobBoardAddress,
        abi: JOB_BOARD_ABI,
        functionName: 'acceptBid',
        args: [parsedJobId, BigInt(bidIndex)],
      });
    } catch (error) {
      setActionError(error?.shortMessage || error?.message || 'Accept bid failed');
    }
  };

  if (!isConnected) {
    return (
      <div className="page-wrapper fade-in">
        <div className="card" style={{ maxWidth: 560, margin: '4rem auto', textAlign: 'center', padding: '3rem' }}>
          <Users size={48} className="text-dim mb-4" style={{ margin: '0 auto 1rem' }} />
          <h2 className="mb-2">Connect Your Wallet</h2>
          <p className="text-secondary">Connect as the client wallet to review proposals for this job.</p>
        </div>
      </div>
    );
  }

  if (parsedJobId === null) {
    return (
      <div className="page-wrapper fade-in">
        <div className="card" style={{ maxWidth: 560, margin: '3rem auto', textAlign: 'center', padding: '3rem' }}>
          <h1 className="page-title mb-2">Invalid job ID</h1>
          <p className="text-secondary">The route does not contain a valid on-chain job id.</p>
          <Link to="/browse-jobs" className="btn btn-outline btn-sm mt-4">
            <ArrowLeft size={14} /> Back to Browse
          </Link>
        </div>
      </div>
    );
  }

  if (jobLoading || bidsLoading) {
    return (
      <div className="page-wrapper fade-in">
        <div className="flex flex-col gap-4">
          <SkeletonCard height="120px" lines={2} />
          <SkeletonCard height="160px" lines={3} />
          <SkeletonCard height="160px" lines={3} />
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="page-wrapper fade-in">
        <div className="card" style={{ maxWidth: 560, margin: '3rem auto', textAlign: 'center', padding: '3rem' }}>
          <h1 className="page-title mb-2">Job not found</h1>
          <p className="text-secondary">No JobBoard entry was returned for Job #{jobIdParam}.</p>
          <Link to="/browse-jobs" className="btn btn-outline btn-sm mt-4">
            <ArrowLeft size={14} /> Back to Browse
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrapper fade-in">
      <div>
        <Button as={Link} to={`/jobs/${jobIdParam}`} variant="ghost" size="sm" icon={ArrowLeft} className="mb-4">
          Back to Job Detail
        </Button>
      </div>

      <section className="card mb-4">
        <div className="flex justify-between gap-4 flex-wrap items-start">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className={`badge ${JOB_STATE_BADGES[Number(job?.state)] ?? 'badge-pending'}`}>
                {JOB_STATE_LABELS[Number(job?.state)] ?? 'Unknown'}
              </span>
              <span className="text-xs text-dim">Job #{jobIdParam}</span>
            </div>
            <h1 className="page-title mb-1">Review Bids</h1>
            <p className="page-subtitle">{displayTitle}</p>
          </div>
          {Number(job?.state) === 1 && job?.escrowVault !== ZERO_ADDRESS && (
            <Button
              variant="outline"
              onClick={() => navigate(`/escrow/${job.escrowVault}`)}
              icon={ShieldCheck}
            >
              View Escrow Vault
            </Button>
          )}
        </div>

        <div className="divider" />

        <div className="flex flex-wrap gap-6">
          <div>
            <div className="section-label mb-1">Client Budget</div>
            <AmountDisplay wei={job?.budgetMin ?? 0n} size="sm" /> – <AmountDisplay wei={job?.budgetMax ?? 0n} size="sm" />
          </div>
          <div>
            <div className="section-label mb-1">On-chain Deadline</div>
            <span className="text-sm font-600 text-primary">
              {new Date(Number(job?.deadline ?? 0n) * 1000).toLocaleDateString(undefined, { dateStyle: 'medium' })}
            </span>
          </div>
          <div>
            <div className="section-label mb-1">Bids count</div>
            <span className="chip chip-teal">{bids.filter((bid) => !bid.withdrawn).length} active / {bids.length} total</span>
          </div>
        </div>
      </section>

      {!isOwner && (
        <Notice variant="warning" label="Read-Only Mode">
          This page is read-only because the connected wallet is not the client who posted this job.
        </Notice>
      )}

      {actionError && (
        <Notice variant="danger" label="Action Failed">
          {actionError}
        </Notice>
      )}

      {isSuccess && (
        <Notice variant="success" label="Bid Accepted">
          Bid accepted on-chain. Deploying the new escrow vault contract, redirecting in a moment…
        </Notice>
      )}

      <div className="flex justify-between items-center gap-4 flex-wrap mb-4">
        <h2 className="section-label" style={{ marginBottom: 0, borderBottom: 'none' }}>
          All Submitted Bids ({sortedBids.length})
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-dim font-600" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sort by</span>
          <select className="form-select text-xs" value={sortBy} onChange={(event) => setSortBy(event.target.value)} style={{ width: 140, height: 32, padding: '4px 24px 4px 10px' }}>
            <option value="amount">Amount</option>
            <option value="reputation">Reputation</option>
            <option value="timeline">Timeline</option>
          </select>
        </div>
      </div>

      {sortedBids.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No bids yet"
          message="Freelancer proposals will appear here on-chain as soon as they are submitted."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {sortedBids.map((bid) => (
            <BidCard
              key={`${jobIdParam}-${bid.index}`}
              bid={bid}
              job={job}
              proposal={proposalMap[bid.index]}
              reputation={reputationByBid[bid.index]}
              expanded={!!expanded[bid.index]}
              onToggle={() => setExpanded((current) => ({ ...current, [bid.index]: !current[bid.index] }))}
              onAccept={acceptBid}
              isAccepting={isPending || isConfirming}
              canAccept={canAccept}
            />
          ))}
        </div>
      )}
    </div>
  );
}
