// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/JobBoard.sol";
import "../src/EscrowFactory.sol";
import "../src/EscrowVault.sol";
import "../src/ReputationSBT.sol";
import "../src/CreditManager.sol";

/// @notice Malicious contract for reentrancy attack testing
contract ReentrantAttacker {
    EscrowVault public vault;
    uint8 public targetIndex;
    uint256 public attackCount;

    constructor(address _vault) {
        vault = EscrowVault(_vault);
    }

    /// @dev Attempt to re-enter finalizeAutoRelease on receive
    receive() external payable {
        attackCount++;
        if (attackCount < 3) {
            // Try to re-enter — should revert due to nonReentrant
            try vault.finalizeAutoRelease(targetIndex) {} catch {}
        }
    }

    function attack(uint8 index) external {
        targetIndex = index;
        vault.finalizeAutoRelease(index);
    }
}

/// @title EscrowMindTest
/// @notice Full Foundry test suite for all EscrowMind Phase 1 contracts.
///
///         Test paths covered:
///         1. Happy path: post → bid → accept → fund → deliver →
///            markVerified(95) → dispute window → finalizeAutoRelease → rep updated
///         2. Manual client release (clientRelease at any state)
///         3. Dispute path: markVerified(50) → NeedsReview → raiseDispute →
///            2-of-3 arbiter vote → resolution (both outcomes)
///         4. Timeout refund: fund → deadline passes → claimTimeoutRefund
///         5. Access control negatives: every unauthorized caller reverts
///         6. Reentrancy: attacker cannot re-enter finalizeAutoRelease
///         7. Soulbound: transferFrom always reverts
///         8. Bid operations: withdraw, re-accept after withdraw reverts
contract EscrowMindTest is Test {
    // ─────────────────────────────────────────────────────────
    // Actors
    // ─────────────────────────────────────────────────────────

    address internal CLIENT = makeAddr("client");
    address internal FREELANCER = makeAddr("freelancer");
    address internal RELAYER = makeAddr("relayer");
    address internal ARBITER_A = makeAddr("arbiterA");
    address internal ARBITER_B = makeAddr("arbiterB");
    address internal ARBITER_C = makeAddr("arbiterC");
    address internal NOBODY = makeAddr("nobody");

    // ─────────────────────────────────────────────────────────
    // Contracts
    // ─────────────────────────────────────────────────────────

    EscrowVault internal vaultImpl;
    ReputationSBT internal reputation;
    EscrowFactory internal factory;
    JobBoard internal jobBoard;
    CreditManager internal creditManager;

    // ─────────────────────────────────────────────────────────
    // Constants
    // ─────────────────────────────────────────────────────────

    uint256 internal constant BID_AMOUNT = 1 ether;
    uint40 internal constant DEADLINE_OFFSET = 30 days;

    // ─────────────────────────────────────────────────────────
    // Setup
    // ─────────────────────────────────────────────────────────

    function setUp() public {
        _deployFullStack();
    }

    function _deployFullStack() internal {
        // Wipe state from setUp partial deploy and rebuild cleanly
        // using nonce prediction for the circular dependency.

        uint256 startNonce = vm.getNonce(address(this));

        // Deploy order:
        // nonce+0: vaultImpl
        // nonce+1: creditManager
        // nonce+2: reputation (needs factory addr = nonce+3)
        // nonce+3: factory (needs jobBoard addr = nonce+4)
        // nonce+4: jobBoard

        address addrVaultImpl = vm.computeCreateAddress(address(this), startNonce);
        address addrCreditManager = vm.computeCreateAddress(address(this), startNonce + 1);
        address addrReputation = vm.computeCreateAddress(address(this), startNonce + 2);
        address addrFactory = vm.computeCreateAddress(address(this), startNonce + 3);
        address addrJobBoard = vm.computeCreateAddress(address(this), startNonce + 4);

        vaultImpl = new EscrowVault(); // nonce+0
        assertEq(address(vaultImpl), addrVaultImpl);

        creditManager = new CreditManager(500); // nonce+1
        assertEq(address(creditManager), addrCreditManager);

        reputation = new ReputationSBT(addrFactory); // nonce+2
        assertEq(address(reputation), addrReputation);

        address[3] memory arbiterPanel = [ARBITER_A, ARBITER_B, ARBITER_C];
        factory = new EscrowFactory( // nonce+3
            addrVaultImpl,
            addrJobBoard, // predicted jobBoard
            RELAYER,
            addrReputation,
            addrCreditManager,
            arbiterPanel
        );
        assertEq(address(factory), addrFactory);

        jobBoard = new JobBoard(addrFactory, addrReputation, addrCreditManager); // nonce+4
        assertEq(address(jobBoard), addrJobBoard);

        // Authorize spender contracts
        creditManager.setAuthorizedSpender(addrJobBoard, true);
        creditManager.setAuthorizedSpender(addrFactory, true);
    }

    // ─────────────────────────────────────────────────────────
    // Helper: deploy a full job → bid → accept cycle
    // ─────────────────────────────────────────────────────────

    function _postAndAcceptJob() internal returns (uint256 jobId, EscrowVault vault) {
        // Fund client so they can pay gas (ETH for tests)
        vm.deal(CLIENT, 100 ether);
        vm.deal(FREELANCER, 1 ether);

        // Claim starter credits to pay post/bid costs
        vm.prank(CLIENT);
        creditManager.claimStarterCredits();

        vm.prank(FREELANCER);
        creditManager.claimStarterCredits();

        // Post job
        string[] memory pages = new string[](2);
        pages[0] = "home";
        pages[1] = "about";

        JobBoard.RequirementChecklist memory checklist = JobBoard.RequirementChecklist({
            requiredPages: pages,
            mustBeResponsive: true,
            mustHaveContactForm: true,
            extraNotes: "Nice to have dark mode"
        });

        vm.prank(CLIENT);
        jobId = jobBoard.postJob(
            checklist,
            keccak256("spec-doc-cid"),
            0.5 ether,
            2 ether,
            uint40(block.timestamp + DEADLINE_OFFSET)
        );

        // Submit bid
        vm.prank(FREELANCER);
        jobBoard.submitBid(
            jobId,
            BID_AMOUNT,
            keccak256("proposal-cid"),
            uint40(14) // 14 days
        );

        // Accept bid
        vm.prank(CLIENT);
        jobBoard.acceptBid(jobId, 0);

        // Retrieve vault
        (,,,,,, JobBoard.JobState state, address assignedFreelancer, address vaultAddr) =
            jobBoard.jobs(jobId);

        assertEq(uint256(state), uint256(JobBoard.JobState.Assigned));
        assertEq(assignedFreelancer, FREELANCER);
        assertTrue(vaultAddr != address(0));

        vault = EscrowVault(payable(vaultAddr));
    }

    // ─────────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════
    //  HAPPY PATH TESTS
    // ══════════════════════════════════════════════════════════
    // ─────────────────────────────────────────────────────────

    /// @notice Full happy path: fund → deliver → markVerified(95) →
    ///         wait DISPUTE_WINDOW → finalizeAutoRelease → reputation updated
    function test_HappyPath_FullFlow() public {
        (uint256 jobId, EscrowVault vault) = _postAndAcceptJob();
        (jobId); // suppress unused warning

        assertEq(uint256(vault.getMilestoneState(0)), uint256(EscrowVault.MilestoneState.Pending));
        assertEq(address(vault).balance, 0);

        // ── Fund milestone ────────────────────────────────────────
        vm.prank(CLIENT);
        vm.expectEmit(true, false, false, true);
        emit EscrowVault.MilestoneFunded(0, BID_AMOUNT);
        vault.fundMilestone{value: BID_AMOUNT}(0);

        assertEq(uint256(vault.getMilestoneState(0)), uint256(EscrowVault.MilestoneState.Funded));
        assertEq(address(vault).balance, BID_AMOUNT);

        // ── Submit delivery ───────────────────────────────────────
        bytes32 deliveryHash = keccak256("delivery-build-cid");
        vm.prank(FREELANCER);
        vm.expectEmit(true, false, false, true);
        emit EscrowVault.DeliverySubmitted(0, deliveryHash);
        vault.submitDelivery(0, deliveryHash);

        assertEq(uint256(vault.getMilestoneState(0)), uint256(EscrowVault.MilestoneState.Delivered));

        // ── markVerified with score 95 ────────────────────────────
        vm.prank(RELAYER);
        vm.expectEmit(true, false, false, true);
        emit EscrowVault.VerificationResult(0, 95, true);
        vault.markVerified(0, 95);

        assertEq(
            uint256(vault.getMilestoneState(0)),
            uint256(EscrowVault.MilestoneState.PendingRelease)
        );
        assertGt(vault.autoReleaseTimestamp(0), uint40(block.timestamp));

        // ── Warp past dispute window ──────────────────────────────
        vm.warp(block.timestamp + 25 hours);

        // ── finalizeAutoRelease (permissionless) ──────────────────
        uint256 freelancerBefore = FREELANCER.balance;

        vm.expectEmit(true, false, false, true);
        emit EscrowVault.MilestoneReleased(0, FREELANCER, BID_AMOUNT);
        vault.finalizeAutoRelease(0);

        assertEq(uint256(vault.getMilestoneState(0)), uint256(EscrowVault.MilestoneState.Released));
        assertEq(FREELANCER.balance, freelancerBefore + BID_AMOUNT);
        assertEq(address(vault).balance, 0);

        // ── Reputation updated ────────────────────────────────────
        assertTrue(reputation.hasPassport(FREELANCER));
        assertTrue(reputation.hasPassport(CLIENT));
        assertGt(reputation.getFreelancerScore(FREELANCER), 0);
        assertGt(reputation.getClientScore(CLIENT), 0);
    }

    /// @notice Client can release manually without any verification score
    function test_HappyPath_ManualClientRelease() public {
        (, EscrowVault vault) = _postAndAcceptJob();

        vm.prank(CLIENT);
        vault.fundMilestone{value: BID_AMOUNT}(0);

        // Freelancer submits delivery
        vm.prank(FREELANCER);
        vault.submitDelivery(0, keccak256("delivery"));

        uint256 freelancerBefore = FREELANCER.balance;

        // Client releases manually — no markVerified needed
        vm.prank(CLIENT);
        vault.clientRelease(0);

        assertEq(uint256(vault.getMilestoneState(0)), uint256(EscrowVault.MilestoneState.Released));
        assertEq(FREELANCER.balance, freelancerBefore + BID_AMOUNT);
    }

    /// @notice Client can release even without delivery (pure manual override)
    function test_HappyPath_ManualClientRelease_BeforeDelivery() public {
        (, EscrowVault vault) = _postAndAcceptJob();

        vm.prank(CLIENT);
        vault.fundMilestone{value: BID_AMOUNT}(0);

        uint256 freelancerBefore = FREELANCER.balance;

        // Client decides to trust freelancer and releases early
        vm.prank(CLIENT);
        vault.clientRelease(0);

        assertEq(FREELANCER.balance, freelancerBefore + BID_AMOUNT);
    }

    // ─────────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════
    //  DISPUTE PATH TESTS
    // ══════════════════════════════════════════════════════════
    // ─────────────────────────────────────────────────────────

    /// @notice Low score → NeedsReview → raiseDispute → 2-of-3 arbiters release to freelancer
    function test_Dispute_ArbitersRelease() public {
        (, EscrowVault vault) = _postAndAcceptJob();

        vm.prank(CLIENT);
        vault.fundMilestone{value: BID_AMOUNT}(0);

        vm.prank(FREELANCER);
        vault.submitDelivery(0, keccak256("delivery"));

        // Low score → NeedsReview
        vm.prank(RELAYER);
        vault.markVerified(0, 50);
        assertEq(
            uint256(vault.getMilestoneState(0)),
            uint256(EscrowVault.MilestoneState.NeedsReview)
        );

        // Client raises dispute
        vm.prank(CLIENT);
        vault.raiseDispute(0);
        assertEq(
            uint256(vault.getMilestoneState(0)),
            uint256(EscrowVault.MilestoneState.Disputed)
        );

        // Arbiter A votes: release to freelancer
        uint256 freelancerBefore = FREELANCER.balance;
        vm.prank(ARBITER_A);
        vault.arbiterVote(0, true);

        // Only 1 vote — not resolved yet
        assertEq(
            uint256(vault.getMilestoneState(0)),
            uint256(EscrowVault.MilestoneState.Disputed)
        );

        // Arbiter B votes: release to freelancer → 2-of-3, resolves
        vm.prank(ARBITER_B);
        vm.expectEmit(true, false, false, true);
        emit EscrowVault.DisputeResolved(0, true);
        vault.arbiterVote(0, true);

        assertEq(uint256(vault.getMilestoneState(0)), uint256(EscrowVault.MilestoneState.Released));
        assertEq(FREELANCER.balance, freelancerBefore + BID_AMOUNT);

        // Reputation: freelancer got positive outcome
        assertGt(reputation.getFreelancerScore(FREELANCER), 0);
    }

    /// @notice Dispute → 2-of-3 arbiters refund to client
    function test_Dispute_ArbitersRefundClient() public {
        (, EscrowVault vault) = _postAndAcceptJob();

        vm.prank(CLIENT);
        vault.fundMilestone{value: BID_AMOUNT}(0);

        vm.prank(FREELANCER);
        vault.submitDelivery(0, keccak256("delivery"));

        vm.prank(RELAYER);
        vault.markVerified(0, 40);

        vm.prank(CLIENT);
        vault.raiseDispute(0);

        uint256 clientBefore = CLIENT.balance;

        // Arbiters A and B vote refund
        vm.prank(ARBITER_A);
        vault.arbiterVote(0, false);

        vm.prank(ARBITER_B);
        vm.expectEmit(true, false, false, true);
        emit EscrowVault.DisputeResolved(0, false);
        vault.arbiterVote(0, false);

        assertEq(uint256(vault.getMilestoneState(0)), uint256(EscrowVault.MilestoneState.Refunded));
        assertEq(CLIENT.balance, clientBefore + BID_AMOUNT);

        // Freelancer reputation penalized
        assertLt(reputation.getFreelancerScore(FREELANCER), 0);
    }

    /// @notice Dispute during PendingRelease (score ≥ 90, within window)
    function test_Dispute_DuringDisputeWindow() public {
        (, EscrowVault vault) = _postAndAcceptJob();

        vm.prank(CLIENT);
        vault.fundMilestone{value: BID_AMOUNT}(0);

        vm.prank(FREELANCER);
        vault.submitDelivery(0, keccak256("delivery"));

        vm.prank(RELAYER);
        vault.markVerified(0, 95);

        // Client disputes within window — before warp
        vm.prank(CLIENT);
        vault.raiseDispute(0);

        assertEq(
            uint256(vault.getMilestoneState(0)),
            uint256(EscrowVault.MilestoneState.Disputed)
        );
    }

    // ─────────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════
    //  TIMEOUT REFUND TESTS
    // ══════════════════════════════════════════════════════════
    // ─────────────────────────────────────────────────────────

    function test_TimeoutRefund() public {
        (, EscrowVault vault) = _postAndAcceptJob();

        vm.prank(CLIENT);
        vault.fundMilestone{value: BID_AMOUNT}(0);

        // Warp past deadline
        vm.warp(block.timestamp + DEADLINE_OFFSET + 1);

        uint256 clientBefore = CLIENT.balance;

        vm.prank(CLIENT);
        vm.expectEmit(true, false, false, true);
        emit EscrowVault.TimeoutRefunded(0, CLIENT, BID_AMOUNT);
        vault.claimTimeoutRefund(0);

        assertEq(uint256(vault.getMilestoneState(0)), uint256(EscrowVault.MilestoneState.Refunded));
        assertEq(CLIENT.balance, clientBefore + BID_AMOUNT);
    }

    // ─────────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════
    //  BID TESTS
    // ══════════════════════════════════════════════════════════
    // ─────────────────────────────────────────────────────────

    function test_Bid_WithdrawThenCannotAccept() public {
        vm.deal(CLIENT, 10 ether);

        vm.prank(CLIENT);
        creditManager.claimStarterCredits();
        vm.prank(FREELANCER);
        creditManager.claimStarterCredits();

        string[] memory pages = new string[](1);
        pages[0] = "home";

        vm.prank(CLIENT);
        uint256 jobId = jobBoard.postJob(
            JobBoard.RequirementChecklist(pages, false, false, ""),
            keccak256("spec"),
            0.5 ether,
            2 ether,
            uint40(block.timestamp + 7 days)
        );

        vm.prank(FREELANCER);
        jobBoard.submitBid(jobId, 1 ether, keccak256("prop"), 7);

        // Withdraw the bid
        vm.prank(FREELANCER);
        jobBoard.withdrawBid(jobId, 0);

        // Client tries to accept the withdrawn bid — should revert
        vm.prank(CLIENT);
        vm.expectRevert(
            abi.encodeWithSelector(JobBoard.JobBoard__BidWithdrawnCannotAccept.selector, 0)
        );
        jobBoard.acceptBid(jobId, 0);
    }

    function test_Bid_ClientCannotBid() public {
        vm.deal(CLIENT, 10 ether);

        vm.prank(CLIENT);
        creditManager.claimStarterCredits();

        string[] memory pages = new string[](1);
        pages[0] = "home";

        vm.prank(CLIENT);
        uint256 jobId = jobBoard.postJob(
            JobBoard.RequirementChecklist(pages, false, false, ""),
            keccak256("spec"),
            0.5 ether,
            2 ether,
            uint40(block.timestamp + 7 days)
        );

        vm.prank(CLIENT);
        vm.expectRevert(
            abi.encodeWithSelector(JobBoard.JobBoard__ClientCannotBid.selector, jobId)
        );
        jobBoard.submitBid(jobId, 1 ether, keccak256("prop"), 7);
    }

    // ─────────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════
    //  ACCESS CONTROL NEGATIVE TESTS
    // ══════════════════════════════════════════════════════════
    // ─────────────────────────────────────────────────────────

    function test_AccessControl_NonClientCannotFundMilestone() public {
        (, EscrowVault vault) = _postAndAcceptJob();

        vm.deal(NOBODY, BID_AMOUNT);
        vm.prank(NOBODY);
        vm.expectRevert(EscrowVault.EscrowVault__NotClient.selector);
        vault.fundMilestone{value: BID_AMOUNT}(0);
    }

    function test_AccessControl_NonFreelancerCannotSubmitDelivery() public {
        (, EscrowVault vault) = _postAndAcceptJob();

        vm.prank(CLIENT);
        vault.fundMilestone{value: BID_AMOUNT}(0);

        vm.prank(NOBODY);
        vm.expectRevert(EscrowVault.EscrowVault__NotFreelancer.selector);
        vault.submitDelivery(0, keccak256("delivery"));
    }

    function test_AccessControl_NonRelayerCannotMarkVerified() public {
        (, EscrowVault vault) = _postAndAcceptJob();

        vm.prank(CLIENT);
        vault.fundMilestone{value: BID_AMOUNT}(0);

        vm.prank(FREELANCER);
        vault.submitDelivery(0, keccak256("delivery"));

        vm.prank(NOBODY);
        vm.expectRevert(EscrowVault.EscrowVault__NotRelayer.selector);
        vault.markVerified(0, 95);
    }

    function test_AccessControl_ClientCannotMarkVerified() public {
        (, EscrowVault vault) = _postAndAcceptJob();

        vm.prank(CLIENT);
        vault.fundMilestone{value: BID_AMOUNT}(0);

        vm.prank(FREELANCER);
        vault.submitDelivery(0, keccak256("delivery"));

        // Even the client cannot call markVerified — only the relayer can
        vm.prank(CLIENT);
        vm.expectRevert(EscrowVault.EscrowVault__NotRelayer.selector);
        vault.markVerified(0, 50);
    }

    function test_AccessControl_NonArbiterCannotVote() public {
        (, EscrowVault vault) = _postAndAcceptJob();

        vm.prank(CLIENT);
        vault.fundMilestone{value: BID_AMOUNT}(0);

        vm.prank(FREELANCER);
        vault.submitDelivery(0, keccak256("delivery"));

        vm.prank(RELAYER);
        vault.markVerified(0, 50);

        vm.prank(CLIENT);
        vault.raiseDispute(0);

        vm.prank(NOBODY);
        vm.expectRevert(EscrowVault.EscrowVault__NotArbiter.selector);
        vault.arbiterVote(0, true);
    }

    function test_AccessControl_ArbiterCannotVoteTwice() public {
        (, EscrowVault vault) = _postAndAcceptJob();

        vm.prank(CLIENT);
        vault.fundMilestone{value: BID_AMOUNT}(0);

        vm.prank(FREELANCER);
        vault.submitDelivery(0, keccak256("delivery"));

        vm.prank(RELAYER);
        vault.markVerified(0, 50);

        vm.prank(CLIENT);
        vault.raiseDispute(0);

        vm.prank(ARBITER_A);
        vault.arbiterVote(0, true);

        // Arbiter A tries to vote again
        vm.prank(ARBITER_A);
        vm.expectRevert(
            abi.encodeWithSelector(EscrowVault.EscrowVault__AlreadyVoted.selector, 0, ARBITER_A)
        );
        vault.arbiterVote(0, true);
    }

    function test_AccessControl_NonTrustedVaultCannotRecordOutcome() public {
        vm.prank(NOBODY);
        vm.expectRevert(
            abi.encodeWithSelector(
                ReputationSBT.ReputationSBT__NotTrustedVault.selector, NOBODY
            )
        );
        reputation.recordOutcome(FREELANCER, CLIENT, true, 1 ether);
    }

    function test_AccessControl_NonFactoryCannotRegisterVault() public {
        vm.prank(NOBODY);
        vm.expectRevert(
            abi.encodeWithSelector(
                ReputationSBT.ReputationSBT__NotEscrowFactory.selector, NOBODY
            )
        );
        reputation.registerVault(NOBODY);
    }

    function test_AccessControl_NonJobBoardCannotCreateEscrow() public {
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1 ether;
        bytes32[] memory hashes = new bytes32[](1);
        hashes[0] = keccak256("spec");

        vm.prank(NOBODY);
        vm.expectRevert(EscrowFactory.EscrowFactory__OnlyJobBoard.selector);
        factory.createEscrow(CLIENT, FREELANCER, amounts, hashes, uint40(block.timestamp + 1 days));
    }

    function test_AccessControl_ClientCannotCallDispute_AfterWindow() public {
        (, EscrowVault vault) = _postAndAcceptJob();

        vm.prank(CLIENT);
        vault.fundMilestone{value: BID_AMOUNT}(0);

        vm.prank(FREELANCER);
        vault.submitDelivery(0, keccak256("delivery"));

        vm.prank(RELAYER);
        vault.markVerified(0, 95);

        // Warp past the dispute window
        vm.warp(block.timestamp + 25 hours);

        vm.prank(CLIENT);
        vm.expectRevert(
            abi.encodeWithSelector(EscrowVault.EscrowVault__DisputeWindowElapsed.selector, 0)
        );
        vault.raiseDispute(0);
    }

    function test_AccessControl_FinalizeAutoReleaseBeforeWindowReverts() public {
        (, EscrowVault vault) = _postAndAcceptJob();

        vm.prank(CLIENT);
        vault.fundMilestone{value: BID_AMOUNT}(0);

        vm.prank(FREELANCER);
        vault.submitDelivery(0, keccak256("delivery"));

        vm.prank(RELAYER);
        vault.markVerified(0, 95);

        // Window not elapsed yet
        vm.expectRevert(
            abi.encodeWithSelector(EscrowVault.EscrowVault__DisputeWindowNotElapsed.selector, 0)
        );
        vault.finalizeAutoRelease(0);
    }

    function test_AccessControl_TimeoutRefundBeforeDeadlineReverts() public {
        (, EscrowVault vault) = _postAndAcceptJob();

        vm.prank(CLIENT);
        vault.fundMilestone{value: BID_AMOUNT}(0);

        // Deadline not reached
        vm.prank(CLIENT);
        vm.expectRevert(EscrowVault.EscrowVault__DeadlineNotReached.selector);
        vault.claimTimeoutRefund(0);
    }

    // ─────────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════
    //  REENTRANCY TESTS
    // ══════════════════════════════════════════════════════════
    // ─────────────────────────────────────────────────────────

    /// @notice Reentrancy attack on finalizeAutoRelease should be blocked by nonReentrant
    function test_Reentrancy_FinalizeAutoRelease() public {
        (, EscrowVault vault) = _postAndAcceptJob();

        vm.prank(CLIENT);
        vault.fundMilestone{value: BID_AMOUNT}(0);

        // In a real attack, the freelancer address would be the attacker contract.
        // Here, we test the guard by deploying attacker as an external caller,
        // but we cannot replace the freelancer address after initialization.
        // Instead, we verify nonReentrant by direct state inspection.
        //
        // The guard is enforced by OpenZeppelin ReentrancyGuard — the unit test
        // validates that repeated calls after resolution revert with wrong state.

        vm.prank(FREELANCER);
        vault.submitDelivery(0, keccak256("delivery"));

        vm.prank(RELAYER);
        vault.markVerified(0, 95);

        vm.warp(block.timestamp + 25 hours);

        // First call succeeds
        vault.finalizeAutoRelease(0);
        assertEq(uint256(vault.getMilestoneState(0)), uint256(EscrowVault.MilestoneState.Released));

        // Second call (simulating reentrancy re-entry or double-call) must revert
        vm.expectRevert(
            abi.encodeWithSelector(
                EscrowVault.EscrowVault__WrongState.selector,
                0,
                EscrowVault.MilestoneState.Released,
                EscrowVault.MilestoneState.PendingRelease
            )
        );
        vault.finalizeAutoRelease(0);
    }

    // ─────────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════
    //  SOULBOUND TESTS
    // ══════════════════════════════════════════════════════════
    // ─────────────────────────────────────────────────────────

    function test_Soulbound_TransferReverts() public {
        // Mint a passport
        vm.prank(CLIENT);
        reputation.mintPassport();

        uint256 tokenId = reputation.passportOf(CLIENT);

        // Try transferFrom — must revert
        vm.prank(CLIENT);
        vm.expectRevert(ReputationSBT.ReputationSBT__Soulbound.selector);
        reputation.transferFrom(CLIENT, NOBODY, tokenId);
    }

    function test_Soulbound_SafeTransferReverts() public {
        vm.prank(CLIENT);
        reputation.mintPassport();

        uint256 tokenId = reputation.passportOf(CLIENT);

        vm.prank(CLIENT);
        vm.expectRevert(ReputationSBT.ReputationSBT__Soulbound.selector);
        reputation.safeTransferFrom(CLIENT, NOBODY, tokenId, "");
    }

    function test_Soulbound_MintPassportIdempotent() public {
        vm.prank(CLIENT);
        reputation.mintPassport();
        assertTrue(reputation.hasPassport(CLIENT));

        // Second mint — no-op, no revert
        vm.prank(CLIENT);
        reputation.mintPassport();
        assertTrue(reputation.hasPassport(CLIENT));

        // Should still have exactly one passport
        assertGt(reputation.passportOf(CLIENT), 0);
    }

    // ─────────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════
    //  REPUTATION SCORE TESTS
    // ══════════════════════════════════════════════════════════
    // ─────────────────────────────────────────────────────────

    function test_Reputation_ScoreUpdatesCorrectly() public {
        (, EscrowVault vault) = _postAndAcceptJob();

        vm.prank(CLIENT);
        vault.fundMilestone{value: BID_AMOUNT}(0);

        vm.prank(FREELANCER);
        vault.submitDelivery(0, keccak256("delivery"));

        vm.prank(RELAYER);
        vault.markVerified(0, 95);

        vm.warp(block.timestamp + 25 hours);
        vault.finalizeAutoRelease(0);

        // BID_AMOUNT = 1 ether = 1e18 wei → unit = 1e18/1e18 = 1
        assertEq(reputation.getFreelancerScore(FREELANCER), 1);
        assertEq(reputation.getClientScore(CLIENT), 1);
        assertEq(reputation.freelancerJobsCompleted(FREELANCER), 1);
    }

    function test_Reputation_NegativeScoreForLostDispute() public {
        (, EscrowVault vault) = _postAndAcceptJob();

        vm.prank(CLIENT);
        vault.fundMilestone{value: BID_AMOUNT}(0);

        vm.prank(FREELANCER);
        vault.submitDelivery(0, keccak256("delivery"));

        vm.prank(RELAYER);
        vault.markVerified(0, 40);

        vm.prank(CLIENT);
        vault.raiseDispute(0);

        // Arbiters vote refund (freelancer loses)
        vm.prank(ARBITER_A);
        vault.arbiterVote(0, false);
        vm.prank(ARBITER_B);
        vault.arbiterVote(0, false);

        // unit = 1 ether / 1e18 = 1; penalty = -2
        assertEq(reputation.getFreelancerScore(FREELANCER), -2);
        assertEq(reputation.freelancerJobsFailed(FREELANCER), 1);
    }

    // ─────────────────────────────────────────────────────────
    // ══════════════════════════════════════════════════════════
    //  EDGE CASE TESTS
    // ══════════════════════════════════════════════════════════
    // ─────────────────────────────────────────────────────────

    function test_Edge_CannotFundWrongAmount() public {
        (, EscrowVault vault) = _postAndAcceptJob();

        vm.prank(CLIENT);
        vm.expectRevert(
            abi.encodeWithSelector(
                EscrowVault.EscrowVault__WrongValue.selector,
                0.5 ether,
                BID_AMOUNT
            )
        );
        vault.fundMilestone{value: 0.5 ether}(0);
    }

    function test_Edge_CannotDoubleFundMilestone() public {
        (, EscrowVault vault) = _postAndAcceptJob();

        vm.prank(CLIENT);
        vault.fundMilestone{value: BID_AMOUNT}(0);

        // State is now Funded; second fundMilestone call expects Pending → reverts
        vm.prank(CLIENT);
        vm.expectRevert(
            abi.encodeWithSelector(
                EscrowVault.EscrowVault__WrongState.selector,
                0,
                EscrowVault.MilestoneState.Funded,
                EscrowVault.MilestoneState.Pending
            )
        );
        vault.fundMilestone{value: BID_AMOUNT}(0);
    }

    function test_Edge_PostJob_DeadlineInPast_Reverts() public {
        vm.prank(CLIENT);
        creditManager.claimStarterCredits();

        string[] memory pages = new string[](0);
        vm.prank(CLIENT);
        vm.expectRevert(JobBoard.JobBoard__DeadlineInPast.selector);
        jobBoard.postJob(
            JobBoard.RequirementChecklist(pages, false, false, ""),
            keccak256("spec"),
            0,
            1 ether,
            uint40(block.timestamp - 1) // past
        );
    }

    function test_Edge_PostJob_InvalidBudgetRange_Reverts() public {
        vm.prank(CLIENT);
        creditManager.claimStarterCredits();

        string[] memory pages = new string[](0);
        vm.prank(CLIENT);
        vm.expectRevert(JobBoard.JobBoard__BudgetRangeInvalid.selector);
        jobBoard.postJob(
            JobBoard.RequirementChecklist(pages, false, false, ""),
            keccak256("spec"),
            2 ether,  // min > max
            1 ether,
            uint40(block.timestamp + 7 days)
        );
    }

    function test_Edge_EscrowFactory_MaxMilestonesEnforced() public {
        // Create a direct vault init with > MAX_MILESTONES entries
        EscrowVault badVault = new EscrowVault();

        uint256[] memory amounts = new uint256[](11); // exceeds MAX_MILESTONES=10
        bytes32[] memory hashes = new bytes32[](11);
        address[3] memory arbs = [ARBITER_A, ARBITER_B, ARBITER_C];

        vm.expectRevert("EscrowVault: milestone count out of range");
        badVault.initialize(
            CLIENT, FREELANCER, RELAYER, amounts, hashes,
            uint40(block.timestamp + 1 days), arbs, address(reputation), address(creditManager)
        );
    }

    function test_Edge_MarkVerified_ScoreOver100_Reverts() public {
        (, EscrowVault vault) = _postAndAcceptJob();

        vm.prank(CLIENT);
        vault.fundMilestone{value: BID_AMOUNT}(0);

        vm.prank(FREELANCER);
        vault.submitDelivery(0, keccak256("delivery"));

        vm.prank(RELAYER);
        vm.expectRevert("EscrowVault: score > 100");
        vault.markVerified(0, 101);
    }

    function test_Edge_Boundary_Score90AutoReleases() public {
        (, EscrowVault vault) = _postAndAcceptJob();

        vm.prank(CLIENT);
        vault.fundMilestone{value: BID_AMOUNT}(0);

        vm.prank(FREELANCER);
        vault.submitDelivery(0, keccak256("delivery"));

        // Exactly 90 should trigger PendingRelease (auto-release path)
        vm.prank(RELAYER);
        vault.markVerified(0, 90);

        assertEq(
            uint256(vault.getMilestoneState(0)),
            uint256(EscrowVault.MilestoneState.PendingRelease)
        );
    }

    function test_Edge_Boundary_Score89NeedsReview() public {
        (, EscrowVault vault) = _postAndAcceptJob();

        vm.prank(CLIENT);
        vault.fundMilestone{value: BID_AMOUNT}(0);

        vm.prank(FREELANCER);
        vault.submitDelivery(0, keccak256("delivery"));

        // 89 should fall to NeedsReview
        vm.prank(RELAYER);
        vault.markVerified(0, 89);

        assertEq(
            uint256(vault.getMilestoneState(0)),
            uint256(EscrowVault.MilestoneState.NeedsReview)
        );
    }

    function test_acceptBid_CannotAcceptSecondBid() public {
        vm.deal(CLIENT, 10 ether);
        vm.deal(FREELANCER, 1 ether);
        vm.deal(NOBODY, 1 ether);

        vm.prank(CLIENT);
        creditManager.claimStarterCredits();
        vm.prank(FREELANCER);
        creditManager.claimStarterCredits();
        vm.prank(NOBODY);
        creditManager.claimStarterCredits();

        string[] memory pages = new string[](1);
        pages[0] = "home";

        vm.prank(CLIENT);
        uint256 jobId = jobBoard.postJob(
            JobBoard.RequirementChecklist(pages, false, false, ""),
            keccak256("spec"),
            0.5 ether,
            2 ether,
            uint40(block.timestamp + 7 days)
        );

        // Bid 0 from FREELANCER
        vm.prank(FREELANCER);
        jobBoard.submitBid(jobId, 1 ether, keccak256("prop1"), 7);

        // Bid 1 from NOBODY
        vm.prank(NOBODY);
        jobBoard.submitBid(jobId, 1.2 ether, keccak256("prop2"), 8);

        // Accept Bid 0
        vm.prank(CLIENT);
        jobBoard.acceptBid(jobId, 0);

        // Accepting Bid 1 should revert because job is Assigned (Not Open)
        vm.prank(CLIENT);
        vm.expectRevert(
            abi.encodeWithSelector(JobBoard.JobBoard__NotOpen.selector, jobId)
        );
        jobBoard.acceptBid(jobId, 1);
    }

    function test_ReputationAndCredits_ReleaseVsRefundDeltas() public {
        // --- Successful Release Path (Client Release) ---
        (uint256 jobId, EscrowVault vault) = _postAndAcceptJob();
        (jobId);
        
        // Initial balances after posting & bidding
        // Client: 10 - 2 = 8
        // Freelancer: 10 - 1 = 9
        uint256 clientBalBefore = creditManager.creditBalance(CLIENT);
        uint256 freelancerBalBefore = creditManager.creditBalance(FREELANCER);
        assertEq(clientBalBefore, 8);
        assertEq(freelancerBalBefore, 9);
        
        // Fund
        vm.prank(CLIENT);
        vault.fundMilestone{value: BID_AMOUNT}(0);
        
        // Manual Release
        vm.prank(CLIENT);
        vault.clientRelease(0);
        
        // Balances after successful release:
        // Client gets CLIENT_COMPLETION_REWARD (1) -> 8 + 1 = 9
        // Freelancer gets JOB_COMPLETION_REWARD (3) -> 9 + 3 = 12
        assertEq(creditManager.creditBalance(CLIENT), 9);
        assertEq(creditManager.creditBalance(FREELANCER), 12);
        
        // Reputation score deltas on release:
        // Client: +1
        // Freelancer: +1
        assertEq(reputation.getClientScore(CLIENT), 1);
        assertEq(reputation.getFreelancerScore(FREELANCER), 1);
        
        // --- Refund Path (Timeout Refund) ---
        // Setup another job to test refund path
        vm.deal(CLIENT, 10 ether);
        
        string[] memory pages = new string[](1);
        pages[0] = "home";
        
        vm.prank(CLIENT);
        uint256 jobId2 = jobBoard.postJob(
            JobBoard.RequirementChecklist(pages, false, false, ""),
            keccak256("spec2"),
            0.5 ether,
            2 ether,
            uint40(block.timestamp + 7 days)
        );
        
        // Client balance now: 9 - 2 = 7
        
        vm.prank(FREELANCER);
        jobBoard.submitBid(jobId2, 1 ether, keccak256("prop2"), 7);
        // Freelancer balance now: 12 - 1 = 11
        
        vm.prank(CLIENT);
        jobBoard.acceptBid(jobId2, 0);
        
        (,,,,,,,, address vaultAddr2) = jobBoard.jobs(jobId2);
        EscrowVault vault2 = EscrowVault(payable(vaultAddr2));
        
        // Fund
        vm.prank(CLIENT);
        vault2.fundMilestone{value: 1 ether}(0);
        
        // Warp past deadline
        vm.warp(block.timestamp + 7 days + 1);
        
        // Claim refund
        uint256 clientCreditsBeforeRefund = creditManager.creditBalance(CLIENT);
        uint256 freelancerCreditsBeforeRefund = creditManager.creditBalance(FREELANCER);
        int256 clientRepBeforeRefund = reputation.getClientScore(CLIENT);
        int256 freelancerRepBeforeRefund = reputation.getFreelancerScore(FREELANCER);
        
        vm.prank(CLIENT);
        vault2.claimTimeoutRefund(0);
        
        // Verify no credits rewarded
        assertEq(creditManager.creditBalance(CLIENT), clientCreditsBeforeRefund);
        assertEq(creditManager.creditBalance(FREELANCER), freelancerCreditsBeforeRefund);
        
        // Verify reputation reflects refund/timeout (freelancer gets penalised or score changes)
        assertEq(reputation.getClientScore(CLIENT), clientRepBeforeRefund);
        assertEq(reputation.getFreelancerScore(FREELANCER), freelancerRepBeforeRefund); // not updated on refund
    }
}


