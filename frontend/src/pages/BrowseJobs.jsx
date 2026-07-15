import { useEffect, useMemo, useState } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { formatEther } from "viem";
import {
  Briefcase, CheckCircle2, CheckSquare, ChevronRight, Clock,
  FileText, Search, Users
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { JOB_BOARD_ABI, getContractAddress } from "../contracts.js";
import { useMode } from "../context/useMode.js";
import AmountDisplay from "../components/AmountDisplay.jsx";
import EmptyState from "../components/EmptyState.jsx";
import Notice from "../components/Notice.jsx";
import SkeletonCard from "../components/SkeletonCard.jsx";
import { bytes32ToCid, parseOnChainNotes } from "../utils/cid.js";

const JOB_STATE_LABELS = { 0: "Open", 1: "Assigned", 2: "Closed" };

const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

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

function formatDeadline(deadline) {
  const timestamp = Number(deadline);
  if (!timestamp) return "No deadline";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestamp * 1000));
}

function getDaysLeft(deadline) {
  return Math.max(0, Math.ceil((Number(deadline) - Date.now() / 1000) / 86400));
}

function getJobTitle(job) {
  const pages = job.checklist?.requiredPages ?? [];
  if (pages.length > 0) {
    return `Build ${pages.slice(0, 3).map((page) => `/${page}`).join(", ")}`;
  }
  return `Job #${String(job.jobId)}`;
}

function jobStateBadgeClass(state) {
  const n = Number(state);
  if (n === 0) return "badge badge-pending";
  if (n === 1) return "badge badge-delivered";
  return "badge badge-refunded";
}

function JobCard({ job, address }) {
  const navigate = useNavigate();
  const activeBids = job.bids.filter((bid) => !bid.withdrawn);
  const userBid = activeBids.find(
    (bid) => address && bid.freelancer?.toLowerCase() === address.toLowerCase()
  );
  const daysLeft = getDaysLeft(job.deadline);
  const checksCount =
    (job.checklist?.requiredPages?.length || 0) +
    (job.checklist?.mustBeResponsive ? 1 : 0) +
    (job.checklist?.mustHaveContactForm ? 1 : 0);

  const goToDetail = () => navigate(`/jobs/${String(job.jobId)}`);

  const [metadata, setMetadata] = useState(null);

  useEffect(() => {
    if (!job.specDocCID || job.specDocCID === ZERO_BYTES32) return;
    let active = true;
    const fetchMetadata = async () => {
      try {
        const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL || "http://localhost:3001").replace(/\/$/, "");
        const res = await fetch(`${BACKEND_URL}/metadata/${job.specDocCID}`);
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        if (active) {
          setMetadata(data);
        }
      } catch (err) {
        console.error("Failed to load metadata in card:", err);
      }
    };
    fetchMetadata();
    return () => { active = false; };
  }, [job.specDocCID]);

  const onChainData = useMemo(() => {
    return parseOnChainNotes(job.checklist?.extraNotes || "", getJobTitle(job));
  }, [job]);

  const displayTitle = (metadata && !metadata.isRestored) ? metadata.title : onChainData.title;
  const displayDescription = metadata?.description || onChainData.description || onChainData.notes || "";

  return (
    <article
      className="card card-hover browse-job-card"
      role="link"
      tabIndex={0}
      onClick={goToDetail}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          goToDetail();
        }
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="job-card-title truncate">{displayTitle}</div>
          <div className="text-xs font-mono text-muted mt-1">
            Client {String(job.client || "").slice(0, 8)}&hellip;{String(job.client || "").slice(-6)}
          </div>
        </div>
        <span className={`${jobStateBadgeClass(job.state)} shrink-0`}>
          {JOB_STATE_LABELS[Number(job.state)] ?? "Unknown"}
        </span>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-3">
        <AmountDisplay wei={job.budgetMin} size="sm" chip />
        <span className="text-tertiary text-sm">&#8211;</span>
        <AmountDisplay wei={job.budgetMax} size="sm" chip />
      </div>

      {displayDescription && (
        <p className="job-card-desc text-sm text-secondary mb-3 truncate">
          {displayDescription}
        </p>
      )}

      {job.checklist?.requiredPages?.length > 0 && (
        <div className="mb-3">
          <div className="section-label mb-1">Required pages</div>
          <div className="chip-row">
            {job.checklist.requiredPages.slice(0, 6).map((page) => (
              <span key={page} className="mini-chip">/{page}</span>
            ))}
          </div>
        </div>
      )}

      <div className="chip-row mb-3">
        {job.checklist?.mustBeResponsive && (
          <span className="mini-chip mini-chip-teal">
            <CheckCircle2 size={12} /> Responsive
          </span>
        )}
        {job.checklist?.mustHaveContactForm && (
          <span className="mini-chip mini-chip-teal">
            <CheckCircle2 size={12} /> Contact form
          </span>
        )}
        {job.specDocCID && job.specDocCID !== ZERO_BYTES32 && (
          <span className="mini-chip">
            <FileText size={12} /> Spec attached
          </span>
        )}
      </div>

      <div className="job-card-footer">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="mini-chip">
            <Clock size={12} /> {formatDeadline(job.deadline)} &middot; {daysLeft}d left
          </span>
          <span className="mini-chip">
            <Users size={12} /> {activeBids.length} bid{activeBids.length === 1 ? "" : "s"}
          </span>
          <span className="mini-chip">
            <CheckSquare size={12} /> {checksCount} checks
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {userBid && (
            <span className="chip chip-teal">You bid</span>
          )}
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={(event) => {
              event.stopPropagation();
              goToDetail();
            }}
          >
            View <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </article>
  );
}

export default function BrowseJobs() {
  const [search, setSearch] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const [jobs, setJobs] = useState([]);
  const { address, isConnected } = useAccount();
  const { isFreelancerMode } = useMode();
  const jobBoardAddr = getContractAddress("JobBoard");

  const { data: jobCount, isLoading: countLoading } = useReadContract({
    address: jobBoardAddr,
    abi: JOB_BOARD_ABI,
    functionName: "jobCounter",
    query: { enabled: !!jobBoardAddr, refetchInterval: 10000 },
  });

  const count = jobCount !== undefined ? Number(jobCount) : 0;

  const jobCalls = useMemo(() => Array.from({ length: count }, (_, index) => ({
    address: jobBoardAddr,
    abi: JOB_BOARD_ABI,
    functionName: "jobs",
    args: [BigInt(index)],
  })), [count, jobBoardAddr]);

  const bidCalls = useMemo(() => Array.from({ length: count }, (_, index) => ({
    address: jobBoardAddr,
    abi: JOB_BOARD_ABI,
    functionName: "getBids",
    args: [BigInt(index)],
  })), [count, jobBoardAddr]);

  const { data: rawJobs, isLoading: jobsLoading } = useReadContracts({
    contracts: jobCalls,
    query: { enabled: count > 0, refetchInterval: 10000 },
  });

  const { data: rawBids, isLoading: bidsLoading } = useReadContracts({
    contracts: bidCalls,
    query: { enabled: count > 0, refetchInterval: 10000 },
  });

  useEffect(() => {
    if (!rawJobs) return;
    const parsed = rawJobs
      .map((result, index) => {
        if (result.status !== "success" || !result.result) return null;
        const normalized = normalizeJobResult(result.result);
        const jobBidsRaw = rawBids?.[index]?.result || [];
        const bids = jobBidsRaw.map(normalizeBid);
        return {
          jobId: BigInt(index),
          client: normalized?.client ?? "",
          checklist: normalized?.checklist ?? { requiredPages: [], mustBeResponsive: false, mustHaveContactForm: false, extraNotes: "" },
          specDocCID: normalized?.specDocCID ?? ZERO_BYTES32,
          budgetMin: normalized?.budgetMin ?? 0n,
          budgetMax: normalized?.budgetMax ?? 0n,
          deadline: normalized?.deadline ?? 0n,
          state: normalized?.state ?? 0n,
          assignedFreelancer: normalized?.assignedFreelancer ?? ZERO_ADDRESS,
          escrowVault: normalized?.escrowVault ?? ZERO_ADDRESS,
          bids,
        };
      })
      .filter(Boolean);
    setJobs(parsed);
  }, [rawJobs, rawBids]);

  const openJobs = jobs.filter((job) => Number(job.state) === 0);
  const visibleByState = showClosed ? jobs : openJobs;
  const filtered = visibleByState.filter((job) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return (
      String(job.jobId).includes(query) ||
      getJobTitle(job).toLowerCase().includes(query) ||
      (job.checklist?.extraNotes || "").toLowerCase().includes(query) ||
      (job.checklist?.requiredPages || []).some((page) => page.toLowerCase().includes(query))
    );
  });

  const isLoading = countLoading || jobsLoading || bidsLoading;

  return (
    <div className="page-wrapper fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Browse Jobs</h1>
          <p className="page-subtitle">
            Open JobBoard listings for freelancers.
            {count > 0 && (
              <span className="text-teal" style={{ marginLeft: "0.5rem" }}>
                {openJobs.length} open / {count} total on-chain
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="toggle-row" style={{ gap: "0.5rem" }}>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={showClosed}
                onChange={(event) => setShowClosed(event.target.checked)}
              />
              <span className="toggle-track" />
            </label>
            <span className="text-sm text-secondary">Show assigned/closed</span>
          </div>

          <div style={{ position: "relative" }}>
            <Search
              size={15}
              style={{
                position: "absolute",
                left: 11,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-tertiary)",
                pointerEvents: "none",
              }}
            />
            <input
              className="form-input"
              placeholder="Search jobs..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              style={{ paddingLeft: "2.1rem", width: 240 }}
            />
          </div>
        </div>
      </div>

      {!isFreelancerMode && (
        <Notice variant="warning" label="Client Mode active">
          Switch to Freelancer Mode before submitting proposals.
        </Notice>
      )}
      {!isConnected && (
        <Notice variant="info" label="Wallet not connected">
          Connect your wallet to see whether you have already bid on a job.
        </Notice>
      )}

      {isLoading && (
        <div className="jobs-grid mt-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} height="220px" lines={3} />
          ))}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <EmptyState
          icon={Briefcase}
          title={count === 0 ? "No jobs posted yet" : showClosed ? "No jobs match your search" : "No open jobs right now"}
          message={
            count === 0
              ? "Once clients post jobs, they will appear here with live bid counts."
              : showClosed
                ? "Try a different search term."
                : "Assigned and closed jobs are hidden by default. Use the toggle to inspect them."
          }
        />
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="jobs-grid">
          {filtered.map((job) => (
            <JobCard key={String(job.jobId)} job={job} address={address} />
          ))}
        </div>
      )}
    </div>
  );
}
