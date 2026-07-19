import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAccount, useReadContract } from "wagmi";
import { formatEther } from "viem";
import {
  ArrowLeft, CalendarClock, CheckCircle2, Clock, Download,
  FileText, Send, ShieldCheck, Users
} from "lucide-react";
import { JOB_BOARD_ABI, getContractAddress } from "../contracts.js";
import { useMode } from "../context/useMode.js";
import AddressDisplay from "../components/AddressDisplay.jsx";
import AmountDisplay from "../components/AmountDisplay.jsx";
import Notice from "../components/Notice.jsx";
import SkeletonCard from "../components/SkeletonCard.jsx";
import Button from "../components/Button.jsx";
import { downloadFile } from "../utils/filePipeline.js";
import JobChat from "../components/JobChat.jsx";
import { bytes32ToCid, parseOnChainNotes } from "../utils/cid.js";

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || "http://localhost:3001").replace(/\/$/, "");
const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const JOB_STATE_LABELS = { 0: "Open", 1: "Assigned", 2: "Closed" };

function normalizeChecklist(checklist) {
  if (!checklist || typeof checklist !== "object") {
    return { requiredPages: [], mustBeResponsive: false, mustHaveContactForm: false, extraNotes: "" };
  }
  const isTupleChecklist = Array.isArray(checklist) || Object.prototype.hasOwnProperty.call(checklist, 0);
  return {
    requiredPages: isTupleChecklist ? checklist[0] ?? [] : checklist.requiredPages ?? [],
    mustBeResponsive: isTupleChecklist ? checklist[1] ?? false : checklist.mustBeResponsive ?? false,
    mustHaveContactForm: isTupleChecklist ? checklist[2] ?? false : checklist.mustHaveContactForm ?? false,
    extraNotes: isTupleChecklist ? checklist[3] ?? "" : checklist.extraNotes ?? "",
  };
}

function normalizeJobResult(res) {
  if (!res || typeof res !== "object") return null;
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

function formatDate(deadline) {
  const timestamp = Number(deadline);
  if (!timestamp) return "No deadline";
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp * 1000));
}

function getCountdown(deadline) {
  const secondsLeft = Number(deadline) - Date.now() / 1000;
  if (secondsLeft <= 0) return "Deadline passed";
  const days = Math.floor(secondsLeft / 86400);
  const hours = Math.floor((secondsLeft % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h remaining`;
  return `${hours}h remaining`;
}

function getJobTitle(job, jobId) {
  const pages = job?.checklist?.requiredPages ?? [];
  if (pages.length > 0) return `Build ${pages.slice(0, 3).map((page) => `/${page}`).join(", ")}`;
  return `Job #${jobId}`;
}

function jobStateBadgeClass(state) {
  const n = Number(state);
  if (n === 0) return "badge badge-pending";
  if (n === 1) return "badge badge-delivered";
  return "badge badge-refunded";
}

export default function JobDetail() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { address, isConnected } = useAccount();
  const { isClientMode, isFreelancerMode } = useMode();
  const jobBoardAddr = getContractAddress("JobBoard");
  const parsedJobId = useMemo(() => {
    try {
      return BigInt(jobId);
    } catch {
      return null;
    }
  }, [jobId]);

  const { data: rawJob, isLoading: jobLoading, isError: jobError } = useReadContract({
    address: jobBoardAddr,
    abi: JOB_BOARD_ABI,
    functionName: "jobs",
    args: parsedJobId !== null ? [parsedJobId] : undefined,
    query: { enabled: parsedJobId !== null, refetchInterval: 10000 },
  });

  const { data: rawBids, isLoading: bidsLoading } = useReadContract({
    address: jobBoardAddr,
    abi: JOB_BOARD_ABI,
    functionName: "getBids",
    args: parsedJobId !== null ? [parsedJobId] : undefined,
    query: { enabled: parsedJobId !== null, refetchInterval: 10000 },
  });

  const job = rawJob ? normalizeJobResult(rawJob) : null;
  const bids = (rawBids ?? []).map(normalizeBid);
  const activeBids = bids.filter((bid) => !bid.withdrawn);
  const viewerBid = activeBids.find(
    (bid) => address && bid.freelancer?.toLowerCase() === address.toLowerCase()
  );
  const isOwnJob = !!address && !!job?.client && job.client.toLowerCase() === address.toLowerCase();
  const isOpen = Number(job?.state) === 0;
  const hasSpec = job?.specDocCID && job.specDocCID !== ZERO_BYTES32;
  const downloadUrl = hasSpec ? `${BACKEND_URL}/download/${job.specDocCID}` : null;
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownloadSpec = () => {
    if (!job?.specDocCID) return;
    downloadFile(job.specDocCID, 'spec-document.zip', {
      onStart: () => setIsDownloading(true),
      onSuccess: () => setIsDownloading(false),
      onError: (err) => {
        setIsDownloading(false);
        alert(err.message || 'Download failed');
      }
    });
  };
  const [metadata, setMetadata] = useState(null);
  const [metadataLoading, setMetadataLoading] = useState(false);

  useEffect(() => {
    if (!job?.specDocCID || job.specDocCID === ZERO_BYTES32) return;
    let active = true;
    const fetchMetadata = async () => {
      try {
        setMetadataLoading(true);
        const res = await fetch(`${BACKEND_URL}/metadata/${job.specDocCID}`);
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        if (active) {
          setMetadata(data);
        }
      } catch (err) {
        console.error("Failed to load spec metadata:", err);
      } finally {
        if (active) setMetadataLoading(false);
      }
    };
    fetchMetadata();
    return () => { active = false; };
  }, [job?.specDocCID]);

  const onChainData = useMemo(() => {
    return parseOnChainNotes(job?.checklist?.extraNotes || "", getJobTitle(job, jobId));
  }, [job, jobId]);

  const displayTitle = (metadata && !metadata.isRestored) ? metadata.title : onChainData.title;
  const displayDescription = (metadata && !metadata.isRestored)
    ? metadata.description
    : (onChainData.description || onChainData.notes || metadata?.description || "No extra written description was stored for this job. The structured checklist below is the source of truth.");

  /* ── Invalid ID ── */
  if (parsedJobId === null) {
    return (
      <div className="page-wrapper fade-in">
        <div className="card" style={{ maxWidth: 560, margin: "3rem auto", textAlign: "center", padding: "3rem" }}>
          <h1 className="page-title mb-2">Invalid job ID</h1>
          <p className="text-secondary">The route does not contain a valid on-chain job id.</p>
          <Link to="/browse-jobs" className="btn btn-outline btn-sm mt-4">
            <ArrowLeft size={14} /> Back to Browse
          </Link>
        </div>
      </div>
    );
  }

  /* ── Loading ── */
  if (jobLoading || bidsLoading) {
    return (
      <div className="page-wrapper fade-in">
        <div className="detail-layout">
          <div className="flex flex-col gap-4">
            <SkeletonCard height="180px" lines={3} />
            <SkeletonCard height="240px" lines={4} />
          </div>
          <div className="flex flex-col gap-4">
            <SkeletonCard height="140px" lines={2} />
            <SkeletonCard height="120px" lines={2} />
          </div>
        </div>
      </div>
    );
  }

  /* ── Not found ── */
  if (jobError || !job) {
    return (
      <div className="page-wrapper fade-in">
        <div className="card" style={{ maxWidth: 560, margin: "3rem auto", textAlign: "center", padding: "3rem" }}>
          <h1 className="page-title mb-2">Job not found</h1>
          <p className="text-secondary">No JobBoard entry was returned for Job #{jobId}.</p>
          <Link to="/browse-jobs" className="btn btn-outline btn-sm mt-4">
            <ArrowLeft size={14} /> Back to Browse
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrapper fade-in">
      {/* ── Back nav ── */}
      <Link to="/browse-jobs" className="btn btn-ghost btn-sm mb-4">
        <ArrowLeft size={15} /> Browse Jobs
      </Link>

      {/* ── Page header card ── */}
      <div className="card mb-4">
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className={jobStateBadgeClass(job.state)}>
            {JOB_STATE_LABELS[Number(job.state)] ?? "Unknown"}
          </span>
          <span className="text-tertiary text-sm">Job #{jobId}</span>
        </div>
        <h1 className="page-title mb-2">{displayTitle}</h1>
        {metadataLoading ? (
          <p className="text-secondary animate-pulse">Loading description from IPFS...</p>
        ) : (
          <p className="text-secondary" style={{ lineHeight: 1.7, maxWidth: 680 }}>
            {displayDescription}
          </p>
        )}
      </div>

      {/* ── Notices ── */}
      {!isConnected && (
        <Notice variant="info" label="Wallet not connected">
          Connect your wallet to see whether this job is yours or whether you have already bid.
        </Notice>
      )}
      {viewerBid && (
        <Notice variant="success" label="You already bid">
          Your bid of {formatEther(viewerBid.amount)} AVAX is pending review.{" "}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ display: "inline" }}
            onClick={() => document.getElementById("your-proposal")?.scrollIntoView({ behavior: "smooth" })}
          >
            View proposal &darr;
          </button>
        </Notice>
      )}

      {/* ── Two-column layout ── */}
      <div className="detail-layout">
        {/* ═══ Main column ═══ */}
        <div className="flex flex-col gap-4">

          {/* ── Checklist card ── */}
          <div className="card">
            <h2 className="section-label mb-3">Structured Checklist</h2>
            <div className="flex flex-col gap-4">

              <div>
                <div className="form-label mb-2">Required pages</div>
                {job.checklist.requiredPages.length > 0 ? (
                  <div className="chip-row">
                    {job.checklist.requiredPages.map((page) => (
                      <span key={page} className="chip">/{page}</span>
                    ))}
                  </div>
                ) : (
                  <p className="text-tertiary text-sm">No required pages stored.</p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  {job.checklist.mustBeResponsive ? (
                    <span className="mini-chip mini-chip-teal"><CheckCircle2 size={13} /> Responsive</span>
                  ) : (
                    <span className="mini-chip text-tertiary"><CheckCircle2 size={13} /> Not required: Responsive</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {job.checklist.mustHaveContactForm ? (
                    <span className="mini-chip mini-chip-teal"><CheckCircle2 size={13} /> Contact form</span>
                  ) : (
                    <span className="mini-chip text-tertiary"><CheckCircle2 size={13} /> Not required: Contact form</span>
                  )}
                </div>
              </div>

              {onChainData.notes && (
                <div>
                  <div className="form-label mb-1">Extra notes</div>
                  <p className="text-primary" style={{ lineHeight: 1.65 }}>{onChainData.notes}</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Spec / files card ── */}
          <div className="card">
            <h2 className="section-label mb-3">Spec / Reference Files</h2>
            {hasSpec ? (
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="font-600 mb-1">Uploaded spec bundle</div>
                  <div className="font-mono text-xs text-tertiary break-all">
                    On-chain hash: {job.specDocCID.slice(0, 18)}...{job.specDocCID.slice(-10)}
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={handleDownloadSpec}
                  variant="primary"
                  className="shrink-0"
                  loading={isDownloading}
                >
                  <Download size={15} /> Download Spec
                </Button>
              </div>
            ) : (
              <p className="text-tertiary text-sm">No spec hash is stored on this job.</p>
            )}
            <p className="text-tertiary text-sm mt-3" style={{ lineHeight: 1.6 }}>
              Download implementation: the backend resolves the on-chain bytes32 hash to the uploaded CID manifest when available,
              or to the deterministic local mock CID used by the current /upload fallback. Files are served as the original uploaded object.
            </p>
          </div>

          {/* ── Your proposal card ── */}
          {viewerBid && (
            <div id="your-proposal" className="card" style={{ borderColor: "var(--border-value)" }}>
              <h2 className="section-label mb-3">Your Submitted Proposal</h2>
              <div className="kv-list">
                <div className="kv-row">
                  <span className="kv-key">Bid amount</span>
                  <span className="kv-value">
                    <AmountDisplay wei={viewerBid.amount} size="sm" />
                  </span>
                </div>
                <div className="kv-row">
                  <span className="kv-key">Estimated delivery</span>
                  <span className="kv-value">
                    <span className="chip chip-amber">
                      <Clock size={13} /> {String(viewerBid.estimatedDays)} day{Number(viewerBid.estimatedDays) === 1 ? "" : "s"}
                    </span>
                  </span>
                </div>
                <div className="kv-row">
                  <span className="kv-key">Proposal hash</span>
                  <span className="kv-value font-mono text-xs text-tertiary break-all">{viewerBid.proposalCID}</span>
                </div>
              </div>
              <p className="text-tertiary text-sm mt-3">
                Full proposal text fetching is completed in the proposal flow section, where proposal text is uploaded through IPFS before submitBid.
              </p>
            </div>
          )}

          {/* ── Active bids list ── */}
          {activeBids.length > 0 && (
            <div className="card">
              <h2 className="section-label mb-3">
                Active Bids <span className="chip chip-teal ml-2">{activeBids.length}</span>
              </h2>
              <div className="flex flex-col gap-3">
                {activeBids.map((bid, i) => (
                  <div key={i} className="card card-sm" style={{ background: "var(--bg-subtle)" }}>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <AddressDisplay address={bid.freelancer} label="Freelancer:" />
                      </div>
                      <div className="flex items-center gap-2 shrink-0 flex-wrap">
                        <AmountDisplay wei={bid.amount} size="sm" chip />
                        <span className="chip">
                          <Clock size={12} /> {String(bid.estimatedDays)}d
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* ── Messages section ── */}
          {isConnected && address && (isOwnJob || job?.assignedFreelancer?.toLowerCase() === address.toLowerCase() || (viewerBid && !viewerBid.withdrawn) || (isFreelancerMode && isOpen && !viewerBid && !isOwnJob)) && (
            <div className="card">
              <h2 className="section-label mb-3">Messages</h2>
              {(isOwnJob || job?.assignedFreelancer?.toLowerCase() === address.toLowerCase() || (viewerBid && !viewerBid.withdrawn)) ? (
                <JobChat
                  jobId={jobId}
                  clientAddress={job.client}
                  assignedFreelancer={job.assignedFreelancer}
                  isClientMode={isClientMode}
                  bidders={bids}
                />
              ) : (
                <Notice variant="info" label="Messaging Locked">
                  Submit a proposal to open messaging with the client.
                </Notice>
              )}
            </div>
          )}
        </div>

        {/* ═══ Sidebar ═══ */}
        <div className="flex flex-col gap-4">

          {/* ── Budget card ── */}
          <div className="card card-value">
            <div className="eyebrow mb-2">Budget Range</div>
            <div className="flex items-baseline gap-2 flex-wrap">
              <AmountDisplay wei={job.budgetMin} size="lg" />
              <span className="text-tertiary text-sm">to</span>
              <AmountDisplay wei={job.budgetMax} size="lg" />
            </div>
          </div>

          {/* ── Deadline card ── */}
          <div className="card">
            <div className="eyebrow mb-2">Deadline</div>
            <div className="kv-list">
              <div className="kv-row">
                <span className="kv-key"><CalendarClock size={14} /> Date</span>
                <span className="kv-value text-sm">{formatDate(job.deadline)}</span>
              </div>
              <div className="kv-row">
                <span className="kv-key"><Clock size={14} /> Remaining</span>
                <span className="kv-value text-sm text-teal">{getCountdown(job.deadline)}</span>
              </div>
              <div className="kv-row">
                <span className="kv-key"><Users size={14} /> Bids</span>
                <span className="kv-value text-sm">{activeBids.length} active bid{activeBids.length === 1 ? "" : "s"}</span>
              </div>
            </div>
          </div>

          {/* ── Client card ── */}
          <div className="card">
            <div className="eyebrow mb-2">Client</div>
            <AddressDisplay address={job.client} label="" />
            <Link
              to={`/profile/${job.client}`}
              className="btn btn-ghost btn-sm mt-3 w-full"
            >
              View profile
            </Link>
          </div>

          {/* ── CTA card ── */}
          <div className="card">
            {isFreelancerMode && isOpen && !viewerBid && !isOwnJob && (
              <button
                className="btn btn-primary btn-lg w-full"
                onClick={() => navigate(`/jobs/${jobId}/propose`)}
              >
                <Send size={16} /> Submit Proposal
              </button>
            )}
            {isClientMode && isOwnJob && (
              <button
                className="btn btn-primary btn-lg w-full"
                onClick={() => navigate(`/jobs/${jobId}/bids`)}
              >
                <Users size={16} /> Review Bids
              </button>
            )}
            {Number(job.state) === 1 && job.escrowVault !== ZERO_ADDRESS && (
              <button
                className="btn btn-outline w-full mt-2"
                onClick={() => navigate(`/escrow/${job.escrowVault}`)}
              >
                <ShieldCheck size={16} /> View Escrow
              </button>
            )}
            {viewerBid && isFreelancerMode && (
              <div className="notice notice-success mt-3">
                <span className="notice-label">Bid submitted</span>
                <span className="notice-body">{formatEther(viewerBid.amount)} AVAX &middot; pending review</span>
              </div>
            )}
            {!isConnected && (
              <p className="text-tertiary text-sm text-center mt-2">
                Connect wallet to interact
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
