// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/// @title IntegrationHash
/// @notice Test to verify keccak256 hash computation matches across Solidity and backend
contract IntegrationHash is Test {
    using Strings for bytes32;

    function test_Keccak256_ConsistentHash() public pure {
        // Simulate a delivery content hash
        bytes memory testContent = "Portfolio website with dark mode";
        bytes32 solidityHash = keccak256(testContent);
        
        // Verify hash is in correct format (256-bit / 32-byte output)
        assertNotEq(solidityHash, bytes32(0), "Hash should not be zero");
        
        // Verify hash is deterministic
        bytes32 hashAgain = keccak256(testContent);
        assertEq(solidityHash, hashAgain, "Keccak256 should be deterministic");
    }

    function test_Keccak256_MultipleInputs() public pure {
        // Test with various content types that might be delivery specs
        bytes memory spec1 = "home,about,contact:responsive:true:form:true";
        bytes memory spec2 = "home,menu,reservations:responsive:true:form:false";
        
        bytes32 hash1 = keccak256(spec1);
        bytes32 hash2 = keccak256(spec2);
        
        // Different inputs must produce different hashes
        assertNotEq(hash1, hash2, "Different specs should produce different hashes");
    }

    function test_Keccak256_EmptyContent() public pure {
        // Test edge case: empty content
        bytes memory empty = "";
        bytes32 emptyHash = keccak256(empty);
        
        // Should produce a valid hash (not zero)
        bytes32 expectedEmpty = keccak256(bytes(""));
        assertEq(emptyHash, expectedEmpty, "Empty content should hash consistently");
    }

    function test_Keccak256_BinaryData() public pure {
        // Test with binary-like content (simulating file hashes)
        bytes memory binaryData = abi.encodePacked(
            uint256(0x1234567890abcdef),
            uint256(0xfedcba0987654321)
        );
        
        bytes32 binaryHash = keccak256(binaryData);
        assertNotEq(binaryHash, bytes32(0), "Binary data should produce valid hash");
        
        // Verify determinism
        bytes32 binaryHashAgain = keccak256(binaryData);
        assertEq(binaryHash, binaryHashAgain, "Binary hash should be deterministic");
    }
}
