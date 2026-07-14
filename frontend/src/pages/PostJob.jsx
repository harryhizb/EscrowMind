import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { useQueryClient } from '@tanstack/react-query';
import { parseEther, parseEventLogs } from 'viem';
import {
  AlertCircle, CalendarClock, CheckCircle, FileText, Loader,
  PlusCircle, Trash2, Upload, WalletCards
} from 'lucide-react';
import { CREDIT_MANAGER_ABI, JOB_BOARD_ABI, getContractAddress } from '../contracts.js';
import { useNetworkGuard } from '../hooks/useNetworkGuard.js';
import Notice from '../components/Notice.jsx';
import Button from '../components/Button.jsx';
import { uploadFiles } from '../utils/filePipeline.js';


const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const MAX_TITLE_LENGTH = 80;
const MIN_DESCRIPTION_LENGTH = 40;

function tomorrowDate() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

function daysFromNow(dateString) {
  if (!dateString) return '';
  const target = new Date(`${dateString}T23:59:59`);
  const diff = Math.ceil((target.getTime() - Date.now()) / 86400000);
  if (diff <= 0) return 'Deadline must be in the future';
  return `${diff} day${diff === 1 ? '' : 's'} from now`;
}

async function uploadBlob(fileName, blob) {
  const form = new FormData();
  form.append('file', blob, fileName);
  const response = await fetch(`${BACKEND_URL}/upload`, { method: 'POST', body: form });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(data.error || 'Upload failed');
  return data;
}

export default function PostJob() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { address, isConnected } = useAccount();
  const { canTransact } = useNetworkGuard();
  const { writeContractAsync, data: txHash, error: writeError, isPending } = useWriteContract();
  const { data: receipt, isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const [createdJobId, setCreatedJobId] = useState(null);
  const [submitError, setSubmitError] = useState('');

  const { data: creditBalance } = useReadContract({
    address: getContractAddress('CreditManager'),
    abi: CREDIT_MANAGER_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 8000 },
  });

  const { data: jobPostCost } = useReadContract({
    address: getContractAddress('CreditManager'),
    abi: CREDIT_MANAGER_ABI,
    functionName: 'JOB_POST_COST',
  });

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [pages, setPages] = useState(['home', 'about', 'contact']);
  const [newPage, setNewPage] = useState('');
  const [mustBeResponsive, setMustBeResponsive] = useState(true);
  const [mustHaveContactForm, setMustHaveContactForm] = useState(true);
  const [extraNotes, setExtraNotes] = useState('');
  const [budgetMin, setBudgetMin] = useState('0.0001');
  const [budgetMax, setBudgetMax] = useState('0.001');
  const [deadline, setDeadline] = useState(tomorrowDate());
  const [referenceFiles, setReferenceFiles] = useState([]);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadPercent, setUploadPercent] = useState(0);
  const [fieldErrors, setFieldErrors] = useState({});


  const balance = creditBalance !== undefined ? Number(creditBalance) : 0;
  const postCost = jobPostCost !== undefined ? Number(jobPostCost) : 2;
  const hasEnoughCredits = balance >= postCost;
  const minDate = new Date().toISOString().slice(0, 10);

  const statusLabel = useMemo(() => {
    if (isPending) return 'Confirm in wallet...';
    if (isConfirming) return 'Confirming transaction...';
    return '';
  }, [isPending, isConfirming]);

  useEffect(() => {
    if (!isSuccess || !receipt) return;
    queryClient.invalidateQueries();
    const logs = parseEventLogs({
      abi: JOB_BOARD_ABI,
      eventName: 'JobPosted',
      logs: receipt.logs,
    });
    const jobId = logs.find((log) => log.address.toLowerCase() === getContractAddress('JobBoard').toLowerCase())?.args?.jobId;
    if (jobId !== undefined) {
      setCreatedJobId(String(jobId));
      const timer = setTimeout(() => navigate(`/jobs/${String(jobId)}`), 2500);
      return () => clearTimeout(timer);
    }
    setSubmitError('Transaction confirmed, but the JobPosted event was not found in the receipt.');
  }, [isSuccess, receipt, navigate, queryClient]);

  useEffect(() => {
    if (writeError) setSubmitError(writeError.shortMessage || writeError.message);
  }, [writeError]);

  const addPage = () => {
    const trimmed = newPage.trim().toLowerCase().replace(/^\//, '');
    if (!trimmed) return;
    if (!pages.includes(trimmed)) setPages((current) => [...current, trimmed]);
    setNewPage('');
  };

  const removePage = (page) => setPages((current) => current.filter((item) => item !== page));

  const onFilesSelected = (files) => {
    setReferenceFiles(Array.from(files || []));
    setUploadedFiles([]);
    setUploadError('');
  };

  const uploadReferenceFiles = () => {
    if (referenceFiles.length === 0) return Promise.resolve([]);
    setIsUploading(true);
    setUploadError('');
    setUploadPercent(0);
    return new Promise((resolve, reject) => {
      uploadFiles(referenceFiles, {
        onProgress: (percent) => {
          setUploadPercent(percent);
        },
        onSuccess: (res) => {
          const result = [{
            name: referenceFiles.length === 1 ? referenceFiles[0].name : 'attachments.zip',
            size: referenceFiles.reduce((acc, f) => acc + f.size, 0),
            cid: res.cid,
            hash: res.hash
          }];
          setUploadedFiles(result);
          setIsUploading(false);
          resolve(result);
        },
        onError: (err) => {
          setUploadError(err.message || 'Upload failed');
          setIsUploading(false);
          reject(err);
        }
      });
    });
  };

  const validate = () => {
    const nextErrors = {};
    if (!title.trim()) nextErrors.title = 'Title is required.';
    if (title.trim().length > MAX_TITLE_LENGTH) nextErrors.title = `Use ${MAX_TITLE_LENGTH} characters or fewer.`;
    if (description.trim().length < MIN_DESCRIPTION_LENGTH) {
      nextErrors.description = `Description must be at least ${MIN_DESCRIPTION_LENGTH} characters.`;
    }
    if (pages.length === 0) nextErrors.pages = 'Add at least one required page.';
    if (Number(budgetMin) <= 0) nextErrors.budgetMin = 'Minimum budget must be greater than 0.';
    if (Number(budgetMax) <= 0) nextErrors.budgetMax = 'Maximum budget must be greater than 0.';
    if (Number(budgetMin) > Number(budgetMax)) nextErrors.budgetMax = 'Maximum budget must be greater than or equal to minimum budget.';
    if (!deadline) nextErrors.deadline = 'Deadline is required.';
    if (deadline && new Date(`${deadline}T23:59:59`).getTime() <= Date.now()) nextErrors.deadline = 'Deadline must be in the future.';
    if (!hasEnoughCredits) nextErrors.credits = `Posting costs ${postCost} credits. You have ${balance}.`;
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError('');
    setCreatedJobId(null);
    if (!validate()) return;
    if (!isConnected) return setSubmitError('Please connect your wallet first.');
    if (!canTransact) return setSubmitError('Please switch to Avalanche Fuji Testnet before posting.');

    try {
      let attachments = uploadedFiles;
      if (referenceFiles.length > 0 && uploadedFiles.length === 0) {
        attachments = await uploadReferenceFiles();
      }


      const specDocument = {
        title: title.trim(),
        description: description.trim(),
        checklist: { requiredPages: pages, mustBeResponsive, mustHaveContactForm, extraNotes: extraNotes.trim() },
        budget: { minAvax: budgetMin, maxAvax: budgetMax },
        deadline,
        attachments,
        createdBy: address,
        createdAt: new Date().toISOString(),
      };
      const specBlob = new Blob([JSON.stringify(specDocument, null, 2)], { type: 'application/json' });
      const specUpload = await uploadBlob(`job-spec-${Date.now()}.json`, specBlob);
      const deadlineTs = Math.floor(new Date(`${deadline}T23:59:59`).getTime() / 1000);

      await writeContractAsync({
        address: getContractAddress('JobBoard'),
        abi: JOB_BOARD_ABI,
        functionName: 'postJob',
        args: [
          [pages, mustBeResponsive, mustHaveContactForm, extraNotes.trim()],
          specUpload.hash,
          parseEther(budgetMin),
          parseEther(budgetMax),
          deadlineTs,
        ],
      });
    } catch (error) {
      setSubmitError(error.shortMessage || error.message || 'Failed to post job.');
    }
  };

  const errorFor = (field) => fieldErrors[field] ? (
    <p className="form-error"><AlertCircle size={13} /> {fieldErrors[field]}</p>
  ) : null;

  return (
    <div className="post-job-page page-wrapper">

      {/* Page Header */}
      <div className="page-header">
        <div>
          <p className="eyebrow">Client Dashboard</p>
          <h1 className="page-title">Post a New Job</h1>
          <p className="page-subtitle">
            Posting creates job metadata and spends {postCost} credits. Funds are not taken yet — escrow funding happens after you accept a freelancer bid.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="chip chip-teal">
            <WalletCards size={14} />
            {balance} credits available
          </span>
          <span className="chip chip-amber">
            Cost: {postCost} credits
          </span>
        </div>
      </div>

      {/* Success Panel */}
      {createdJobId && (
        <Notice variant="success" label={`Job #${createdJobId} posted successfully!`}>
          <span>Redirecting to the Job Detail page in a moment…</span>
          <div className="flex gap-2 mt-2">
            <Link className="btn btn-outline btn-sm" to={`/jobs/${createdJobId}`}>
              View Job #{createdJobId}
            </Link>
          </div>
        </Notice>
      )}

      {/* Submit Error */}
      {submitError && (
        <Notice variant="danger" label="Submission Error">
          {submitError}
        </Notice>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">

        {/* Step A: Basic Info */}
        <div className="card post-job-section">
          <div className="post-job-step-num">A</div>
          <div className="post-job-step-body">
            <p className="section-label">Basic Info</p>
            <p className="text-muted text-sm mb-4">Give freelancers enough context to understand the work before they bid.</p>

            <div className="form-group">
              <label className="form-label">
                Title
                <span className="text-dim text-xs ml-auto">{title.length}/{MAX_TITLE_LENGTH}</span>
              </label>
              <input
                className="form-input"
                value={title}
                maxLength={MAX_TITLE_LENGTH}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Landing page for a Fuji testnet app"
              />
              {errorFor('title')}
            </div>

            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea
                className="form-textarea"
                rows={7}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Describe the project scope, goals, audience, pages, and any context a freelancer needs."
              />
              <p className="form-helper">{description.trim().length} / {MIN_DESCRIPTION_LENGTH} minimum characters</p>
              {errorFor('description')}
            </div>
          </div>
        </div>

        {/* Step B: Requirements Checklist */}
        <div className="card post-job-section">
          <div className="post-job-step-num">B</div>
          <div className="post-job-step-body">
            <p className="section-label">Requirements Checklist</p>
            <p className="text-muted text-sm mb-4">These structured fields map directly to the on-chain checklist. Extra notes are informational only, not automatically verified.</p>

            <div className="form-group">
              <label className="form-label">Required Pages</label>
              <div className="chip-row mb-2">
                {pages.map((page) => (
                  <span className="mini-chip mini-chip-teal" key={page}>
                    /{page}
                    <button type="button" onClick={() => removePage(page)} aria-label={`Remove ${page}`}>
                      <Trash2 size={11} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="input-action-row">
                <input
                  className="form-input"
                  value={newPage}
                  onChange={(event) => setNewPage(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && (event.preventDefault(), addPage())}
                  placeholder="services"
                />
                <button type="button" className="btn btn-outline btn-sm" onClick={addPage}>
                  <PlusCircle size={14} /> Add
                </button>
              </div>
              {errorFor('pages')}
            </div>

            <div className="toggle-row">
              <div>
                <p className="font-600">Must be responsive</p>
                <p className="text-sm text-muted">Verifier checks mobile viewport behavior.</p>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={mustBeResponsive}
                  onChange={(event) => setMustBeResponsive(event.target.checked)}
                />
                <span className="toggle-track" />
              </label>
            </div>

            <div className="toggle-row">
              <div>
                <p className="font-600">Must have contact form</p>
                <p className="text-sm text-muted">Verifier checks for a form element.</p>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={mustHaveContactForm}
                  onChange={(event) => setMustHaveContactForm(event.target.checked)}
                />
                <span className="toggle-track" />
              </label>
            </div>

            <div className="form-group mt-4">
              <label className="form-label">Extra Notes</label>
              <textarea
                className="form-textarea"
                rows={4}
                value={extraNotes}
                onChange={(event) => setExtraNotes(event.target.value)}
                placeholder="Informational only, not automatically verified."
              />
            </div>
          </div>
        </div>

        {/* Step C: Budget & Timeline */}
        <div className="card post-job-section">
          <div className="post-job-step-num">C</div>
          <div className="post-job-step-body">
            <p className="section-label">Budget &amp; Timeline</p>
            <p className="text-muted text-sm mb-4">Use Fuji testnet AVAX amounts. Escrow funding happens later, after bid acceptance.</p>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">
                  Minimum Budget
                  <span className="text-dim text-xs">AVAX on Fuji</span>
                </label>
                <input
                  className="form-input"
                  type="number"
                  step="0.00001"
                  min="0"
                  value={budgetMin}
                  onChange={(event) => setBudgetMin(event.target.value)}
                />
                {errorFor('budgetMin')}
              </div>
              <div className="form-group">
                <label className="form-label">
                  Maximum Budget
                  <span className="text-dim text-xs">AVAX on Fuji</span>
                </label>
                <input
                  className="form-input"
                  type="number"
                  step="0.00001"
                  min="0"
                  value={budgetMax}
                  onChange={(event) => setBudgetMax(event.target.value)}
                />
                {errorFor('budgetMax')}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Deadline</label>
              <input
                className="form-input"
                type="date"
                min={minDate}
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
              />
              <p className="form-helper">
                <CalendarClock size={13} />
                {daysFromNow(deadline)}
              </p>
              {errorFor('deadline')}
            </div>
          </div>
        </div>

        {/* Step D: Reference Files */}
        <div className="card post-job-section">
          <div className="post-job-step-num">D</div>
          <div className="post-job-step-body">
            <p className="section-label">Reference Files</p>
            <p className="text-muted text-sm mb-4">Optional attachments are uploaded first and included in the job specification JSON.</p>

            <label className="dropzone">
              <Upload size={22} />
              <span>
                {referenceFiles.length
                  ? `${referenceFiles.length} file${referenceFiles.length === 1 ? '' : 's'} selected`
                  : 'Drop files here or click to choose'}
              </span>
              <input type="file" multiple onChange={(event) => onFilesSelected(event.target.files)} />
            </label>

            {referenceFiles.length > 0 && (
              <div className="chip-row mt-3">
                {referenceFiles.map((file) => (
                  <span className="mini-chip" key={`${file.name}-${file.size}`}>
                    <FileText size={12} /> {file.name}
                  </span>
                ))}
              </div>
            )}

            {referenceFiles.length > 0 && uploadedFiles.length === 0 && (
              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={uploadReferenceFiles}
                  disabled={isUploading}
                >
                  {isUploading ? <Loader size={14} className="spin" /> : <Upload size={14} />}
                  {isUploading ? `Uploading (${uploadPercent}%)…` : 'Upload Selected Files'}
                </button>
                {isUploading && (
                  <span className="text-sm text-secondary">
                    {referenceFiles.length > 1 ? 'Zipping and uploading...' : 'Uploading raw file...'}
                  </span>
                )}
              </div>
            )}

            {uploadedFiles.length > 0 && (
              <div className="mt-3">
                <Notice variant="success" label="Upload complete">
                  {referenceFiles.length} file{referenceFiles.length === 1 ? '' : 's'} packed and uploaded successfully as a single optimized spec bundle.
                </Notice>
              </div>
            )}

            {uploadError && (
              <p className="form-error mt-2"><AlertCircle size={13} /> {uploadError}</p>
            )}
          </div>
        </div>

        {/* Step E: Review & Submit */}
        <div className="card post-job-section">
          <div className="post-job-step-num">E</div>
          <div className="post-job-step-body">
            <p className="section-label">Review &amp; Submit</p>
            <p className="text-muted text-sm mb-4">Confirm everything before committing the job post transaction.</p>

            <div className="review-grid">
              <div className="review-cell">
                <p className="review-cell-label">Title</p>
                <p className="review-cell-value">{title || <span className="text-dim">Not set</span>}</p>
              </div>
              <div className="review-cell">
                <p className="review-cell-label">Budget</p>
                <p className="review-cell-value text-amber font-mono">
                  {budgetMin || '—'} – {budgetMax || '—'} AVAX
                </p>
              </div>
              <div className="review-cell">
                <p className="review-cell-label">Deadline</p>
                <p className="review-cell-value">{deadline || <span className="text-dim">Not set</span>}</p>
              </div>
              <div className="review-cell">
                <p className="review-cell-label">Pages</p>
                <p className="review-cell-value">
                  {pages.length > 0
                    ? <span className="chip-row">{pages.map((page) => <span className="mini-chip" key={page}>/{page}</span>)}</span>
                    : <span className="text-dim">None</span>}
                </p>
              </div>
              <div className="review-cell">
                <p className="review-cell-label">Responsive</p>
                <p className="review-cell-value">{mustBeResponsive ? 'Required' : 'Not required'}</p>
              </div>
              <div className="review-cell">
                <p className="review-cell-label">Contact Form</p>
                <p className="review-cell-value">{mustHaveContactForm ? 'Required' : 'Not required'}</p>
              </div>
              <div className="review-cell review-cell-wide">
                <p className="review-cell-label">Description</p>
                <p className="review-cell-value text-sm">{description || <span className="text-dim">Not set</span>}</p>
              </div>
              <div className="review-cell review-cell-wide">
                <p className="review-cell-label">Reference Files</p>
                <p className="review-cell-value text-sm">
                  {uploadedFiles.length
                    ? uploadedFiles.map((file) => `${file.name} (${file.cid})`).join(', ')
                    : <span className="text-dim">None uploaded</span>}
                </p>
              </div>
            </div>

            <div className="mt-4">
              <Notice variant={hasEnoughCredits ? 'success' : 'warning'} label="Credit Cost">
                Posting this job costs <strong>{postCost} credits</strong> — you currently have <strong>{balance} credits</strong>.
              </Notice>
            </div>

            {errorFor('credits')}

            {!hasEnoughCredits && (
              <Link className="btn btn-secondary btn-sm mt-2" to="/dashboard">
                Earn or Claim Credits
              </Link>
            )}

            <div className="mt-4">
              <button
                className="btn btn-value btn-lg w-full"
                type="submit"
                disabled={!isConnected || !canTransact || !hasEnoughCredits || isPending || isConfirming || isUploading}
              >
                {isUploading ? (
                  <><Loader size={18} className="spin" /> Uploading Reference Files...</>
                ) : statusLabel ? (
                  <><Loader size={18} className="spin" /> {statusLabel}</>
                ) : (
                  <><PlusCircle size={18} /> Post Job On-Chain</>
                )}
              </button>
            </div>
          </div>
        </div>

      </form>
    </div>
  );
}
