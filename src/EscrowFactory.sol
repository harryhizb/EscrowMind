// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "./interfaces/IEscrowMind.sol";

interface IEscrowVaultInit {
    function initialize(
        address client,
        address freelancer,
        address trustedRelayer,
        uint256[] calldata milestoneAmounts,
        bytes32[] calldata milestoneSpecHashes,
        uint40 deadline,
        address[3] calldata arbiters,
        address reputationSBT,
        address creditManager
    ) external;
}

interface IReputationSBTFactory {
    function registerVault(address vault) external;
}

/// @title EscrowFactory
/// @author EscrowMind Team — Avalanche Hackathon 2025
/// @notice Deploys minimal-proxy clones (EIP-1167) of EscrowVault per job.
///         Maintains a registry of valid vault addresses so ReputationSBT can
///         trust attestations only from vaults it created.
///
/// @dev Security notes:
///      - SECURITY (access control): Only the JobBoard contract (set at construction)
///        may call createEscrow. This prevents arbitrary parties from registering
///        fake vaults in the isTrustedVault mapping.
///      - SECURITY (clone re-initialization): EscrowVault uses OpenZeppelin
///        Initializable — initialize() can only be called once per clone.
///      - SECURITY (integer overflow): Not applicable — no arithmetic here.
contract EscrowFactory {
    using Clones for address;

    // ─────────────────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────────────────

    /// @notice The EscrowVault implementation contract (cloned for every job)
    address public immutable implementation;

    /// @notice The single authorized JobBoard that may call createEscrow
    address public immutable jobBoard;

    /// @notice The trusted relayer wallet (backend service) injected into each vault.
    ///         SECURITY: This relayer can ONLY call markVerified — it has no fund-moving
    ///         capability. See EscrowVault.markVerified() for enforcement.
    address public immutable trustedRelayer;

    /// @notice The ReputationSBT contract — notified of each new vault
    address public immutable reputationSBT;

    /// @notice The CreditManager contract — passed to each new vault
    address public immutable creditManager;

    /// @notice Fixed arbiter panel for MVP (hardcoded at factory deploy)
    address[3] public arbiters;

    /// @notice Registry of all vaults deployed by this factory.
    ///         ReputationSBT checks this before accepting recordOutcome calls.
    mapping(address => bool) public isTrustedVault;

    // ─────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────

    event VaultDeployed(address indexed vault, address indexed client, address indexed freelancer);

    // ─────────────────────────────────────────────────────────
    // Errors
    // ─────────────────────────────────────────────────────────

    error EscrowFactory__OnlyJobBoard();

    // ─────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────

    constructor(
        address _implementation,
        address _jobBoard,
        address _trustedRelayer,
        address _reputationSBT,
        address _creditManager,
        address[3] memory _arbiters
    ) {
        require(_implementation != address(0), "EscrowFactory: zero impl");
        require(_jobBoard != address(0), "EscrowFactory: zero jobBoard");
        require(_trustedRelayer != address(0), "EscrowFactory: zero relayer");
        require(_reputationSBT != address(0), "EscrowFactory: zero rep");
        require(_creditManager != address(0), "EscrowFactory: zero creditManager");
        implementation = _implementation;
        jobBoard = _jobBoard;
        trustedRelayer = _trustedRelayer;
        reputationSBT = _reputationSBT;
        creditManager = _creditManager;
        arbiters = _arbiters;
    }

    // ─────────────────────────────────────────────────────────
    // External
    // ─────────────────────────────────────────────────────────

    /// @notice Deploy a new EscrowVault clone for a job.
    /// @dev    SECURITY: `onlyJobBoard` modifier prevents unauthorized vault
    ///         registration. The clone is initialized in the same transaction to
    ///         prevent front-running of initialize calls.
    /// @param client              The job client address.
    /// @param freelancer          The assigned freelancer address.
    /// @param milestoneAmounts    Array of AVAX amounts (wei) per milestone.
    /// @param milestoneSpecHashes Array of spec hashes per milestone (from JobBoard).
    /// @param deadline            Job-level delivery deadline.
    /// @return vault              Address of the newly deployed EscrowVault clone.
    function createEscrow(
        address client,
        address freelancer,
        uint256[] calldata milestoneAmounts,
        bytes32[] calldata milestoneSpecHashes,
        uint40 deadline
    ) external onlyJobBoard returns (address vault) {
        // SECURITY: Clone + initialize atomically. No window for front-running
        // the initialize call because clone() + initialize() happen in one tx.
        vault = implementation.clone();

        // CREDIT SYSTEM INTEGRATION: authorize the newly deployed vault to spend/reward credits
        // Use factory-specific authorizeVault() which doesn't require owner permission
        ICreditManager(creditManager).authorizeVault(vault);

        IEscrowVaultInit(vault).initialize(
            client,
            freelancer,
            trustedRelayer,
            milestoneAmounts,
            milestoneSpecHashes,
            deadline,
            arbiters,
            reputationSBT,
            creditManager
        );

        // Register vault in the trusted registry BEFORE emitting — state first.
        isTrustedVault[vault] = true;

        // Tell ReputationSBT about the new trusted vault
        IReputationSBTFactory(reputationSBT).registerVault(vault);

        emit VaultDeployed(vault, client, freelancer);
    }

    // ─────────────────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────────────────

    modifier onlyJobBoard() {
        if (msg.sender != jobBoard) revert EscrowFactory__OnlyJobBoard();
        _;
    }
}
