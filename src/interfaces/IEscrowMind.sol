// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IEscrowFactory
/// @notice Interface for the EscrowFactory used by JobBoard
interface IEscrowFactory {
    function createEscrow(
        address client,
        address freelancer,
        uint256[] calldata milestoneAmounts,
        bytes32[] calldata milestoneSpecHashes,
        uint40 deadline
    ) external returns (address vault);
}

/// @title IReputationSBT
/// @notice Minimal interface used by EscrowVault to record outcomes
interface IReputationSBT {
    function mintPassport(address to) external;
    function recordOutcome(
        address freelancer,
        address client,
        bool success,
        uint256 jobValue
    ) external;
}

/// @title ICreditManager
/// @notice Interface for the CreditManager used by JobBoard and EscrowVault
interface ICreditManager {
    function JOB_POST_COST() external view returns (uint256);
    function BID_COST() external view returns (uint256);
    function JOB_COMPLETION_REWARD() external view returns (uint256);
    function CLIENT_COMPLETION_REWARD() external view returns (uint256);
    function spendCredits(address user, uint256 amount, string calldata reason) external;
    function rewardCredits(address user, uint256 amount, string calldata reason) external;
    function setAuthorizedSpender(address contractAddr, bool allowed) external;
    function authorizeVault(address vault) external;
}
