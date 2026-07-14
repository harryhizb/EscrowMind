// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/JobBoard.sol";
import "../src/EscrowFactory.sol";
import "../src/EscrowVault.sol";
import "../src/CreditManager.sol";
import "../src/ReputationSBT.sol";

/// @title Deploy
/// @notice Foundry deploy script for EscrowMind on Avalanche Fuji testnet.
///         Resolves the circular dependency (JobBoard↔EscrowFactory, Factory→ReputationSBT)
///         using CREATE nonce prediction.
///
/// Usage:
///   forge script script/Deploy.s.sol --rpc-url $FUJI_RPC_URL \
///     --private-key $DEPLOYER_PRIVATE_KEY --broadcast --verify
///
/// Required env vars:
///   DEPLOYER_PRIVATE_KEY  — deployer EOA private key
///   FUJI_RPC_URL          — Avalanche Fuji RPC endpoint
///   RELAYER_ADDRESS       — backend relayer wallet address (read-only, markVerified only)
///   ARBITER_A/B/C         — three arbiter wallet addresses
///   SNOWTRACE_API_KEY     — for contract verification (optional)
contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        address relayer = vm.envAddress("RELAYER_ADDRESS");
        address arbiterA = vm.envAddress("ARBITER_A");
        address arbiterB = vm.envAddress("ARBITER_B");
        address arbiterC = vm.envAddress("ARBITER_C");

        vm.startBroadcast(deployerKey);

        uint256 nonce = vm.getNonce(deployer);

        // Pre-compute addresses in deploy order:
        // nonce+0: EscrowVault (implementation)
        // nonce+1: CreditManager
        // nonce+2: ReputationSBT
        // nonce+3: EscrowFactory
        // nonce+4: JobBoard
        address addrVaultImpl = _computeAddress(deployer, nonce);
        address addrCreditManager = _computeAddress(deployer, nonce + 1);
        address addrReputation = _computeAddress(deployer, nonce + 2);
        address addrFactory = _computeAddress(deployer, nonce + 3);
        address addrJobBoard = _computeAddress(deployer, nonce + 4);

        // ── 1. EscrowVault implementation ─────────────────────────────────────
        EscrowVault vaultImpl = new EscrowVault();
        require(address(vaultImpl) == addrVaultImpl, "Deploy: vaultImpl addr mismatch");

        // ── 2. CreditManager ──────────────────────────────────────────────────
        CreditManager creditManager = new CreditManager(500); // 500 rate
        require(address(creditManager) == addrCreditManager, "Deploy: creditManager addr mismatch");

        // ── 3. ReputationSBT ──────────────────────────────────────────────────
        ReputationSBT reputation = new ReputationSBT(addrFactory);
        require(address(reputation) == addrReputation, "Deploy: reputation addr mismatch");

        // ── 4. EscrowFactory ──────────────────────────────────────────────────
        address[3] memory arbiters = [arbiterA, arbiterB, arbiterC];
        EscrowFactory factory = new EscrowFactory(
            addrVaultImpl,
            addrJobBoard, // predicted JobBoard address
            relayer,
            addrReputation,
            addrCreditManager,
            arbiters
        );
        require(address(factory) == addrFactory, "Deploy: factory addr mismatch");

        // ── 5. JobBoard ───────────────────────────────────────────────────────
        JobBoard jobBoard = new JobBoard(addrFactory, addrReputation, addrCreditManager);
        require(address(jobBoard) == addrJobBoard, "Deploy: jobBoard addr mismatch");

        // Whitelist JobBoard and EscrowFactory in CreditManager
        creditManager.setAuthorizedSpender(addrJobBoard, true);
        creditManager.setAuthorizedSpender(addrFactory, true);

        vm.stopBroadcast();

        // ── Write deployment addresses to JSON config ─────────────────────────
        string memory json = string.concat(
            '{\n',
            '  "network": "fuji",\n',
            '  "chainId": 43113,\n',
            '  "contracts": {\n',
            '    "EscrowVaultImpl": "', _toHexString(address(vaultImpl)), '",\n',
            '    "CreditManager": "', _toHexString(address(creditManager)), '",\n',
            '    "ReputationSBT": "', _toHexString(address(reputation)), '",\n',
            '    "EscrowFactory": "', _toHexString(address(factory)), '",\n',
            '    "JobBoard": "', _toHexString(address(jobBoard)), '"\n',
            '  },\n',
            '  "relayer": "', _toHexString(relayer), '",\n',
            '  "arbiters": ["',
            _toHexString(arbiterA), '","',
            _toHexString(arbiterB), '","',
            _toHexString(arbiterC),
            '"]\n',
            '}'
        );

        vm.writeFile("deployments/fuji.json", json);

        console.log("=== EscrowMind Deployment Complete ===");
        console.log("EscrowVault Impl:", address(vaultImpl));
        console.log("CreditManager:   ", address(creditManager));
        console.log("ReputationSBT:   ", address(reputation));
        console.log("EscrowFactory:   ", address(factory));
        console.log("JobBoard:        ", address(jobBoard));
        console.log("Relayer:         ", relayer);
        console.log("Arbiters:        ", arbiterA, arbiterB, arbiterC);
        console.log("Config written to: deployments/fuji.json");
    }

    /// @dev Compute CREATE address for a deployer at a specific nonce.
    ///      This is equivalent to OZ's Create2.computeAddress for CREATE (non-CREATE2).
    function _computeAddress(address deployer, uint256 nonce) internal pure returns (address) {
        if (nonce == 0x00) {
            return address(
                uint160(uint256(keccak256(abi.encodePacked(bytes1(0xd6), bytes1(0x94), deployer, bytes1(0x80)))))
            );
        }
        if (nonce <= 0x7f) {
            return address(
                uint160(uint256(keccak256(abi.encodePacked(bytes1(0xd6), bytes1(0x94), deployer, uint8(nonce)))))
            );
        }
        if (nonce <= 0xff) {
            return address(
                uint160(uint256(keccak256(abi.encodePacked(bytes1(0xd7), bytes1(0x94), deployer, bytes1(0x81), uint8(nonce)))))
            );
        }
        if (nonce <= 0xffff) {
            return address(
                uint160(uint256(keccak256(abi.encodePacked(bytes1(0xd8), bytes1(0x94), deployer, bytes1(0x82), uint16(nonce)))))
            );
        }
        revert("Deploy: nonce too large for this helper");
    }

    function _toHexString(address addr) internal pure returns (string memory) {
        bytes memory buffer = new bytes(42);
        buffer[0] = '0';
        buffer[1] = 'x';
        for (uint256 i = 0; i < 20; i++) {
            uint8 b = uint8(uint160(addr) >> ((19 - i) * 8));
            buffer[2 + i * 2] = _hexChar(b >> 4);
            buffer[3 + i * 2] = _hexChar(b & 0x0f);
        }
        return string(buffer);
    }

    function _hexChar(uint8 v) internal pure returns (bytes1) {
        return v < 10 ? bytes1(v + 48) : bytes1(v + 87);
    }
}
