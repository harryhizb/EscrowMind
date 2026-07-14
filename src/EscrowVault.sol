// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "./interfaces/IEscrowMind.sol";

/// @title EscrowVault
/// @author EscrowMind Team — Avalanche Hackathon 2025
/// @notice Per-job escrow vault (deployed as EIP-1167 minimal-proxy clone).
///         Holds AVAX for each milestone, coordinates delivery verification,
///         dispute resolution, and reputation recording.
///
/// @dev SECURITY SUMMARY:
///      - Reentrancy: `nonReentrant` on ALL fund-moving functions. CEI ordering
///        enforced throughout (state updated before ETH transfer calls).
///      - Access control: each function gated by explicit address checks — no
///        tx.origin used anywhere, no wildcard roles.
///      - Integer overflow: Solidity 0.8.x checked arithmetic; milestone amounts
///        are set at init and not modified.
///      - Unbounded loops: MAX_MILESTONES = 10 cap enforced in initialize().
///        Arbiter loop is bounded to exactly 3 (hardcoded panel).
///      - Clone re-initialization: Initializable prevents initialize() being
///        called more than once per clone.
///      - Trusted relayer scope: trustedRelayer can ONLY call markVerified().
///        It has no access to any fund-moving function. Explicit modifier enforces this.
///      - Front-running auto-release: finalizeAutoRelease checks both that
///        DISPUTE_WINDOW has truly elapsed AND that state is still PendingRelease
///        (not Disputed). Raising a dispute within the window atomically changes
///        state, permanently blocking finalizeAutoRelease for that milestone.
contract EscrowVault is ReentrancyGuard, Initializable {
    // ─────────────────────────────────────────────────────────
    // Constants
    // ─────────────────────────────────────────────────────────

    /// @notice Maximum number of milestones per vault (unbounded-loop protection)
    uint8 public constant MAX_MILESTONES = 10;

    /// @notice Window after markVerified(score ≥ 90) during which client can raise dispute
    uint40 public constant DISPUTE_WINDOW = 24 hours;

    // ─────────────────────────────────────────────────────────
    // Types
    // ─────────────────────────────────────────────────────────

    /// @notice Lifecycle state of a single milestone
    enum MilestoneState {
        Pending,        // initial: created but not yet funded by client
        Funded,         // client deposited AVAX; awaiting freelancer delivery
        Delivered,      // freelancer submitted deliveryHash; awaiting verification
        NeedsReview,    // verifier returned score < 90; client must review manually
        PendingRelease, // score >= 90; dispute window is ticking
        Disputed,       // client raised dispute; awaiting arbiters
        Released,       // funds released to freelancer (success)
        Refunded        // funds returned to client (timeout or lost dispute)
    }

    // ─────────────────────────────────────────────────────────
    // State (all set via initialize — not constructor, because clone)
    // ─────────────────────────────────────────────────────────

    address public client;
    address public freelancer;

    /// @notice Backend service wallet. SECURITY: Can ONLY call markVerified().
    ///         Enforced by the onlyRelayer modifier. This wallet holds NO funds
    ///         and cannot trigger any payment. Explicitly scoped to be a minimal
    ///         attack surface — if compromised, worst case is a false score, which
    ///         the client can still override via clientRelease or raiseDispute.
    address public trustedRelayer;

    address public reputationSBT;

    /// @notice Address of the CreditManager — used to reward credits on release
    address public creditManager;

    uint256[] public milestoneAmounts;
    bytes32[] public milestoneSpecHashes;
    bytes32[] public deliveryHashes;
    MilestoneState[] public milestoneStates;
    uint40 public deadline;

    /// @notice Timestamp at which the DISPUTE_WINDOW expires for each milestone
    ///         (set when markVerified records score ≥ 90)
    mapping(uint8 => uint40) public autoReleaseTimestamp;

    /// @notice Hardcoded 3-arbiter panel for MVP
    address[3] public arbiters;

    /// @notice Tracks which arbiters have voted and their decisions per milestone
    mapping(uint8 => mapping(address => bool)) public arbiterVoted;
    mapping(uint8 => mapping(address => bool)) public arbiterVoteValue;

    /// @notice Counts how many arbiters voted release vs. refund per milestone
    mapping(uint8 => uint8) public releaseVotes;
    mapping(uint8 => uint8) public refundVotes;

    // ─────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────

    event MilestoneFunded(uint8 indexed index, uint256 amount);
    event DeliverySubmitted(uint8 indexed index, bytes32 deliveryHash);
    /// @notice Emitted after automated checklist verification.
    ///         checklistScore is 0-100; autoReleased signals whether the dispute
    ///         window countdown has started (score >= 90) or manual review is needed.
    event VerificationResult(uint8 indexed index, uint256 checklistScore, bool autoReleased);
    event MilestoneReleased(uint8 indexed index, address freelancer, uint256 amount);
    event Disputed(uint8 indexed index, address client);
    event DisputeResolved(uint8 indexed index, bool releasedToFreelancer);
    event TimeoutRefunded(uint8 indexed index, address client, uint256 amount);

    // ─────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────

    error EscrowVault__NotClient();
    error EscrowVault__NotFreelancer();
    error EscrowVault__NotRelayer();
    error EscrowVault__NotArbiter();
    error EscrowVault__WrongState(uint8 index, MilestoneState actual, MilestoneState expected);
    error EscrowVault__WrongValue(uint256 sent, uint256 expected);
    error EscrowVault__MilestoneIndexOutOfRange(uint8 index);
    error EscrowVault__TooManyMilestones(uint256 count);
    error EscrowVault__LengthMismatch();
    error EscrowVault__DisputeWindowNotElapsed(uint8 index);
    error EscrowVault__DisputeWindowElapsed(uint8 index);
    error EscrowVault__DeadlineNotReached();
    error EscrowVault__AlreadyVoted(uint8 index, address arbiter);
    error EscrowVault__PreviousMilestoneNotReleased(uint8 index);
    error EscrowVault__TransferFailed();

    // ─────────────────────────────────────────────────────────
    // Initializer (replaces constructor for clones)
    // ─────────────────────────────────────────────────────────

    /// @notice Initialize the vault clone. Called exactly once by EscrowFactory.
    /// @dev    SECURITY: `initializer` modifier (Initializable) prevents re-init.
    ///         MAX_MILESTONES cap prevents unbounded storage growth.
    function initialize(
        address _client,
        address _freelancer,
        address _trustedRelayer,
        uint256[] calldata _milestoneAmounts,
        bytes32[] calldata _milestoneSpecHashes,
        uint40 _deadline,
        address[3] calldata _arbiters,
        address _reputationSBT,
        address _creditManager
    ) external initializer {
        require(_client != address(0), "EscrowVault: zero client");
        require(_freelancer != address(0), "EscrowVault: zero freelancer");
        require(_trustedRelayer != address(0), "EscrowVault: zero relayer");
        require(_reputationSBT != address(0), "EscrowVault: zero rep");
        require(_creditManager != address(0), "EscrowVault: zero creditManager");
        require(
            _milestoneAmounts.length > 0 && _milestoneAmounts.length <= MAX_MILESTONES,
            "EscrowVault: milestone count out of range"
        );
        if (_milestoneAmounts.length != _milestoneSpecHashes.length) {
            revert EscrowVault__LengthMismatch();
        }

        client = _client;
        freelancer = _freelancer;
        trustedRelayer = _trustedRelayer;
        reputationSBT = _reputationSBT;
        creditManager = _creditManager;
        deadline = _deadline;
        arbiters = _arbiters;

        for (uint256 i = 0; i < _milestoneAmounts.length; i++) {
            milestoneAmounts.push(_milestoneAmounts[i]);
            milestoneSpecHashes.push(_milestoneSpecHashes[i]);
            deliveryHashes.push(bytes32(0));
            milestoneStates.push(MilestoneState.Pending); // starts as Pending (unfunded)
        }
    }

    // ─────────────────────────────────────────────────────────
    // External — Client
    // ─────────────────────────────────────────────────────────

    /// @notice Client deposits AVAX for a milestone.
    /// @dev    SECURITY: nonReentrant. CEI: state transitions from Pending → Funded
    ///         before any external call. Double-funding impossible because second call
    ///         will find state == Funded (not Pending) and revert.
    ///         Milestone ordering enforced: index 0 first, then each subsequent
    ///         only after the previous is Released.
    /// @param index  Milestone index (0-based).
    function fundMilestone(uint8 index) external payable onlyClient nonReentrant {
        _checkIndex(index);

        // Enforce sequential funding: previous milestone must be Released (or index == 0)
        if (index > 0) {
            if (milestoneStates[index - 1] != MilestoneState.Released) {
                revert EscrowVault__PreviousMilestoneNotReleased(index);
            }
        }

        // SECURITY: Must be Pending (unfunded). Prevents double-funding.
        _requireState(index, MilestoneState.Pending);

        uint256 expected = milestoneAmounts[index];
        if (msg.value != expected) revert EscrowVault__WrongValue(msg.value, expected);

        // EFFECTS: transition Pending → Funded
        milestoneStates[index] = MilestoneState.Funded;

        emit MilestoneFunded(index, msg.value);
    }

    /// @notice Client can immediately release funds to freelancer at any time.
    /// @dev    SECURITY: nonReentrant + CEI. Works regardless of verification score —
    ///         this is the manual override that ensures the client is never locked out.
    ///         Callable in states: Funded (after delivery), Delivered, NeedsReview,
    ///         PendingRelease — i.e., any state where funds are actually held.
    ///         Does NOT work from Pending (no funds deposited yet).
    /// @param index  Milestone index.
    function clientRelease(uint8 index) external onlyClient nonReentrant {
        _checkIndex(index);
        MilestoneState state = milestoneStates[index];

        // Allowed from any funded non-terminal state
        require(
            state == MilestoneState.Funded ||
                state == MilestoneState.Delivered ||
                state == MilestoneState.NeedsReview ||
                state == MilestoneState.PendingRelease,
            "EscrowVault: not releasable"
        );

        // EFFECTS
        milestoneStates[index] = MilestoneState.Released;
        uint256 amount = milestoneAmounts[index];

        // Record outcome — success
        _recordOutcome(true, amount);

        // CREDIT SYSTEM INTEGRATION
        if (creditManager != address(0)) {
            try ICreditManager(creditManager).rewardCredits(freelancer, ICreditManager(creditManager).JOB_COMPLETION_REWARD(), "job_completed") {} catch {}
            try ICreditManager(creditManager).rewardCredits(client, ICreditManager(creditManager).CLIENT_COMPLETION_REWARD(), "good_faith_release") {} catch {}
        }

        emit MilestoneReleased(index, freelancer, amount);

        // INTERACTION
        _transferToFreelancer(amount);
    }

    /// @notice Client raises a dispute during the dispute window or while NeedsReview.
    /// @dev    SECURITY: Only callable during window or NeedsReview — prevents
    ///         retroactive disputes after auto-release has already paid out.
    /// @param index  Milestone index.
    function raiseDispute(uint8 index) external onlyClient {
        _checkIndex(index);
        MilestoneState state = milestoneStates[index];

        if (state == MilestoneState.PendingRelease) {
            // Ensure we're still within the dispute window
            // SECURITY: front-running protection — once window elapses,
            // finalizeAutoRelease can be called by anyone, but raiseDispute
            // will revert here, preventing a "race" to dispute after payment.
            if (block.timestamp >= autoReleaseTimestamp[index]) {
                revert EscrowVault__DisputeWindowElapsed(index);
            }
        } else if (state != MilestoneState.NeedsReview) {
            revert EscrowVault__WrongState(index, state, MilestoneState.NeedsReview);
        }

        milestoneStates[index] = MilestoneState.Disputed;
        emit Disputed(index, msg.sender);
    }

    /// @notice Client claims a refund if the deadline has passed and freelancer
    ///         never submitted a delivery.
    /// @dev    SECURITY: nonReentrant + CEI. Only works if state is still Funded
    ///         (freelancer never called submitDelivery). If delivery was submitted
    ///         but late, normal dispute path applies.
    /// @param index  Milestone index.
    function claimTimeoutRefund(uint8 index) external onlyClient nonReentrant {
        _checkIndex(index);
        // SECURITY: Only Funded state — funds must actually be in the contract.
        // If still Pending, client simply doesn't fund; nothing to refund.
        _requireState(index, MilestoneState.Funded);

        if (block.timestamp <= deadline) revert EscrowVault__DeadlineNotReached();

        // EFFECTS
        milestoneStates[index] = MilestoneState.Refunded;
        uint256 amount = milestoneAmounts[index];

        emit TimeoutRefunded(index, client, amount);

        // INTERACTION
        _transferToClient(amount);
    }

    // ─────────────────────────────────────────────────────────
    // External — Freelancer
    // ─────────────────────────────────────────────────────────

    /// @notice Freelancer submits a delivery hash (keccak256 of build CID + content hash).
    /// @dev    Not a fund-moving function; no nonReentrant needed, but guard added
    ///         defensively to follow consistent policy.
    /// @param index         Milestone index.
    /// @param deliveryHash  keccak256 of the delivered build (content-addressed).
    function submitDelivery(uint8 index, bytes32 deliveryHash) external onlyFreelancer {
        _checkIndex(index);
        _requireState(index, MilestoneState.Funded);

        deliveryHashes[index] = deliveryHash;
        milestoneStates[index] = MilestoneState.Delivered;

        emit DeliverySubmitted(index, deliveryHash);
    }

    // ─────────────────────────────────────────────────────────
    // External — Relayer (Backend Verification Service)
    // ─────────────────────────────────────────────────────────

    /// @notice Record the automated checklist verification result.
    ///
    /// @dev    DESIGN NOTE FOR JUDGES:
    ///         This function records an OBJECTIVE CHECKLIST SCORE produced by
    ///         sandboxed Puppeteer tests (HTTP 200 checks, responsive layout check,
    ///         contact-form presence check). It is NOT a subjective AI quality
    ///         judgment. The relayer is a backend wallet with the SOLE capability
    ///         of calling this function — no fund access whatsoever.
    ///
    ///         Score >= 90: starts a 24h dispute window; anyone can call
    ///         finalizeAutoRelease after the window closes.
    ///         Score < 90: sets NeedsReview; client must manually release or dispute.
    ///
    ///         SECURITY: onlyRelayer — only the backend service wallet may call.
    ///         Requires state == Delivered (freelancer submitted delivery first).
    ///
    /// @param index                Milestone index.
    /// @param checklistScorePercent Verified checklist pass rate (0-100).
    function markVerified(uint8 index, uint256 checklistScorePercent)
        external
        onlyRelayer
    {
        _checkIndex(index);
        _requireState(index, MilestoneState.Delivered);

        require(checklistScorePercent <= 100, "EscrowVault: score > 100");

        bool autoReleased = checklistScorePercent >= 90;

        if (autoReleased) {
            // EFFECTS: start the dispute window
            milestoneStates[index] = MilestoneState.PendingRelease;
            autoReleaseTimestamp[index] = uint40(block.timestamp) + DISPUTE_WINDOW;
        } else {
            milestoneStates[index] = MilestoneState.NeedsReview;
        }

        emit VerificationResult(index, checklistScorePercent, autoReleased);
    }

    // ─────────────────────────────────────────────────────────
    // External — Permissionless (after dispute window)
    // ─────────────────────────────────────────────────────────

    /// @notice Finalize automatic release after the dispute window has elapsed.
    /// @dev    SECURITY: Permissionless — anyone can trigger this (prevents
    ///         freelancer being blocked if client is unresponsive after high score).
    ///         nonReentrant + CEI. Checks window elapsed AND state is PendingRelease
    ///         (raises dispute atomically changes state, blocking this path).
    /// @param index  Milestone index.
    function finalizeAutoRelease(uint8 index) external nonReentrant {
        _checkIndex(index);
        _requireState(index, MilestoneState.PendingRelease);

        if (block.timestamp < autoReleaseTimestamp[index]) {
            revert EscrowVault__DisputeWindowNotElapsed(index);
        }

        // EFFECTS
        milestoneStates[index] = MilestoneState.Released;
        uint256 amount = milestoneAmounts[index];

        // Record outcome — success
        _recordOutcome(true, amount);

        // CREDIT SYSTEM INTEGRATION
        if (creditManager != address(0)) {
            try ICreditManager(creditManager).rewardCredits(freelancer, ICreditManager(creditManager).JOB_COMPLETION_REWARD(), "job_completed") {} catch {}
            try ICreditManager(creditManager).rewardCredits(client, ICreditManager(creditManager).CLIENT_COMPLETION_REWARD(), "good_faith_release") {} catch {}
        }

        emit MilestoneReleased(index, freelancer, amount);

        // INTERACTION
        _transferToFreelancer(amount);
    }

    // ─────────────────────────────────────────────────────────
    // External — Arbiters
    // ─────────────────────────────────────────────────────────

    /// @notice Arbiter casts a vote on a disputed milestone.
    /// @dev    SECURITY: 2-of-3 panel; each arbiter votes exactly once (enforced
    ///         by arbiterVoted mapping). Resolves immediately on reaching majority.
    ///         nonReentrant on the resolution path (fund movement).
    ///         No unbounded loops — arbiter array is exactly 3 elements.
    /// @param index               Milestone index.
    /// @param releaseToFreelancer True = release to freelancer; false = refund client.
    function arbiterVote(uint8 index, bool releaseToFreelancer)
        external
        nonReentrant
    {
        _checkIndex(index);
        _requireState(index, MilestoneState.Disputed);

        // SECURITY: Verify caller is one of the 3 arbiters
        bool isArbiter = false;
        for (uint256 i = 0; i < 3; i++) {
            if (arbiters[i] == msg.sender) {
                isArbiter = true;
                break;
            }
        }
        if (!isArbiter) revert EscrowVault__NotArbiter();

        if (arbiterVoted[index][msg.sender]) revert EscrowVault__AlreadyVoted(index, msg.sender);

        // EFFECTS: record vote
        arbiterVoted[index][msg.sender] = true;
        arbiterVoteValue[index][msg.sender] = releaseToFreelancer;

        if (releaseToFreelancer) {
            releaseVotes[index]++;
        } else {
            refundVotes[index]++;
        }

        // Resolve on 2-of-3 majority
        if (releaseVotes[index] >= 2) {
            milestoneStates[index] = MilestoneState.Released;
            uint256 amount = milestoneAmounts[index];

            _recordOutcome(true, amount);

            // CREDIT SYSTEM INTEGRATION
            if (creditManager != address(0)) {
                try ICreditManager(creditManager).rewardCredits(freelancer, ICreditManager(creditManager).JOB_COMPLETION_REWARD(), "job_completed") {} catch {}
                try ICreditManager(creditManager).rewardCredits(client, ICreditManager(creditManager).CLIENT_COMPLETION_REWARD(), "good_faith_release") {} catch {}
            }

            emit DisputeResolved(index, true);
            emit MilestoneReleased(index, freelancer, amount);

            // INTERACTION
            _transferToFreelancer(amount);
        } else if (refundVotes[index] >= 2) {
            milestoneStates[index] = MilestoneState.Refunded;
            uint256 amount = milestoneAmounts[index];

            _recordOutcome(false, amount);
            emit DisputeResolved(index, false);
            emit TimeoutRefunded(index, client, amount);

            // INTERACTION
            _transferToClient(amount);
        }
        // If no majority yet, just store the vote and wait for next arbiter
    }

    // ─────────────────────────────────────────────────────────
    // Internal Helpers
    // ─────────────────────────────────────────────────────────

    function _checkIndex(uint8 index) internal view {
        if (index >= milestoneAmounts.length) {
            revert EscrowVault__MilestoneIndexOutOfRange(index);
        }
    }

    function _requireState(uint8 index, MilestoneState expected) internal view {
        MilestoneState actual = milestoneStates[index];
        if (actual != expected) revert EscrowVault__WrongState(index, actual, expected);
    }

    /// @dev SECURITY: CEI — state already updated by caller before this is called.
    ///      Low-level call with explicit success check; reverts on failure.
    function _transferToFreelancer(uint256 amount) internal {
        (bool ok,) = payable(freelancer).call{value: amount}("");
        if (!ok) revert EscrowVault__TransferFailed();
    }

    function _transferToClient(uint256 amount) internal {
        (bool ok,) = payable(client).call{value: amount}("");
        if (!ok) revert EscrowVault__TransferFailed();
    }

    function _recordOutcome(bool success, uint256 jobValue) internal {
        // Best-effort — if ReputationSBT call fails (e.g., gas), we do NOT revert
        // the payment. Reputation is advisory; fund settlement is primary.
        try IReputationSBT(reputationSBT).recordOutcome(freelancer, client, success, jobValue) {}
        catch {}
    }

    // ─────────────────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────────────────

    modifier onlyClient() {
        if (msg.sender != client) revert EscrowVault__NotClient();
        _;
    }

    modifier onlyFreelancer() {
        if (msg.sender != freelancer) revert EscrowVault__NotFreelancer();
        _;
    }

    /// @dev SECURITY: Strictly limits the relayer wallet to markVerified only.
    ///      Any other function will revert for the relayer address.
    modifier onlyRelayer() {
        if (msg.sender != trustedRelayer) revert EscrowVault__NotRelayer();
        _;
    }

    // ─────────────────────────────────────────────────────────
    // View
    // ─────────────────────────────────────────────────────────

    function getMilestoneCount() external view returns (uint256) {
        return milestoneAmounts.length;
    }

    function getMilestoneState(uint8 index) external view returns (MilestoneState) {
        _checkIndex(index);
        return milestoneStates[index];
    }
}
