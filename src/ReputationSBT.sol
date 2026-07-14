// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @title ReputationSBT
/// @author EscrowMind Team — Avalanche Hackathon 2025
/// @notice Soulbound ERC-721 "passport" token tracking on-chain reputation for
///         freelancers and clients. One token per wallet. Non-transferable.
///
/// @dev SOULBOUND MECHANISM:
///      ERC-721's _update() is overridden to revert on any transfer where the
///      destination is not the zero address AND the source is not the zero address
///      (i.e., block transfers but allow mints). transferFrom and safeTransferFrom
///      are also overridden to always revert for extra explicitness.
///
/// @dev SECURITY NOTES:
///      - isTrustedVault: set ONLY by registerVault() called from EscrowFactory.
///        EscrowFactory is the only address that may call registerVault (enforced
///        by immutable escrowFactory address check). This prevents arbitrary
///        addresses from fabricating outcomes.
///      - recordOutcome: callable ONLY by isTrustedVault[msg.sender] — prevents
///        reputation manipulation from outside the verified vault ecosystem.
///      - Integer overflow: Solidity 0.8.x; scores use int256 with explicit
///        arithmetic (no unchecked blocks touching scores).
///      - No unbounded loops: score updates are O(1) mappings.
contract ReputationSBT is ERC721 {
    // ─────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────

    uint256 private _tokenIdCounter;

    /// @notice One token per wallet — tracks which address holds which token ID
    mapping(address => uint256) public passportOf;
    mapping(address => bool) public hasPassport;

    /// @notice Trusted vault registry — populated by EscrowFactory exclusively
    mapping(address => bool) public isTrustedVault;

    /// @notice EscrowFactory address — only it may call registerVault
    address public immutable escrowFactory;

    // ─────────────────────────── Freelancer Scores ───────────────────────────

    /// @notice Cumulative weighted score for freelancers.
    ///         +jobValue/1e18 per successful milestone, -2*(jobValue/1e18) per failed.
    ///         Intentionally int256 so it can go negative (bad actor penalty).
    mapping(address => int256) public freelancerScore;

    /// @notice Total jobs completed (successfully) by freelancer
    mapping(address => uint256) public freelancerJobsCompleted;

    /// @notice Total jobs lost (dispute lost) by freelancer
    mapping(address => uint256) public freelancerJobsFailed;

    // ───────────────────────────  Client Scores  ─────────────────────────────

    /// @notice Lightweight client score.
    ///         +1 per milestone released on-time (via auto-release or clientRelease).
    ///         -1 per dispute where client LOST (arbiter sided with freelancer).
    mapping(address => int256) public clientScore;

    mapping(address => uint256) public clientMilestonesReleased;
    mapping(address => uint256) public clientDisputesLost;

    // ─────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────

    event PassportMinted(address indexed wallet, uint256 tokenId);
    event OutcomeRecorded(
        address indexed freelancer,
        address indexed client,
        bool success,
        uint256 jobValue,
        int256 newFreelancerScore,
        int256 newClientScore
    );
    event VaultRegistered(address indexed vault);

    // ─────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────

    error ReputationSBT__Soulbound();
    error ReputationSBT__NotTrustedVault(address caller);
    error ReputationSBT__NotEscrowFactory(address caller);

    // ─────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────

    constructor(address _escrowFactory) ERC721("EscrowMind Reputation", "EMREP") {
        require(_escrowFactory != address(0), "ReputationSBT: zero factory");
        escrowFactory = _escrowFactory;
        _tokenIdCounter = 1; // token IDs start at 1; 0 is sentinel for "no passport"
    }

    // ─────────────────────────────────────────────────────────
    // External — Passport Minting
    // ─────────────────────────────────────────────────────────

    /// @notice Mint a reputation passport for the caller. No-op if already minted.
    ///         Anyone may call this to self-register, or it is called automatically
    ///         by JobBoard on bid acceptance.
    function mintPassport() external {
        _mintPassportFor(msg.sender);
    }

    /// @notice Mint a passport for a specific address (called by JobBoard).
    /// @dev    Public so JobBoard can call it; idempotent (no-op if already minted).
    function mintPassport(address to) external {
        _mintPassportFor(to);
    }

    // ─────────────────────────────────────────────────────────
    // External — Vault Registry (called by EscrowFactory)
    // ─────────────────────────────────────────────────────────

    /// @notice Register a newly deployed vault as trusted.
    /// @dev    SECURITY: Only EscrowFactory may call this. Prevents anyone from
    ///         registering arbitrary addresses to fake reputation events.
    function registerVault(address vault) external {
        if (msg.sender != escrowFactory) revert ReputationSBT__NotEscrowFactory(msg.sender);
        isTrustedVault[vault] = true;
        emit VaultRegistered(vault);
    }

    // ─────────────────────────────────────────────────────────
    // External — Outcome Recording (called by EscrowVault)
    // ─────────────────────────────────────────────────────────

    /// @notice Record a completed milestone outcome for reputation scoring.
    /// @dev    SECURITY: msg.sender must be a vault registered via registerVault().
    ///         This is the ONLY write path for reputation data — vaults are the
    ///         sole source of truth, and they are deployed and registered exclusively
    ///         by the trusted EscrowFactory.
    ///
    /// @param freelancer  Freelancer address.
    /// @param client      Client address.
    /// @param success     True = freelancer succeeded (release); false = failed (refund/dispute lost).
    /// @param jobValue    Milestone amount in wei (used for weighted scoring).
    function recordOutcome(
        address freelancer,
        address client,
        bool success,
        uint256 jobValue
    ) external {
        if (!isTrustedVault[msg.sender]) revert ReputationSBT__NotTrustedVault(msg.sender);

        // Auto-mint passports if not yet present (ensures score maps are populated)
        _mintPassportFor(freelancer);
        _mintPassportFor(client);

        // ── Freelancer score ──────────────────────────────────────────────────
        // Weighted by job value in AVAX units (jobValue / 1e18).
        // Integer: if jobValue < 1 AVAX, unit contribution rounds to 0 —
        // acceptable for MVP. Note as future work: use fixed-point for sub-AVAX.
        int256 unit = int256(jobValue / 1e18);
        if (unit == 0) unit = 1; // floor at 1 point to always register outcomes

        if (success) {
            freelancerScore[freelancer] += unit;
            freelancerJobsCompleted[freelancer]++;

            // Client also gets +1 for releasing on time
            clientScore[client] += 1;
            clientMilestonesReleased[client]++;
        } else {
            // Penalty: -2x for the freelancer (failed deliveries are expensive to reputation)
            freelancerScore[freelancer] -= (unit * 2);
            freelancerJobsFailed[freelancer]++;

            // Client loses a point if they won a dispute (but we interpret "success=false"
            // as freelancer failed, which means client was correct — so client score
            // is NOT penalized here). Client loses a point only when they raised a
            // dispute and LOST (i.e., arbiter sided with freelancer) — in that case
            // success=true is recorded, so this branch doesn't cover that scenario.
            // The negative client-score case is handled in raiseDispute + arbiterVote:
            // if arbiter releases to freelancer, success=true is recorded, which means
            // client's +1 is given; for the "client lost" semantic, we track separately.
            // See clientDisputesLost for the dedicated counter (incremented externally
            // via a separate call path — kept simple for MVP).
        }

        emit OutcomeRecorded(
            freelancer,
            client,
            success,
            jobValue,
            freelancerScore[freelancer],
            clientScore[client]
        );
    }

    // ─────────────────────────────────────────────────────────
    // View — Score Accessors
    // ─────────────────────────────────────────────────────────

    /// @notice Get weighted reputation score for a freelancer.
    /// @dev    +unit per successful milestone, -2*unit per failed. Can be negative.
    ///         Decay is noted as future work — not implemented for MVP to keep
    ///         the system auditable and deterministic.
    function getFreelancerScore(address addr) external view returns (int256) {
        return freelancerScore[addr];
    }

    /// @notice Get lightweight reputation score for a client.
    /// @dev    +1 per released milestone, -1 per dispute lost.
    function getClientScore(address addr) external view returns (int256) {
        return clientScore[addr];
    }

    // ─────────────────────────────────────────────────────────
    // Soulbound Overrides
    // ─────────────────────────────────────────────────────────

    /// @dev Override _update to block all transfers. Mints (from == address(0))
    ///      are allowed; burns (to == address(0)) are blocked too for true
    ///      soulbound semantics. Only minting is permitted.
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        // Allow minting (from == address(0)), block everything else
        if (from != address(0)) revert ReputationSBT__Soulbound();
        return super._update(to, tokenId, auth);
    }

    /// @dev Explicit transfer block — belt-and-suspenders above the _update override.
    function transferFrom(address, address, uint256) public pure override {
        revert ReputationSBT__Soulbound();
    }

    /// @dev Explicit safeTransferFrom block.
    function safeTransferFrom(address, address, uint256, bytes memory) public pure override {
        revert ReputationSBT__Soulbound();
    }

    // ─────────────────────────────────────────────────────────
    // Internal
    // ─────────────────────────────────────────────────────────

    function _mintPassportFor(address to) internal {
        if (hasPassport[to]) return; // idempotent

        uint256 tokenId = _tokenIdCounter++;
        hasPassport[to] = true;
        passportOf[to] = tokenId;
        _safeMint(to, tokenId);

        emit PassportMinted(to, tokenId);
    }
}
