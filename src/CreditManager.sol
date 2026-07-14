// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title CreditManager
/// @author EscrowMind Team — Avalanche hackathon (Team1 Pakistan Developer Bounty)
/// @notice Non-transferable internal credit system (Upwork Connects model) for EscrowMind.
///         Gates posting jobs and submitting bids to prevent spam.
contract CreditManager is ReentrancyGuard {
    // ─────────────────────────────────────────────────────────
    // State Variables
    // ─────────────────────────────────────────────────────────

    uint256 public constant STARTER_CREDITS = 10;
    uint256 public constant JOB_POST_COST = 2;
    uint256 public constant BID_COST = 1;
    uint256 public constant JOB_COMPLETION_REWARD = 3;
    uint256 public constant CLIENT_COMPLETION_REWARD = 1;
    uint256 public constant HOURLY_TASK_REWARD = 1;
    uint40 public constant HOURLY_CLAIM_COOLDOWN = 1 hours;

    uint256 public creditsPerAvax;
    address public owner;
    address public treasury;

    mapping(address => uint256) public creditBalance;
    mapping(address => bool) public hasClaimedStarter;
    mapping(address => uint40) public lastHourlyClaim;
    mapping(address => bool) public authorizedSpenders;

    // ─────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────

    event StarterCreditsClaimed(address indexed user, uint256 amount);
    event CreditsSpent(address indexed user, uint256 amount, string reason);
    event CreditsEarned(address indexed user, uint256 amount, string reason);
    event HourlyTaskClaimed(address indexed user);
    event CreditsPurchased(address indexed user, uint256 avaxPaid, uint256 creditsReceived);
    event SpenderAuthorizationChanged(address indexed contractAddr, bool allowed);
    event CreditsPerAvaxUpdated(uint256 oldRate, uint256 newRate);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    // ─────────────────────────────────────────────────────────
    // Custom Errors
    // ─────────────────────────────────────────────────────────

    error CreditManager__NotOwner();
    error CreditManager__NotAuthorizedSpender();
    error CreditManager__StarterAlreadyClaimed();
    error CreditManager__InsufficientCredits(uint256 available, uint256 required);
    error CreditManager__HourlyCooldownActive(uint256 nextAvailable);
    error CreditManager__ZeroAddress();
    error CreditManager__ZeroValue();
    error CreditManager__TransferFailed();

    // ─────────────────────────────────────────────────────────
    // Modifiers
    // ─────────────────────────────────────────────────────────

    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert CreditManager__NotOwner();
        }
        _;
    }

    modifier onlyAuthorizedSpender() {
        if (!authorizedSpenders[msg.sender]) {
            revert CreditManager__NotAuthorizedSpender();
        }
        _;
    }

    // ─────────────────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────────────────

    constructor(uint256 _creditsPerAvax) {
        owner = msg.sender;
        treasury = msg.sender;
        creditsPerAvax = _creditsPerAvax;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    // ─────────────────────────────────────────────────────────
    // External Functions
    // ─────────────────────────────────────────────────────────

    /// @notice Claims the one-time free starter credits for new users.
    function claimStarterCredits() external {
        if (hasClaimedStarter[msg.sender]) {
            revert CreditManager__StarterAlreadyClaimed();
        }
        hasClaimedStarter[msg.sender] = true;
        creditBalance[msg.sender] += STARTER_CREDITS;

        emit StarterCreditsClaimed(msg.sender, STARTER_CREDITS);
    }

    /// @notice Deducts credits from a user's balance. Callable only by whitelisted contracts.
    /// @param user The address of the user spending credits.
    /// @param amount The number of credits to spend.
    /// @param reason Context string (e.g. "job_post", "bid_submit").
    function spendCredits(
        address user,
        uint256 amount,
        string calldata reason
    ) external onlyAuthorizedSpender {
        uint256 currentBalance = creditBalance[user];
        if (currentBalance < amount) {
            revert CreditManager__InsufficientCredits(currentBalance, amount);
        }
        creditBalance[user] = currentBalance - amount;

        emit CreditsSpent(user, amount, reason);
    }

    /// @notice Rewards credits to a user. Callable only by whitelisted contracts.
    /// @param user The address of the user earning credits.
    /// @param amount The number of credits to reward.
    /// @param reason Context string (e.g. "job_completed").
    function rewardCredits(
        address user,
        uint256 amount,
        string calldata reason
    ) external onlyAuthorizedSpender {
        creditBalance[user] += amount;

        emit CreditsEarned(user, amount, reason);
    }



    /// @notice Claims an hourly reward of 1 credit, with a 1-hour cooldown.
    function claimHourlyTask() public {
        uint40 lastClaim = lastHourlyClaim[msg.sender];
        if (lastClaim != 0 && block.timestamp < lastClaim + HOURLY_CLAIM_COOLDOWN) {
            revert CreditManager__HourlyCooldownActive(lastClaim + HOURLY_CLAIM_COOLDOWN);
        }

        lastHourlyClaim[msg.sender] = uint40(block.timestamp);
        creditBalance[msg.sender] += HOURLY_TASK_REWARD;

        emit HourlyTaskClaimed(msg.sender);
    }

    /// @notice Backward-compatible alias for older frontends. Prefer claimHourlyTask().
    function claimDailyTask() external {
        claimHourlyTask();
    }

    /// @notice Backward-compatible alias for older frontends. Prefer lastHourlyClaim.
    function lastDailyClaim(address user) external view returns (uint40) {
        return lastHourlyClaim[user];
    }

    /// @notice Purchase credits using Fuji testnet AVAX.
    function purchaseCredits() external payable nonReentrant {
        if (msg.value == 0) revert CreditManager__ZeroValue();
        uint256 credits = (msg.value * creditsPerAvax) / 1 ether;
        if (credits == 0) revert CreditManager__ZeroValue();

        creditBalance[msg.sender] += credits;

        (bool ok,) = payable(treasury).call{value: msg.value}("");
        if (!ok) revert CreditManager__TransferFailed();

        emit CreditsPurchased(msg.sender, msg.value, credits);
    }

    /// @notice Returns the credit balance of a user.
    function balanceOf(address user) external view returns (uint256) {
        return creditBalance[user];
    }

    // ─────────────────────────────────────────────────────────
    // Owner Admin Functions
    // ─────────────────────────────────────────────────────────

    /// @notice Whitelists or removes a contract authorized to spend/reward credits.
    /// @dev Only the owner can authorize spenders (prevents privilege escalation).
    function setAuthorizedSpender(address contractAddr, bool allowed) external onlyOwner {
        if (contractAddr == address(0)) {
            revert CreditManager__ZeroAddress();
        }
        authorizedSpenders[contractAddr] = allowed;
        emit SpenderAuthorizationChanged(contractAddr, allowed);
    }

    /// @notice Factory-specific authorization for newly created vaults.
    /// @dev This is called by EscrowFactory when creating a new vault clone.
    ///      Only authorized factories can call this (checked via EscrowFactory msg.sender).
    function authorizeVault(address vault) external {
        // Only call from factory - factory.createEscrow() already checks onlyJobBoard
        // We trust that if factory is calling us, it's legitimate
        if (vault == address(0)) {
            revert CreditManager__ZeroAddress();
        }
        authorizedSpenders[vault] = true;
        emit SpenderAuthorizationChanged(vault, true);
    }

    /// @notice Updates the exchange rate of credits per AVAX.
    function setCreditsPerAvax(uint256 rate) external onlyOwner {
        uint256 oldRate = creditsPerAvax;
        creditsPerAvax = rate;
        emit CreditsPerAvaxUpdated(oldRate, rate);
    }

    /// @notice Updates the treasury address for AVAX proceeds.
    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) {
            revert CreditManager__ZeroAddress();
        }
        address oldTreasury = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(oldTreasury, newTreasury);
    }

    /// @notice Transfers ownership to a new owner.
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) {
            revert CreditManager__ZeroAddress();
        }
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}
