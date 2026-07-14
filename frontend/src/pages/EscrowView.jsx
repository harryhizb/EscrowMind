import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAccount, useReadContract, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { formatEther } from 'viem';
import { Download, Upload, CheckCircle, XCircle, AlertTriangle, Unlock, ShieldAlert, Clock, Loader, FileText, ArrowLeft } from 'lucide-react';
import StatusBadge from '../components/StatusBadge.jsx';
import { ESCROW_VAULT_ABI, JOB_BOARD_ABI, getContractAddress } from '../contracts.js';
import { useNetworkGuard } from '../hooks/useNetworkGuard.js';
import AddressDisplay from '../components/AddressDisplay.jsx';
import AmountDisplay from '../components/AmountDisplay.jsx';
import Notice from '../components/Notice.jsx';
import Button from '../components/Button.jsx';
import SkeletonCard from '../components/SkeletonCard.jsx';
import { uploadFiles, downloadFile } from '../utils/filePipeline.js';
import JobChat from '../components/JobChat.jsx';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

function VerificationReport({ logs }) {
  if (!logs || logs.length === 0) return null;
  return (
    <div className="verify-report mt-3">
      <div className="font-600 text-sm mb-2">Verification Report</div>
      {logs.map((log, i) => (
        <div key={i} className="verify-row">
          {log.passed
            ? <CheckCircle size={15} className="text-green" style={{ flexShrink: 0, marginTop: 3 }} />
            : <XCircle size={15} className="text-red" style={{ flexShrink: 0, marginTop: 3 }} />}
          <div className="verify-row-content">
            <span className="verify-row-check">{log.check}</span>
            <span className="verify-row-detail">{log.details}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function MilestonePanel({ milestone, vaultAddress, isClient, isFreelancer, checklist, deadline, arbiters, userAddress, canTransact }) {
  const [deliveryZip, setDeliveryZip] = useState(null);
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [savedDeliveryNotes, setSavedDeliveryNotes] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifyError, setVerifyError] = useState('');
  const [uploadPercent, setUploadPercent] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownloadDeliverable = () => {
    if (!deliveryHash) return;
    downloadFile(deliveryHash, `delivery-milestone-${milestone.index}.zip`, {
      onStart: () => setIsDownloading(true),
      onSuccess: () => setIsDownloading(false),
      onError: (err) => {
        setIsDownloading(false);
        alert(err.message || 'Download failed');
      }
    });
  };

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash });

  const state = Number(milestone.state);
  const isDeadlinePassed = Date.now() / 1000 > Number(deadline);

  // Read auto-release timestamp for this milestone
  const { data: autoReleaseTimestamp } = useReadContract({
    address: vaultAddress,
    abi: ESCROW_VAULT_ABI,
    functionName: 'autoReleaseTimestamp',
    args: [BigInt(milestone.index)],
  });

  // Read dispute votes — polled every 8s
  const { data: releaseVotes } = useReadContract({
    address: vaultAddress,
    abi: ESCROW_VAULT_ABI,
    functionName: 'releaseVotes',
    args: [BigInt(milestone.index)],
    query: { refetchInterval: 8000 },
  });
  const { data: refundVotes } = useReadContract({
    address: vaultAddress,
    abi: ESCROW_VAULT_ABI,
    functionName: 'refundVotes',
    args: [BigInt(milestone.index)],
    query: { refetchInterval: 8000 },
  });
  // Read if this arbiter has already cast a vote
  const { data: hasVoted } = useReadContract({
    address: vaultAddress,
    abi: ESCROW_VAULT_ABI,
    functionName: 'arbiterVoted',
    args: userAddress ? [BigInt(milestone.index), userAddress] : undefined,
    query: { enabled: !!userAddress && isArbiter, refetchInterval: 8000 },
  });
  const { data: deliveryHash } = useReadContract({
    address: vaultAddress,
    abi: ESCROW_VAULT_ABI,
    functionName: 'deliveryHashes',
    args: [BigInt(milestone.index)],
    query: { refetchInterval: 8000 },
  });

  const isArbiter = arbiters?.some(a => a?.toLowerCase() === userAddress?.toLowerCase());
  const autoReleaseRemaining = autoReleaseTimestamp ? Number(autoReleaseTimestamp) - Date.now() / 1000 : 0;
  const isDisputeWindowElapsed = autoReleaseRemaining <= 0;

  // Fetch verify logs on load if they exist
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/verify-logs/${vaultAddress}/${milestone.index}`);
        if (res.ok) {
          const data = await res.json();
          setVerifyResult(data);
        }
      } catch (e) {
        console.error('Error fetching verify logs:', e);
      }
    };
    if (vaultAddress) {
      fetchLogs();
    }
  }, [vaultAddress, milestone.index, state]);

  useEffect(() => {
    const loadNotes = async () => {
      if (!deliveryHash || /^0x0+$/.test(String(deliveryHash))) return;
      try {
        const res = await fetch(`${BACKEND_URL}/delivery-notes/${deliveryHash}`);
        if (res.ok) setSavedDeliveryNotes(await res.json());
      } catch (e) {
        console.error('Error fetching delivery notes:', e);
      }
    };
    loadNotes();
  }, [deliveryHash]);

  // Actions
  const guardTx = () => {
    if (!canTransact) {
      alert('Please switch to Avalanche Fuji Testnet before sending a transaction.');
      return false;
    }
    return true;
  };

  const handleSubmitDelivery = async () => {
    if (!guardTx()) return;
    if (!deliveryZip) return alert('Please attach your website build .zip');
    setIsVerifying(true);
    setVerifyResult(null);
    setVerifyError('');
    setIsUploading(true);
    setUploadPercent(0);

    try {
      const upData = await new Promise((resolve, reject) => {
        uploadFiles([deliveryZip], {
          onProgress: (percent) => setUploadPercent(percent),
          onSuccess: (res) => resolve(res),
          onError: (err) => reject(err)
        });
      });
      setIsUploading(false);

      const deliveryHash = upData.hash || `0x${'ab'.repeat(32)}`;
      const deliveryCID = upData.cid || 'QmDemoFallback';

      await fetch(`${BACKEND_URL}/delivery-notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliveryHash,
          notes: deliveryNotes,
          cid: deliveryCID,
          fileName: deliveryZip.name,
        }),
      });

      writeContract({
        address: vaultAddress,
        abi: ESCROW_VAULT_ABI,
        functionName: 'submitDelivery',
        args: [milestone.index, deliveryHash],
      });

      const vRes = await fetch(`${BACKEND_URL}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: 0,
          milestoneIndex: milestone.index,
          deliveryCID,
          checklist: checklist || {},
          vaultAddress,
        }),
      });
      const vData = await vRes.json();
      setVerifyResult(vData);
    } catch (e) {
      setVerifyError(e.message);
    } finally {
      setIsVerifying(false);
      setIsUploading(false);
    }
  };

  const fundMilestone = () => {
    if (!guardTx()) return;
    writeContract({
      address: vaultAddress,
      abi: ESCROW_VAULT_ABI,
      functionName: 'fundMilestone',
      args: [milestone.index],
      value: milestone.amount,
    });
  };

  const clientRelease = () => {
    if (!guardTx()) return;
    writeContract({
      address: vaultAddress,
      abi: ESCROW_VAULT_ABI,
      functionName: 'clientRelease',
      args: [milestone.index],
    });
  };

  const raiseDispute = () => {
    if (!guardTx()) return;
    writeContract({
      address: vaultAddress,
      abi: ESCROW_VAULT_ABI,
      functionName: 'raiseDispute',
      args: [milestone.index],
    });
  };

  const claimTimeoutRefund = () => {
    if (!guardTx()) return;
    writeContract({
      address: vaultAddress,
      abi: ESCROW_VAULT_ABI,
      functionName: 'claimTimeoutRefund',
      args: [milestone.index],
    });
  };

  const finalizeAutoRelease = () => {
    if (!guardTx()) return;
    writeContract({
      address: vaultAddress,
      abi: ESCROW_VAULT_ABI,
      functionName: 'finalizeAutoRelease',
      args: [milestone.index],
    });
  };

  const arbiterVote = (releaseToFreelancer) => {
    if (!guardTx()) return;
    writeContract({
      address: vaultAddress,
      abi: ESCROW_VAULT_ABI,
      functionName: 'arbiterVote',
      args: [milestone.index, releaseToFreelancer],
    });
  };

  const isLoading = isPending || isConfirming || isVerifying;
  const txDisabled = isLoading || !canTransact;

  return (
    <div className={`timeline-item ${state >= 6 ? 'completed' : state === 5 ? 'disputed' : state >= 1 ? 'active' : ''}`}>
      <div className="timeline-dot" />
      <div className="flex justify-between items-start flex-wrap gap-2 mb-3">
        <div>
          <div className="font-700 text-sm text-dim">Milestone {milestone.index + 1}</div>
          <div className="mt-1">
            <AmountDisplay wei={milestone.amount} size="lg" />
          </div>
        </div>
        <StatusBadge state={state} />
      </div>

      {/* State-driven action area */}
      <div className="flex flex-col gap-3 mt-3">
        {state === 0 && isClient && (
          <Button variant="value" className="w-full" onClick={fundMilestone} disabled={txDisabled} loading={isLoading} icon={Unlock}>
            Fund Milestone (<AmountDisplay wei={milestone.amount} size="sm" />)
          </Button>
        )}

        {state === 1 && isFreelancer && (
          <div className="card card-sm flex flex-col gap-3">
            <label className="form-label form-label-required">
              Upload website build (.zip):
            </label>
            {checklist && (
              <Notice variant="info" label="Delivery Guidelines">
                Include: {(checklist.requiredPages || []).map(p => `/${p}`).join(', ') || 'the agreed pages'}.
                Mobile Responsive: {checklist.mustBeResponsive ? 'yes' : 'no'}.
                Contact Form: {checklist.mustHaveContactForm ? 'yes' : 'no'}.
              </Notice>
            )}
            <textarea
              className="form-textarea"
              rows={3}
              placeholder="Delivery notes: how to run, setup instructions, etc."
              value={deliveryNotes}
              onChange={e => setDeliveryNotes(e.target.value)}
            />
            <div className="flex gap-2">
              <label htmlFor={`zip-${milestone.index}`} className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                <Upload size={14} /> {deliveryZip ? deliveryZip.name : 'Attach website .zip'}
              </label>
              <input
                id={`zip-${milestone.index}`}
                type="file" accept=".zip"
                style={{ display: 'none' }}
                onChange={e => setDeliveryZip(e.target.files[0])}
              />
              {deliveryZip && (
                <Button variant="primary" size="sm" onClick={handleSubmitDelivery} disabled={txDisabled} loading={isLoading}>
                  🚀 Submit Delivery
                </Button>
              )}
            </div>
          </div>
        )}

        {Number(state) >= 2 && deliveryHash && !/^0x0+$/.test(String(deliveryHash)) && (
          <Notice variant="info" label="Deliverable Attached">
            <span className="font-mono text-xs truncate block mb-1">Hash: {String(deliveryHash)}</span>
            {Number(state) === 6 && isClient && (
              <Button
                type="button"
                onClick={handleDownloadDeliverable}
                variant="outline"
                size="sm"
                className="mt-2 inline-flex"
                style={{ width: 'fit-content' }}
                loading={isDownloading}
              >
                <Download size={13} /> Download Deliverable
              </Button>
            )}
          </Notice>
        )}

        {savedDeliveryNotes?.notes && Number(state) >= 2 && (
          <div className="card card-sm">
            <div className="section-label mb-1">Freelancer Notes</div>
            <p className="text-primary text-sm" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
              {savedDeliveryNotes.notes}
            </p>
          </div>
        )}

        {state === 1 && isClient && (
          <div className="flex gap-2 flex-wrap mt-2">
            <Button variant="secondary" size="sm" onClick={clientRelease} disabled={txDisabled} loading={isLoading} icon={Unlock}>
              Manual Release
            </Button>
            {isDeadlinePassed && (
              <Button variant="danger" size="sm" onClick={claimTimeoutRefund} disabled={txDisabled} loading={isLoading} icon={Clock}>
                Claim Timeout Refund
              </Button>
            )}
          </div>
        )}

        {(state === 2 || state === 3) && isClient && (
          <div className="flex gap-2 flex-wrap mt-2">
            <Button variant="value" size="sm" onClick={clientRelease} disabled={txDisabled} loading={isLoading} icon={Unlock}>
              Release Payment
            </Button>
            {state === 3 && (
              <Button variant="danger" size="sm" onClick={raiseDispute} disabled={txDisabled} loading={isLoading} icon={ShieldAlert}>
                Raise Dispute
              </Button>
            )}
          </div>
        )}

        {state === 4 && (
          <div className="flex flex-col gap-2 mt-2">
            <Notice variant="warning" label="Auto-Releasing">
              Auto-release timer: {autoReleaseRemaining > 0 ? `${Math.ceil(autoReleaseRemaining / 60)} mins remaining` : 'Elapsed'}
            </Notice>
            <div className="flex gap-2 flex-wrap">
              {isClient && (
                <>
                  <Button variant="secondary" size="sm" onClick={clientRelease} disabled={txDisabled} loading={isLoading} icon={Unlock}>
                    Release Instantly
                  </Button>
                  {!isDisputeWindowElapsed && (
                    <Button variant="danger" size="sm" onClick={raiseDispute} disabled={txDisabled} loading={isLoading} icon={ShieldAlert}>
                      Dispute Auto-Release
                    </Button>
                  )}
                </>
              )}
              {isDisputeWindowElapsed && (
                <Button variant="primary" size="sm" onClick={finalizeAutoRelease} disabled={txDisabled} loading={isLoading} icon={Unlock}>
                  Finalize Auto Release
                </Button>
              )}
            </div>
          </div>
        )}

        {state === 5 && (
          <div className="notice notice-danger flex-col">
            <div className="notice-label flex items-center gap-1">
              <ShieldAlert size={14} /> Dispute Raised — Under Arbiter Voting
            </div>
            <div className="notice-body text-xs mt-1">
              Current Votes: {releaseVotes !== undefined ? Number(releaseVotes) : 0} Release vs {refundVotes !== undefined ? Number(refundVotes) : 0} Refund (Requires 2/3 majority)
            </div>
            {isArbiter && (
              <div className="mt-3">
                {hasVoted ? (
                  <Notice variant="success" label="Vote Recorded">
                    You have successfully cast your vote on this dispute.
                  </Notice>
                ) : (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => arbiterVote(true)} disabled={txDisabled} loading={isLoading}>
                      Vote Release
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => arbiterVote(false)} disabled={txDisabled} loading={isLoading}>
                      Vote Refund
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Verification result logs */}
      {verifyResult && (
        <div className={`mt-3 p-3 card ${verifyResult.score >= 90 ? 'card-value' : 'card-sm'}`} style={{ borderLeftWidth: '3px', borderLeftColor: verifyResult.score >= 90 ? 'var(--status-released)' : 'var(--status-review)' }}>
          <div className="flex justify-between items-center flex-wrap gap-2 mb-2">
            <span className="font-700 text-sm">Auto-Verifier Score: {verifyResult.score}%</span>
            {verifyResult.score >= 90
              ? <span className="badge badge-released"><CheckCircle size={10} /> Auto-Released</span>
              : <span className="badge badge-review"><AlertTriangle size={10} /> Needs Review</span>}
          </div>
          {verifyResult.txHash && (
            <div className="font-mono text-xs text-dim break-all mb-2">
              Tx: {verifyResult.txHash} {verifyResult.mockedTx ? '(mocked)' : ''}
            </div>
          )}
          <VerificationReport logs={verifyResult.report} />
        </div>
      )}

      {verifyError && (
        <Notice variant="danger" label="Verifier Error" className="mt-2">
          {verifyError}
        </Notice>
      )}
    </div>
  );
}

export default function EscrowView() {
  const { vaultAddress } = useParams();
  const { address, isConnected } = useAccount();
  const { canTransact } = useNetworkGuard();
  const [isDownloadingSpec, setIsDownloadingSpec] = useState(false);

  const handleDownloadSpec = () => {
    if (!matchingJobData?.specDocCID) return;
    downloadFile(matchingJobData.specDocCID, 'spec-document.zip', {
      onStart: () => setIsDownloadingSpec(true),
      onSuccess: () => setIsDownloadingSpec(false),
      onError: (err) => {
        setIsDownloadingSpec(false);
        alert(err.message || 'Download failed');
      }
    });
  };

  // On-chain reads
  const { data: client, isLoading: clientLoading } = useReadContract({ address: vaultAddress, abi: ESCROW_VAULT_ABI, functionName: 'client' });
  const { data: freelancer, isLoading: freelancerLoading } = useReadContract({ address: vaultAddress, abi: ESCROW_VAULT_ABI, functionName: 'freelancer' });
  const { data: deadline, isLoading: deadlineLoading } = useReadContract({ address: vaultAddress, abi: ESCROW_VAULT_ABI, functionName: 'deadline' });
  const { data: milestoneAmount, isLoading: amountLoading } = useReadContract({ address: vaultAddress, abi: ESCROW_VAULT_ABI, functionName: 'milestoneAmounts', args: [0n] });
  const { data: milestoneState, isLoading: stateLoading, refetch: refetchState } = useReadContract({
    address: vaultAddress,
    abi: ESCROW_VAULT_ABI,
    functionName: 'getMilestoneState',
    args: [0],
  });

  // Read arbiters
  const { data: arbiter0 } = useReadContract({ address: vaultAddress, abi: ESCROW_VAULT_ABI, functionName: 'arbiters', args: [0n] });
  const { data: arbiter1 } = useReadContract({ address: vaultAddress, abi: ESCROW_VAULT_ABI, functionName: 'arbiters', args: [1n] });
  const { data: arbiter2 } = useReadContract({ address: vaultAddress, abi: ESCROW_VAULT_ABI, functionName: 'arbiters', args: [2n] });

  // Read JobBoard to find the matching job checklist
  const jobBoardAddr = getContractAddress('JobBoard');
  const { data: jobCount } = useReadContract({ address: jobBoardAddr, abi: JOB_BOARD_ABI, functionName: 'jobCounter' });
  const count = jobCount !== undefined ? Number(jobCount) : 0;
  const jobCalls = Array.from({ length: count }, (_, i) => ({
    address: jobBoardAddr,
    abi: JOB_BOARD_ABI,
    functionName: 'jobs',
    args: [BigInt(i)],
  }));
  const { data: rawJobs } = useReadContracts({
    contracts: jobCalls,
    query: { enabled: count > 0 },
  });

  const matchingJob = rawJobs?.find(r => {
    if (r.status !== 'success' || !r.result) return false;
    const vAddr = Array.isArray(r.result) ? r.result[8] : r.result.escrowVault;
    return vAddr?.toLowerCase() === vaultAddress?.toLowerCase();
  });

  let checklist = null;
  let matchingJobData = null;
  if (matchingJob) {
    const jobResult = matchingJob.result;
    matchingJobData = {
      jobId: rawJobs?.findIndex(r => r === matchingJob),
      specDocCID: Array.isArray(jobResult) ? jobResult[2] : jobResult.specDocCID,
      budgetMin: Array.isArray(jobResult) ? jobResult[3] : jobResult.budgetMin,
      budgetMax: Array.isArray(jobResult) ? jobResult[4] : jobResult.budgetMax,
    };
    const rawChecklist = Array.isArray(jobResult) ? jobResult[1] : jobResult.checklist;
    checklist = {
      requiredPages: rawChecklist?.[0] || rawChecklist?.requiredPages || [],
      mustBeResponsive: rawChecklist?.[1] || rawChecklist?.mustBeResponsive || false,
      mustHaveContactForm: rawChecklist?.[2] || rawChecklist?.mustHaveContactForm || false,
      extraNotes: rawChecklist?.[3] || rawChecklist?.extraNotes || '',
    };
  }

  // Refetch state every 4s
  useEffect(() => {
    const interval = setInterval(() => {
      refetchState();
    }, 4000);
    return () => clearInterval(interval);
  }, [refetchState]);

  const isClient = address?.toLowerCase() === client?.toLowerCase();
  const isFreelancer = address?.toLowerCase() === freelancer?.toLowerCase();
  const arbiters = [arbiter0, arbiter1, arbiter2];

  const isLoading = clientLoading || freelancerLoading || deadlineLoading || amountLoading || stateLoading;

  if (isLoading) {
    return (
      <div className="page-wrapper fade-in">
        <div className="detail-layout">
          <div className="flex flex-col gap-4">
            <SkeletonCard height="160px" lines={3} />
            <SkeletonCard height="240px" lines={4} />
          </div>
          <div className="flex flex-col gap-4">
            <SkeletonCard height="140px" lines={2} />
          </div>
        </div>
      </div>
    );
  }

  if (!client || !freelancer) {
    return (
      <div className="page-wrapper fade-in">
        <div className="card" style={{ maxWidth: 560, margin: '4rem auto', textAlign: 'center', padding: '3rem' }}>
          <AlertTriangle size={48} className="text-red mb-4" style={{ margin: '0 auto 1rem' }} />
          <h2 className="mb-2">Vault Not Found</h2>
          <p className="text-secondary">Could not read details from escrow vault at {vaultAddress}.</p>
          <Link to="/my-vaults" className="btn btn-outline btn-sm mt-4">
            Back to Escrow Vaults
          </Link>
        </div>
      </div>
    );
  }

  const daysLeft = Math.max(0, Math.ceil((Number(deadline) - Date.now() / 1000) / 86400));
  const milestone = {
    index: 0,
    amount: BigInt(milestoneAmount),
    state: Number(milestoneState),
  };

  return (
    <div className="page-wrapper fade-in">
      {/* Back to Vaults */}
      <div>
        <Button as={Link} to="/my-vaults" variant="ghost" size="sm" icon={ArrowLeft} className="mb-4">
          Back to Vaults
        </Button>
      </div>

      <div className="detail-layout">
        {/* Main Column */}
        <div className="flex flex-col gap-4">
          {/* Vault Overview */}
          <div className="card">
            <div className="flex justify-between items-start flex-wrap gap-3 mb-4">
              <div>
                <p className="eyebrow mb-2">Escrow Vault</p>
                <h1 className="page-title mb-1">Escrow Dashboard</h1>
                <AddressDisplay address={vaultAddress} full />
              </div>
              <div className="flex flex-col items-end gap-1">
                {isClient && <span className="chip chip-teal">You are Client</span>}
                {isFreelancer && <span className="chip chip-amber">You are Freelancer</span>}
              </div>
            </div>
            <div className="divider" />
            <div className="kv-list">
              <div className="kv-row">
                <span className="kv-key">Client Address</span>
                <span className="kv-value"><AddressDisplay address={client} /></span>
              </div>
              <div className="kv-row">
                <span className="kv-key">Freelancer Address</span>
                <span className="kv-value"><AddressDisplay address={freelancer} /></span>
              </div>
            </div>
          </div>

          {/* Auto-Verification Checklist */}
          {checklist && (
            <div className="card">
              <h2 className="section-label mb-2">📋 Auto-Verification Checklist</h2>
              <p className="text-sm text-secondary mb-4">
                The verifier automatically tests deliverables. A score ≥ 90% auto-releases funds. Otherwise, manually reviewed.
              </p>
              <div className="chip-row">
                {checklist.requiredPages.map(p => (
                  <span key={p} className="mini-chip">/{p}</span>
                ))}
                {checklist.mustBeResponsive && (
                  <span className="mini-chip mini-chip-teal">✓ Responsive Viewport</span>
                )}
                {checklist.mustHaveContactForm && (
                  <span className="mini-chip mini-chip-teal">✓ Contact Form</span>
                )}
              </div>
              {checklist.extraNotes && (
                <p className="text-xs text-muted mt-3" style={{ fontStyle: 'italic' }}>
                  Notes: "{checklist.extraNotes}"
                </p>
              )}
              {matchingJobData?.specDocCID && !/^0x0+$/.test(String(matchingJobData.specDocCID)) && (
                <Button
                  type="button"
                  onClick={handleDownloadSpec}
                  variant="secondary"
                  size="sm"
                  icon={Download}
                  className="mt-4"
                  style={{ width: 'fit-content' }}
                  loading={isDownloadingSpec}
                >
                  Download Client Spec
                </Button>
              )}
            </div>
          )}

          {/* Milestones Card */}
          <div className="card">
            <h2 className="section-label mb-4">⏱ Milestone Payout Timeline</h2>
            <div className="timeline">
              <MilestonePanel
                milestone={milestone}
                vaultAddress={vaultAddress}
                isClient={isClient}
                isFreelancer={isFreelancer}
                checklist={checklist}
                deadline={deadline}
                arbiters={arbiters}
                userAddress={address}
                canTransact={canTransact}
              />
            </div>
          </div>

          {/* ── Messages Card ── */}
          {isConnected && (isClient || isFreelancer) && matchingJobData?.jobId !== undefined && (
            <div className="card">
              <h2 className="section-label mb-3">Messages</h2>
              <JobChat
                jobId={matchingJobData.jobId}
                clientAddress={client}
                assignedFreelancer={freelancer}
                isClientMode={isClient}
                bidders={[]}
              />
            </div>
          )}
        </div>

        {/* Sidebar Column */}
        <div className="flex flex-col gap-4">
          {/* Total Vault Funds */}
          <div className="card card-value">
            <h2 className="section-label mb-2">Total Locked Value</h2>
            <div className="vault-amount-display">
              <AmountDisplay wei={milestoneAmount} size="lg" />
            </div>
          </div>

          {/* Time Remaining */}
          <div className="card">
            <h2 className="section-label mb-2">Vault Deadline</h2>
            <div className="kv-list">
              <div className="kv-row">
                <span className="kv-key"><Clock size={13} style={{ display: 'inline', marginRight: 3 }} /> Days Left</span>
                <span className="kv-value font-600 text-teal">{daysLeft} days remaining</span>
              </div>
              <div className="kv-row">
                <span className="kv-key">Absolute Date</span>
                <span className="kv-value text-xs">
                  {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(Number(deadline) * 1000))}
                </span>
              </div>
            </div>
          </div>

          {/* Arbiters Panel */}
          <div className="card">
            <h2 className="section-label mb-2">Dispute Resolution Arbiters</h2>
            <p className="text-xs text-muted mb-3">
              Independent arbiters vote to resolve disputes (requires 2/3 consensus).
            </p>
            <div className="flex flex-col gap-2">
              {arbiters.map((arb, i) => (
                <div key={i} className="kv-row" style={{ padding: '8px 12px' }}>
                  <span className="text-xs text-dim">Arbiter #{i+1}</span>
                  <AddressDisplay address={arb} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
