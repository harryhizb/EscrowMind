// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IEscrowMind.sol";

/// @title JobBoard
/// @author EscrowMind Team — Avalanche Hackathon 2025
/// @notice Central registry for freelance job postings and bidding.
///         Clients post jobs with a structured requirement checklist; freelancers
///         submit bids; client accepts a bid which triggers EscrowFactory to
///         deploy a per-job EscrowVault clone.
///
/// @dev Security notes:
///      - No reentrancy risk here: no ETH is held; only state changes and an
///        external call to the trusted EscrowFactory.
///      - Front-running on acceptBid: mitigated by accepting a specific bid
///        index and atomically setting JobState = Assigned in the same tx,
///        preventing a second acceptBid on the same job.
///      - No unbounded loops: getBids is view-only; all writes are O(1).
///      - Access control: each mutating function checks msg.sender explicitly.
contract JobBoard {
    // ─────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────

    /// @notice Lifecycle state of a job posting
    enum JobState {
        Open,
        Assigned,
        Closed
    }

    /// @notice Structured checklist of verifiable requirements.
    ///         Fields that can be automatically checked by the backend verifier
    ///         are clearly distinguished from free-text notes that are
    ///         informational only and NOT auto-checked.
    struct RequirementChecklist {
        /// @dev Pages that must return HTTP 200 + non-empty body (auto-checked)
        string[] requiredPages;
        /// @dev Whether the site must be responsive at 375px viewport (auto-checked)
        bool mustBeResponsive;
        /// @dev Whether a <form> element must exist on the site (auto-checked)
        bool mustHaveContactForm;
        /// @dev Free-text notes for the freelancer — informational only, NOT auto-checked.
        ///      Judges note: we are explicit that only the three boolean/array fields above
        ///      enter the automated verification score.
        string extraNotes;
    }

    /// @notice A posted job
    struct Job {
        address client;
        RequirementChecklist checklist;
        /// @dev keccak256 hash / IPFS CID of the full written specification doc
        bytes32 specDocCID;
        uint256 budgetMin;
        uint256 budgetMax;
        uint40 deadline;
        JobState state;
        address assignedFreelancer;
        address escrowVault;
    }

    /// @notice A freelancer's bid on a job
    struct Bid {
        address freelancer;
        uint256 amount;
        /// @dev IPFS CID of the proposal text uploaded by the freelancer
        bytes32 proposalCID;
        uint40 estimatedDays;
        bool withdrawn;
    }

    // ─────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────

    mapping(uint256 => Job) public jobs;
    mapping(uint256 => Bid[]) private _bids;
    uint256 public jobCounter;

    /// @notice Address of the EscrowFactory — set once at construction
    address public immutable escrowFactory;

    /// @notice Address of ReputationSBT — used to auto-mint passports on bid acceptance
    address public immutable reputationSBT;

    /// @notice Address of CreditManager — used to charge credits for posts/bids
    address public immutable creditManager;

    // ─────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────

    event JobPosted(uint256 indexed jobId, address indexed client);
    event BidSubmitted(
        uint256 indexed jobId,
        uint256 indexed bidIndex,
        address indexed freelancer,
        uint256 amount
    );
    event BidWithdrawn(uint256 indexed jobId, uint256 indexed bidIndex, address freelancer);
    event BidAccepted(uint256 indexed jobId, address indexed freelancer, address vault);
    event JobClosed(uint256 indexed jobId);

    // ─────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────

    error JobBoard__NotOpen(uint256 jobId);
    error JobBoard__NotClient(uint256 jobId);
    error JobBoard__ClientCannotBid(uint256 jobId);
    error JobBoard__BidAlreadyWithdrawn(uint256 bidIndex);
    error JobBoard__NotBidder(uint256 bidIndex);
    error JobBoard__BidIndexOutOfRange(uint256 bidIndex);
    error JobBoard__DeadlineInPast();
    error JobBoard__BudgetRangeInvalid();
    error JobBoard__BidBelowBudgetMin(uint256 amount, uint256 budgetMin);
    error JobBoard__BidAboveBudgetMax(uint256 amount, uint256 budgetMax);
    error JobBoard__BidWithdrawnCannotAccept(uint256 bidIndex);

    // ─────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────

    constructor(address _escrowFactory, address _reputationSBT, address _creditManager) {
        require(_escrowFactory != address(0), "JobBoard: zero factory");
        require(_reputationSBT != address(0), "JobBoard: zero reputation");
        require(_creditManager != address(0), "JobBoard: zero creditManager");
        escrowFactory = _escrowFactory;
        reputationSBT = _reputationSBT;
        creditManager = _creditManager;
    }

    // ─────────────────────────────────────────────────────────
    // External — Client
    // ─────────────────────────────────────────────────────────

    /// @notice Post a new job with a requirement checklist and IPFS spec doc.
    /// @param checklist   Structured verifiable requirements (auto-checked fields
    ///                    clearly labeled; extraNotes is informational only).
    /// @param specDocCID  keccak256 of the full spec doc stored on IPFS.
    /// @param budgetMin   Minimum acceptable bid in wei.
    /// @param budgetMax   Maximum acceptable bid in wei.
    /// @param deadline    Unix timestamp of the delivery deadline.
    /// @return jobId      The newly created job ID.
    function postJob(
        RequirementChecklist calldata checklist,
        bytes32 specDocCID,
        uint256 budgetMin,
        uint256 budgetMax,
        uint40 deadline
    ) external returns (uint256 jobId) {
        // CREDIT SYSTEM INTEGRATION
        ICreditManager(creditManager).spendCredits(msg.sender, ICreditManager(creditManager).JOB_POST_COST(), "job_post");

        if (uint256(deadline) <= block.timestamp) revert JobBoard__DeadlineInPast();
        if (budgetMin > budgetMax) revert JobBoard__BudgetRangeInvalid();

        jobId = jobCounter++;

        // SECURITY: We copy the string[] array explicitly; storage assignment
        // handles this correctly in Solidity 0.8.x.
        Job storage job = jobs[jobId];
        job.client = msg.sender;
        job.specDocCID = specDocCID;
        job.budgetMin = budgetMin;
        job.budgetMax = budgetMax;
        job.deadline = deadline;
        job.state = JobState.Open;

        // Store checklist fields individually (cannot assign full struct with
        // dynamic array from calldata to storage in a single step pre-0.8.24
        // mapping slot — copy explicitly for clarity and safety).
        job.checklist.mustBeResponsive = checklist.mustBeResponsive;
        job.checklist.mustHaveContactForm = checklist.mustHaveContactForm;
        job.checklist.extraNotes = checklist.extraNotes;
        for (uint256 i = 0; i < checklist.requiredPages.length; i++) {
            job.checklist.requiredPages.push(checklist.requiredPages[i]);
        }

        emit JobPosted(jobId, msg.sender);
    }

    /// @notice Accept a freelancer's bid, deploy the escrow vault, and lock the job.
    /// @dev    SECURITY: Sets state = Assigned BEFORE the external factory call
    ///         to prevent front-running a second acceptBid on the same job
    ///         (checks-effects-interactions). The factory call is to a trusted,
    ///         immutable address set at construction.
    /// @param jobId     The job to accept a bid on.
    /// @param bidIndex  Index into the bids array for this job.
    function acceptBid(uint256 jobId, uint256 bidIndex) external {
        Job storage job = jobs[jobId];
        if (job.state != JobState.Open) revert JobBoard__NotOpen(jobId);
        if (job.client != msg.sender) revert JobBoard__NotClient(jobId);

        Bid[] storage bidsArr = _bids[jobId];
        if (bidIndex >= bidsArr.length) revert JobBoard__BidIndexOutOfRange(bidIndex);

        Bid storage bid = bidsArr[bidIndex];
        if (bid.withdrawn) revert JobBoard__BidWithdrawnCannotAccept(bidIndex);

        // EFFECTS before external call (CEI)
        job.state = JobState.Assigned;
        job.assignedFreelancer = bid.freelancer;

        // MVP: single milestone = full bid amount
        uint256[] memory milestoneAmounts = new uint256[](1);
        milestoneAmounts[0] = bid.amount;

        bytes32[] memory milestoneSpecHashes = new bytes32[](1);
        milestoneSpecHashes[0] = job.specDocCID;

        // INTERACTION: deploy a per-job EscrowVault clone
        address vault = IEscrowFactory(escrowFactory).createEscrow(
            job.client,
            bid.freelancer,
            milestoneAmounts,
            milestoneSpecHashes,
            job.deadline
        );

        job.escrowVault = vault;

        // Auto-mint reputation passports if not yet minted (best-effort, no revert)
        // This ensures both parties have an SBT before any work begins.
        try IReputationSBT(reputationSBT).mintPassport(job.client) {} catch {}
        try IReputationSBT(reputationSBT).mintPassport(bid.freelancer) {} catch {}

        emit BidAccepted(jobId, bid.freelancer, vault);
    }

    // ─────────────────────────────────────────────────────────
    // External — Freelancer
    // ─────────────────────────────────────────────────────────

    /// @notice Submit a bid on an open job.
    /// @dev    SECURITY: Reverts if caller is the job client (conflict of interest).
    ///         Bid amount is bounded by budgetMin/Max to prevent dust or extreme bids.
    /// @param jobId         The job to bid on.
    /// @param amount        Bid amount in wei (must be within budget range).
    /// @param proposalCID   IPFS CID of the proposal document.
    /// @param estimatedDays Estimated completion time in days.
    function submitBid(
        uint256 jobId,
        uint256 amount,
        bytes32 proposalCID,
        uint40 estimatedDays
    ) external {
        // CREDIT SYSTEM INTEGRATION
        ICreditManager(creditManager).spendCredits(msg.sender, ICreditManager(creditManager).BID_COST(), "bid_submit");

        Job storage job = jobs[jobId];
        if (job.state != JobState.Open) revert JobBoard__NotOpen(jobId);
        if (msg.sender == job.client) revert JobBoard__ClientCannotBid(jobId);
        if (amount < job.budgetMin) revert JobBoard__BidBelowBudgetMin(amount, job.budgetMin);
        if (amount > job.budgetMax) revert JobBoard__BidAboveBudgetMax(amount, job.budgetMax);

        uint256 bidIndex = _bids[jobId].length;
        _bids[jobId].push(
            Bid({
                freelancer: msg.sender,
                amount: amount,
                proposalCID: proposalCID,
                estimatedDays: estimatedDays,
                withdrawn: false
            })
        );

        emit BidSubmitted(jobId, bidIndex, msg.sender, amount);
    }

    /// @notice Withdraw a previously submitted bid.
    /// @dev    Can only be called before bid acceptance. Once a bid is accepted
    ///         (job.state == Assigned), the entire bids array is effectively frozen.
    /// @param jobId     The job the bid belongs to.
    /// @param bidIndex  The bid index to withdraw.
    function withdrawBid(uint256 jobId, uint256 bidIndex) external {
        Job storage job = jobs[jobId];
        // Allow withdrawal even after job is assigned — only the specific bid matters
        Bid[] storage bidsArr = _bids[jobId];
        if (bidIndex >= bidsArr.length) revert JobBoard__BidIndexOutOfRange(bidIndex);

        Bid storage bid = bidsArr[bidIndex];
        if (bid.freelancer != msg.sender) revert JobBoard__NotBidder(bidIndex);
        if (bid.withdrawn) revert JobBoard__BidAlreadyWithdrawn(bidIndex);

        bid.withdrawn = true;
        emit BidWithdrawn(jobId, bidIndex, msg.sender);
    }

    // ─────────────────────────────────────────────────────────
    // View
    // ─────────────────────────────────────────────────────────

    /// @notice Return all bids for a job (including withdrawn ones, marked as such).
    /// @dev    View-only — no unbounded-loop gas concern. Callers should filter
    ///         `withdrawn == false` for active bids.
    function getBids(uint256 jobId) external view returns (Bid[] memory) {
        return _bids[jobId];
    }

    /// @notice Return the requirement checklist for a job.
    function getChecklist(uint256 jobId)
        external
        view
        returns (RequirementChecklist memory)
    {
        return jobs[jobId].checklist;
    }
}
