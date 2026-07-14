// JSON ABI format for EscrowMind contracts
// NOTE: Using JSON ABI (not human-readable strings) to avoid viem tuple-parsing bugs.
import { getAddress } from 'viem';

export const JOB_BOARD_ABI = [
  // ── postJob ──────────────────────────────────────────────────────────────
  {
    name: "postJob",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "checklist",
        type: "tuple",
        components: [
          { name: "requiredPages",       type: "string[]" },
          { name: "mustBeResponsive",    type: "bool"     },
          { name: "mustHaveContactForm", type: "bool"     },
          { name: "extraNotes",          type: "string"   }
        ]
      },
      { name: "specDocCID", type: "bytes32"  },
      { name: "budgetMin",  type: "uint256"  },
      { name: "budgetMax",  type: "uint256"  },
      { name: "deadline",   type: "uint40"   }
    ],
    outputs: [{ name: "", type: "uint256" }]
  },
  // ── submitBid ─────────────────────────────────────────────────────────────
  {
    name: "submitBid",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId",         type: "uint256"  },
      { name: "amount",        type: "uint256"  },
      { name: "proposalCID",   type: "bytes32"  },
      { name: "estimatedDays", type: "uint40"   }
    ],
    outputs: []
  },
  // ── withdrawBid ───────────────────────────────────────────────────────────
  {
    name: "withdrawBid",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId",     type: "uint256" },
      { name: "bidIndex",  type: "uint256" }
    ],
    outputs: []
  },
  // ── acceptBid ─────────────────────────────────────────────────────────────
  {
    name: "acceptBid",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId",    type: "uint256" },
      { name: "bidIndex", type: "uint256" }
    ],
    outputs: []
  },
  // ── getBids ───────────────────────────────────────────────────────────────
  {
    name: "getBids",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "freelancer",    type: "address" },
          { name: "amount",        type: "uint256" },
          { name: "proposalCID",   type: "bytes32" },
          { name: "estimatedDays", type: "uint40"  },
          { name: "withdrawn",     type: "bool"    }
        ]
      }
    ]
  },
  // ── jobCounter ────────────────────────────────────────────────────────────
  {
    name: "jobCounter",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  // ── jobs ──────────────────────────────────────────────────────────────────
  {
    name: "jobs",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "client", type: "address" },
      {
        name: "checklist",
        type: "tuple",
        components: [
          { name: "requiredPages",       type: "string[]" },
          { name: "mustBeResponsive",    type: "bool"     },
          { name: "mustHaveContactForm", type: "bool"     },
          { name: "extraNotes",          type: "string"   }
        ]
      },
      { name: "specDocCID",          type: "bytes32" },
      { name: "budgetMin",           type: "uint256" },
      { name: "budgetMax",           type: "uint256" },
      { name: "deadline",            type: "uint40"  },
      { name: "state",               type: "uint8"   },
      { name: "assignedFreelancer",  type: "address" },
      { name: "escrowVault",         type: "address" }
    ]
  },
  // ── Events ────────────────────────────────────────────────────────────────
  {
    name: "JobPosted",
    type: "event",
    inputs: [
      { name: "jobId",  type: "uint256", indexed: true },
      { name: "client", type: "address", indexed: true }
    ]
  },
  {
    name: "BidSubmitted",
    type: "event",
    inputs: [
      { name: "jobId",       type: "uint256", indexed: true },
      { name: "bidIndex",    type: "uint256", indexed: true },
      { name: "freelancer",  type: "address", indexed: true },
      { name: "amount",      type: "uint256", indexed: false }
    ]
  },
  {
    name: "BidAccepted",
    type: "event",
    inputs: [
      { name: "jobId",      type: "uint256", indexed: true },
      { name: "freelancer", type: "address", indexed: true },
      { name: "vault",      type: "address", indexed: false }
    ]
  },
  {
    name: "JobClosed",
    type: "event",
    inputs: [
      { name: "jobId", type: "uint256", indexed: true }
    ]
  }
];

export const ESCROW_VAULT_ABI = [
  { name: "client", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { name: "freelancer", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { name: "trustedRelayer", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { name: "deadline", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint40" }] },
  { name: "getMilestoneCount", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "getMilestoneState", type: "function", stateMutability: "view", inputs: [{ name: "index", type: "uint8" }], outputs: [{ name: "", type: "uint8" }] },
  { name: "milestoneAmounts", type: "function", stateMutability: "view", inputs: [{ name: "", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "milestoneSpecHashes", type: "function", stateMutability: "view", inputs: [{ name: "", type: "uint256" }], outputs: [{ name: "", type: "bytes32" }] },
  { name: "deliveryHashes", type: "function", stateMutability: "view", inputs: [{ name: "", type: "uint256" }], outputs: [{ name: "", type: "bytes32" }] },
  { name: "autoReleaseTimestamp", type: "function", stateMutability: "view", inputs: [{ name: "", type: "uint8" }], outputs: [{ name: "", type: "uint40" }] },
  { name: "arbiters", type: "function", stateMutability: "view", inputs: [{ name: "", type: "uint256" }], outputs: [{ name: "", type: "address" }] },
  { name: "releaseVotes", type: "function", stateMutability: "view", inputs: [{ name: "", type: "uint8" }], outputs: [{ name: "", type: "uint8" }] },
  { name: "refundVotes", type: "function", stateMutability: "view", inputs: [{ name: "", type: "uint8" }], outputs: [{ name: "", type: "uint8" }] },
  { name: "markVerified", type: "function", stateMutability: "nonpayable", inputs: [{ name: "index", type: "uint8" }, { name: "checklistScorePercent", type: "uint256" }], outputs: [] },
  { name: "fundMilestone", type: "function", stateMutability: "payable", inputs: [{ name: "index", type: "uint8" }], outputs: [] },
  { name: "clientRelease", type: "function", stateMutability: "nonpayable", inputs: [{ name: "index", type: "uint8" }], outputs: [] },
  { name: "raiseDispute", type: "function", stateMutability: "nonpayable", inputs: [{ name: "index", type: "uint8" }], outputs: [] },
  { name: "claimTimeoutRefund", type: "function", stateMutability: "nonpayable", inputs: [{ name: "index", type: "uint8" }], outputs: [] },
  { name: "finalizeAutoRelease", type: "function", stateMutability: "nonpayable", inputs: [{ name: "index", type: "uint8" }], outputs: [] },
  { name: "submitDelivery", type: "function", stateMutability: "nonpayable", inputs: [{ name: "index", type: "uint8" }, { name: "deliveryHash", type: "bytes32" }], outputs: [] },
  { name: "arbiterVote", type: "function", stateMutability: "nonpayable", inputs: [{ name: "index", type: "uint8" }, { name: "releaseToFreelancer", type: "bool" }], outputs: [] },
  { name: "MilestoneFunded", type: "event", inputs: [{ name: "index", type: "uint8", indexed: true }, { name: "amount", type: "uint256", indexed: false }] },
  { name: "DeliverySubmitted", type: "event", inputs: [{ name: "index", type: "uint8", indexed: true }, { name: "hash", type: "bytes32", indexed: false }] },
  { name: "VerificationResult", type: "event", inputs: [{ name: "index", type: "uint8", indexed: true }, { name: "checklistScore", type: "uint256", indexed: false }, { name: "autoReleased", type: "bool", indexed: false }] },
  { name: "MilestoneReleased", type: "event", inputs: [{ name: "index", type: "uint8", indexed: true }] },
  { name: "Disputed", type: "event", inputs: [{ name: "index", type: "uint8", indexed: true }] },
  { name: "DisputeResolved", type: "event", inputs: [{ name: "index", type: "uint8", indexed: true }, { name: "releasedToFreelancer", type: "bool", indexed: false }] },
  { name: "TimeoutRefunded", type: "event", inputs: [{ name: "index", type: "uint8", indexed: true }] }
];

export const REPUTATION_SBT_ABI = [
  { name: "passportOf", type: "function", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "hasPassport", type: "function", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "bool" }] },
  { name: "freelancerScore", type: "function", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "int256" }] },
  { name: "freelancerJobsCompleted", type: "function", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "freelancerJobsFailed", type: "function", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "clientScore", type: "function", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "int256" }] },
  { name: "clientMilestonesReleased", type: "function", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "clientDisputesLost", type: "function", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "mintPassport", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] }
];

export const CREDIT_MANAGER_ABI = [
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { name: "BID_COST", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "JOB_POST_COST", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "hasClaimedStarter", type: "function", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ name: "", type: "bool" }] },
  { name: "lastDailyClaim", type: "function", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ name: "", type: "uint40" }] },
  { name: "lastHourlyClaim", type: "function", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ name: "", type: "uint40" }] },
  { name: "HOURLY_CLAIM_COOLDOWN", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint40" }] },
  { name: "creditsPerAvax", type: "function", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { name: "claimStarterCredits", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { name: "claimDailyTask", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { name: "claimHourlyTask", type: "function", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { name: "purchaseCredits", type: "function", stateMutability: "payable", inputs: [], outputs: [] },
  { name: "StarterCreditsClaimed", type: "event", inputs: [{ name: "user", type: "address", indexed: true }, { name: "amount", type: "uint256", indexed: false }] },
  { name: "CreditsSpent", type: "event", inputs: [{ name: "user", type: "address", indexed: true }, { name: "amount", type: "uint256", indexed: false }, { name: "reason", type: "string", indexed: false }] },
  { name: "CreditsEarned", type: "event", inputs: [{ name: "user", type: "address", indexed: true }, { name: "amount", type: "uint256", indexed: false }, { name: "reason", type: "string", indexed: false }] },
  { name: "CreditsPurchased", type: "event", inputs: [{ name: "user", type: "address", indexed: true }, { name: "avaxPaid", type: "uint256", indexed: false }, { name: "creditsReceived", type: "uint256", indexed: false }] },
  { name: "HourlyTaskClaimed", type: "event", inputs: [{ name: "user", type: "address", indexed: true }] }
];

// ─── Contract Address Resolution ─────────────────────────────────────────────
//
// Priority order (highest to lowest):
//   1. VITE_* env vars in frontend/.env  ← set correctly after each deploy
//   2. deployments/fuji.json loaded via Vite glob (only works if the file is
//      inside the Vite project root — see vite.config.js alias)
//   3. Hardcoded fallbacks below (placeholder — will be wrong after a redeploy)
//
// The old code relied solely on option 2, but fuji.json lives at the PARENT
// level (../deployments/fuji.json) which Vite cannot import outside its root.
// That caused the glob to silently return {} and fall through to the wrong
// hardcoded placeholders, sending every tx to a non-contract address.

const ENV_ADDRESSES = {
  JobBoard:      import.meta.env.VITE_JOB_BOARD_ADDRESS,
  EscrowFactory: import.meta.env.VITE_ESCROW_FACTORY_ADDRESS,
  ReputationSBT: import.meta.env.VITE_REPUTATION_SBT_ADDRESS,
  CreditManager: import.meta.env.VITE_CREDIT_MANAGER_ADDRESS,
};

// Fallback hardcoded addresses (last resort — synced with deployments/fuji.json)
export const CONTRACT_ADDRESSES = {
  JobBoard:      '0x9dE4fc5E969B6D9b00e0d2fF1bbf7c51DdF35890',
  EscrowFactory: '0x2F317f780c79D209d9E6006c5a44808E65384159',
  ReputationSBT: '0x0eA2D88aaD9eBE6c1C0Ed703D993947200a22276',
  CreditManager: '0x67C94C1f87934A2E0AA7dA490D5bC4EB1A995dd8',
};

// Try to load from deployments/fuji.json via Vite glob
// (works only if vite.config.js aliases ../deployments → deployments inside root)
let deployedAddresses = null;
try {
  const deployments = import.meta.glob('/deployments/*.json', { eager: true });
  if (deployments && deployments['/deployments/fuji.json']) {
    const fujiDeployment = deployments['/deployments/fuji.json'].default;
    if (fujiDeployment && fujiDeployment.contracts) {
      deployedAddresses = {
        JobBoard:      fujiDeployment.contracts.JobBoard,
        EscrowFactory: fujiDeployment.contracts.EscrowFactory,
        ReputationSBT: fujiDeployment.contracts.ReputationSBT,
        CreditManager: fujiDeployment.contracts.CreditManager,
      };
    }
  }
} catch {
  // Glob outside Vite root — expected when deployments/ is at parent level
}

export const DEPLOYED_ADDRESSES = deployedAddresses || CONTRACT_ADDRESSES;

/**
 * Returns the EIP-55 checksummed address for a contract.
 * Priority: VITE env var → fuji.json → hardcoded fallback.
 * Always normalises to correct EIP-55 checksum so viem never throws.
 */
export const getContractAddress = (contractName) => {
  // 1. VITE env var (set from .env after each deploy — most reliable)
  const fromEnv = ENV_ADDRESSES[contractName];
  const raw = (fromEnv && fromEnv.startsWith('0x') && fromEnv.length === 42)
    ? fromEnv
    : (DEPLOYED_ADDRESSES[contractName] || CONTRACT_ADDRESSES[contractName]);
  try {
    return getAddress(raw);
  } catch {
    return raw;
  }
};

/**
 * Returns true if the address for this contract looks like it was actually
 * configured (i.e. not a zeroed/placeholder address).
 * Use this to show a warning in the UI when contracts aren't deployed yet.
 */
export const isContractDeployed = (contractName) => {
  const addr = getContractAddress(contractName);
  return (
    addr &&
    addr !== '0x0000000000000000000000000000000000000000' &&
    addr.toLowerCase() !== '0x7890123456789012345678901234567890123456' &&
    addr.toLowerCase() !== '0x9012345678901234567890123456789012345678' &&
    addr.toLowerCase() !== '0x5678901234567890123456789012345678901234'
  );
};
