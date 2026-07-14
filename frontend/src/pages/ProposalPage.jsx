import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract
} from 'wagmi';
import { formatEther, parseEther } from 'viem';
import {
  ArrowLeft, FileUp, Loader, Plus, Send, Trash2, Zap
} from 'lucide-react';
import { CREDIT_MANAGER_ABI, JOB_BOARD_ABI, getContractAddress } from '../contracts.js';
import { useNetworkGuard } from '../hooks/useNetworkGuard.js';
import CreditsModal from '../components/CreditsModal.jsx';
import AmountDisplay from '../components/AmountDisplay.jsx';
import AddressDisplay from '../components/AddressDisplay.jsx';
import Notice from '../components/Notice.jsx';
import SkeletonCard from '../components/SkeletonCard.jsx';
import Button from '../components/Button.jsx';
import { uploadFiles, downloadFile } from '../utils/filePipeline.js';


const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000';

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

function getJobTitle(job, jobId) {
  const pages = job?.checklist?.requiredPages ?? [];
  if (pages.length > 0) return `Build ${pages.slice(0, 3).map((page) => `/${page}`).join(', ')}`;
  return `Job #${jobId}`;
}

async function uploadBlob(fileName, blob) {
  const form = new FormData();
  form.append('file', blob, fileName);
  const response = await fetch(`${BACKEND_URL}/upload`, { method: 'POST', body: form });
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Upload failed');
  }
  return data;
}

export default function ProposalPage() {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { address, isConnected } = useAccount();
  const { canTransact } = useNetworkGuard();
  const [amount, setAmount] = useState('');
  const [estimatedDays, setEstimatedDays] = useState('14');
  const [proposalText, setProposalText] = useState('');
  const [portfolioLinks, setPortfolioLinks] = useState(['']);
  const [attachment, setAttachment] = useState(null);
  const [status, setStatus] = useState('');
  const [formError, setFormError] = useState('');
  const [showCreditsModal, setShowCreditsModal] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
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

  const parsedJobId = useMemo(() => {
    try {
      return BigInt(jobId);
    } catch {
      return null;
    }
  }, [jobId]);

  const jobBoardAddress = getContractAddress('JobBoard');
  const creditManagerAddress = getContractAddress('CreditManager');

  const { data: rawJob, isLoading: jobLoading } = useReadContract({
    address: jobBoardAddress,
    abi: JOB_BOARD_ABI,
    functionName: 'jobs',
    args: parsedJobId !== null ? [parsedJobId] : undefined,
    query: { enabled: parsedJobId !== null, refetchInterval: 10000 },
  });

  const { data: rawBids } = useReadContract({
    address: jobBoardAddress,
    abi: JOB_BOARD_ABI,
    functionName: 'getBids',
    args: parsedJobId !== null ? [parsedJobId] : undefined,
    query: { enabled: parsedJobId !== null, refetchInterval: 10000 },
  });

  const { data: creditBalance } = useReadContract({
    address: creditManagerAddress,
    abi: CREDIT_MANAGER_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 8000 },
  });

  const { data: bidCost } = useReadContract({
    address: creditManagerAddress,
    abi: CREDIT_MANAGER_ABI,
    functionName: 'BID_COST',
    query: { refetchInterval: 30000 },
  });

  const { writeContractAsync, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const job = rawJob ? normalizeJobResult(rawJob) : null;
  const bids = (rawBids ?? []).map(normalizeBid);
  const activeBids = bids.filter((bid) => !bid.withdrawn);
  const existingBid = activeBids.find(
    (bid) => address && bid.freelancer?.toLowerCase() === address.toLowerCase()
  );
  const isOwnJob = !!address && !!job?.client && job.client.toLowerCase() === address.toLowerCase();
  const cost = bidCost !== undefined ? Number(bidCost) : 1;
  const balance = creditBalance !== undefined ? Number(creditBalance) : 0;
  const hasEnoughCredits = balance >= cost;
  const amountBigInt = amount ? parseEther(amount) : 0n;
  const belowBudget = job && amount && amountBigInt < job.budgetMin;
  const aboveBudget = job && amount && amountBigInt > job.budgetMax;
  const outsideBudget = belowBudget || aboveBudget;
  const canSubmit =
    isConnected &&
    canTransact &&
    parsedJobId !== null &&
    job &&
    Number(job.state) === 0 &&
    !existingBid &&
    !isOwnJob &&
    hasEnoughCredits &&
    amount &&
    Number(estimatedDays) > 0 &&
    proposalText.trim().length >= 40 &&
    !outsideBudget &&
    !isPending &&
    !isConfirming;

  useEffect(() => {
    if (job && !amount) {
      setAmount(formatEther(job.budgetMin));
    }
  }, [job, amount]);

  useEffect(() => {
    if (isSuccess) {
      queryClient.invalidateQueries();
      const timer = setTimeout(() => navigate('/my-bids', { replace: true }), 1200);
      return () => clearTimeout(timer);
    }
  }, [isSuccess, navigate, queryClient]);

  const updatePortfolioLink = (index, value) => {
    setPortfolioLinks((links) => links.map((link, i) => (i === index ? value : link)));
  };

  const addPortfolioLink = () => setPortfolioLinks((links) => [...links, '']);
  const removePortfolioLink = (index) => {
    setPortfolioLinks((links) => links.filter((_, i) => i !== index));
  };

  const submitProposal = async (event) => {
    event.preventDefault();
    setFormError('');

    if (!canSubmit) {
      setFormError('Please complete all required fields and resolve any warnings before submitting.');
      return;
    }

    try {
      let attachmentUpload = null;
      if (attachment) {
        setStatus('Uploading attachment to IPFS...');
        setIsUploading(true);
        setUploadPercent(0);
        const uploadRes = await new Promise((resolve, reject) => {
          uploadFiles([attachment], {
            onProgress: (percent) => setUploadPercent(percent),
            onSuccess: (res) => resolve(res),
            onError: (err) => reject(err),
          });
        });
        attachmentUpload = uploadRes;
        setIsUploading(false);
      }

      const proposalPayload = {
        type: 'escrowmind-proposal',
        version: 1,
        jobId: String(jobId),
        freelancer: address,
        bidAmountAvax: amount,
        estimatedDays: Number(estimatedDays),
        coverLetter: proposalText.trim(),
        portfolioLinks: portfolioLinks.map((link) => link.trim()).filter(Boolean),
        attachment: attachmentUpload ? {
          name: attachment.name,
          cid: attachmentUpload.cid,
          hash: attachmentUpload.hash,
          size: attachment.size,
          type: attachment.type || 'application/octet-stream',
        } : null,
        createdAt: new Date().toISOString(),
      };

      const proposalBlob = new Blob([JSON.stringify(proposalPayload, null, 2)], {
        type: 'application/json',
      });
      const proposalUpload = await uploadBlob(`proposal-job-${jobId}-${Date.now()}.json`, proposalBlob);

      setStatus('Waiting for wallet confirmation...');
      await writeContractAsync({
        address: jobBoardAddress,
        abi: JOB_BOARD_ABI,
        functionName: 'submitBid',
        args: [parsedJobId, parseEther(amount), proposalUpload.hash, Number(estimatedDays)],
      });
      setStatus('Transaction submitted. Waiting for confirmation...');
    } catch (error) {
      setStatus('');
      setFormError(error?.shortMessage || error?.message || 'Proposal submission failed');
    }
  };

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

  if (jobLoading) {
    return (
      <div className="page-wrapper fade-in">
        <div className="detail-layout">
          <div className="flex flex-col gap-4">
            <SkeletonCard height="180px" lines={3} />
            <SkeletonCard height="240px" lines={4} />
          </div>
          <div className="flex flex-col gap-4">
            <SkeletonCard height="120px" lines={2} />
          </div>
        </div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="page-wrapper fade-in">
        <div className="card" style={{ maxWidth: 560, margin: '3rem auto', textAlign: 'center', padding: '3rem' }}>
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
      {/* Back button */}
      <div>
        <Button as={Link} to={`/jobs/${jobId}`} variant="ghost" size="sm" icon={ArrowLeft} className="mb-4">
          Back to Job Detail
        </Button>
      </div>

      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title">Submit Proposal</h1>
          <p className="page-subtitle">{getJobTitle(job, jobId)}</p>
        </div>
      </div>

      <div className="detail-layout">
        {/* Main Form Column */}
        <div className="flex flex-col gap-4">
          <form onSubmit={submitProposal} className="card">
            <div className="flex flex-col gap-4">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label form-label-required">Bid Amount (AVAX)</label>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    step="0.00001"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label form-label-required">Estimated Delivery (days)</label>
                  <input
                    className="form-input"
                    type="number"
                    min="1"
                    value={estimatedDays}
                    onChange={(event) => setEstimatedDays(event.target.value)}
                    required
                  />
                </div>
              </div>

              {outsideBudget && (
                <Notice variant="warning" label="Out of Budget Range">
                  This bid is outside the client budget of <AmountDisplay wei={job.budgetMin} size="sm" /> - <AmountDisplay wei={job.budgetMax} size="sm" />. Bids outside range are rejected by the contract.
                </Notice>
              )}

              <div className="form-group">
                <label className="form-label form-label-required">Proposal / Cover Letter</label>
                <textarea
                  className="form-textarea"
                  rows={8}
                  placeholder="Explain your approach, relevant experience, delivery plan, and what the client should expect."
                  value={proposalText}
                  onChange={(event) => setProposalText(event.target.value)}
                  required
                />
                <div className="form-helper">
                  Minimum 40 characters. Current: {proposalText.trim().length}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Portfolio Links</label>
                <div className="grid gap-2">
                  {portfolioLinks.map((link, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        className="form-input"
                        type="url"
                        placeholder="https://..."
                        value={link}
                        onChange={(event) => updatePortfolioLink(index, event.target.value)}
                      />
                      {portfolioLinks.length > 1 && (
                        <Button
                          type="button"
                          variant="danger"
                          onClick={() => removePortfolioLink(index)}
                          icon={Trash2}
                          aria-label="Remove portfolio link"
                        />
                      )}
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={addPortfolioLink}
                    icon={Plus}
                    style={{ justifySelf: 'start' }}
                  >
                    Add Link
                  </Button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Optional Attachment</label>
                <input
                  id="proposal-attachment"
                  type="file"
                  style={{ display: 'none' }}
                  onChange={(event) => setAttachment(event.target.files?.[0] ?? null)}
                />
                <label htmlFor="proposal-attachment" className="btn btn-secondary" style={{ cursor: 'pointer', alignSelf: 'start' }}>
                  <FileUp size={15} /> {attachment ? attachment.name : 'Choose File'}
                </label>
              </div>

              {formError && (
                <Notice variant="danger" label="Error">
                  {formError}
                </Notice>
              )}

              {status && (
                <Notice variant="info" label="Status">
                  {status}
                </Notice>
              )}

              {isSuccess && (
                <Notice variant="success" label="Success">
                  Proposal confirmed. Redirecting to My Bids...
                </Notice>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                disabled={!canSubmit || isUploading}
                loading={isPending || isConfirming || isUploading}
                className="w-full"
              >
                {isUploading ? `Uploading Attachment (${uploadPercent}%)…` : 'Submit Proposal'}
              </Button>
            </div>
          </form>
        </div>

        {/* Sidebar Column */}
        <div className="flex flex-col gap-4">
          {/* Cost Card */}
          <div className="card">
            <h2 className="section-label mb-2">Cost</h2>
            <Notice variant={hasEnoughCredits ? 'success' : 'warning'}>
              Submitting costs {cost} credit. You have {balance} credit{balance === 1 ? '' : 's'}.
            </Notice>
            {!hasEnoughCredits && (
              <Button
                variant="primary"
                className="w-full mt-3"
                onClick={() => setShowCreditsModal(true)}
              >
                Earn or Claim Credits
              </Button>
            )}
          </div>

          {/* Job Snapshot */}
          <div className="card">
            <h2 className="section-label mb-2">Job Snapshot</h2>
            <div className="kv-list">
              <div className="kv-row">
                <span className="kv-key">Budget</span>
                <span className="kv-value">
                  <AmountDisplay wei={job.budgetMin} size="sm" /> – <AmountDisplay wei={job.budgetMax} size="sm" />
                </span>
              </div>
              <div className="kv-row">
                <span className="kv-key">Client</span>
                <span className="kv-value">
                  <AddressDisplay address={job.client} />
                </span>
              </div>
              <div className="kv-row">
                <span className="kv-key">Active Bids</span>
                <span className="kv-value">{activeBids.length} bid{activeBids.length === 1 ? '' : 's'}</span>
              </div>
            </div>
            {job.specDocCID && job.specDocCID !== ZERO_BYTES32 && (
              <Button
                type="button"
                onClick={handleDownloadSpec}
                variant="secondary"
                size="sm"
                className="w-full mt-3"
                loading={isDownloading}
              >
                Download Spec
              </Button>
            )}
          </div>

          {/* submission status reasons if blocked */}
          {(existingBid || isOwnJob || Number(job.state) !== 0 || !isConnected || !canTransact) && (
            <div className="card">
              <h2 className="section-label mb-2">Submission Status</h2>
              <p className="text-xs text-dim" style={{ lineHeight: 1.6 }}>
                {!isConnected && 'Connect your wallet to submit a proposal.'}
                {isConnected && !canTransact && 'Switch to Avalanche Fuji Testnet to submit.'}
                {existingBid && 'You already submitted a bid for this job.'}
                {isOwnJob && 'Clients cannot bid on their own job.'}
                {Number(job.state) !== 0 && 'This job is no longer open for proposals.'}
              </p>
            </div>
          )}
        </div>
      </div>
      {showCreditsModal && <CreditsModal onClose={() => setShowCreditsModal(false)} />}
    </div>
  );
}
