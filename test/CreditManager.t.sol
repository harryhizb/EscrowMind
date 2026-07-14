// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/CreditManager.sol";

contract CreditManagerTest is Test {
    CreditManager public manager;

    address public owner = address(1);
    address public user1 = address(2);
    address public user2 = address(3);
    address public spender = address(4);
    address public treasury = address(5);

    function setUp() public {
        vm.prank(owner);
        manager = new CreditManager(500); // 500 credits per 1 AVAX
    }

    // ─────────────────────────────────────────────────────────
    // Starter Credits Tests
    // ─────────────────────────────────────────────────────────

    function test_StarterCredits_ClaimOnce() public {
        vm.prank(user1);
        vm.expectEmit(true, false, false, true);
        emit CreditManager.StarterCreditsClaimed(user1, 10);
        manager.claimStarterCredits();

        assertEq(manager.balanceOf(user1), 10);
        assertTrue(manager.hasClaimedStarter(user1));
    }

    function test_StarterCredits_DoubleClaimReverts() public {
        vm.startPrank(user1);
        manager.claimStarterCredits();

        vm.expectRevert(CreditManager.CreditManager__StarterAlreadyClaimed.selector);
        manager.claimStarterCredits();
        vm.stopPrank();
    }

    // ─────────────────────────────────────────────────────────
    // Spend Credits Tests
    // ─────────────────────────────────────────────────────────

    function test_SpendCredits_AuthorizedSpenderOnly() public {
        // Whitelist spender
        vm.prank(owner);
        manager.setAuthorizedSpender(spender, true);

        // Claim starter credits
        vm.prank(user1);
        manager.claimStarterCredits();

        // Spender spends credits
        vm.prank(spender);
        vm.expectEmit(true, false, false, true);
        emit CreditManager.CreditsSpent(user1, 2, "job_post");
        manager.spendCredits(user1, 2, "job_post");

        assertEq(manager.balanceOf(user1), 8);
    }

    function test_SpendCredits_UnauthorizedReverts() public {
        vm.prank(user1);
        manager.claimStarterCredits();

        // user2 (unauthorized spender) tries to call spendCredits
        vm.prank(user2);
        vm.expectRevert(CreditManager.CreditManager__NotAuthorizedSpender.selector);
        manager.spendCredits(user1, 2, "job_post");
    }

    function test_SpendCredits_InsufficientBalanceRevert() public {
        vm.prank(owner);
        manager.setAuthorizedSpender(spender, true);

        vm.prank(user1);
        manager.claimStarterCredits(); // balance = 10

        // Spend 12 (exceeding balance)
        vm.prank(spender);
        vm.expectRevert(
            abi.encodeWithSelector(
                CreditManager.CreditManager__InsufficientCredits.selector,
                10,
                12
            )
        );
        manager.spendCredits(user1, 12, "job_post");
    }

    // ─────────────────────────────────────────────────────────
    // Hourly Task Tests
    // ─────────────────────────────────────────────────────────

    function test_ClaimHourlyTask_Cooldown() public {
        // Initial claim
        vm.prank(user1);
        vm.expectEmit(true, false, false, true);
        emit CreditManager.HourlyTaskClaimed(user1);
        manager.claimHourlyTask();

        assertEq(manager.balanceOf(user1), 1);
        assertEq(manager.lastHourlyClaim(user1), block.timestamp);
        assertEq(manager.lastDailyClaim(user1), block.timestamp);

        // Try claiming immediately - reverts
        vm.prank(user1);
        vm.expectRevert(
            abi.encodeWithSelector(
                CreditManager.CreditManager__HourlyCooldownActive.selector,
                block.timestamp + 1 hours
            )
        );
        manager.claimHourlyTask();

        // Warp time by 59 minutes 59 seconds - still reverts
        vm.warp(block.timestamp + 1 hours - 1);
        vm.prank(user1);
        vm.expectRevert();
        manager.claimHourlyTask();

        // Warp time by 1 hour - succeeds
        vm.warp(block.timestamp + 1);
        vm.prank(user1);
        manager.claimHourlyTask();
        assertEq(manager.balanceOf(user1), 2);
    }

    function test_ClaimDailyTask_AliasUsesHourlyCooldown() public {
        vm.prank(user1);
        manager.claimDailyTask();

        vm.warp(block.timestamp + 1 hours);
        vm.prank(user1);
        manager.claimDailyTask();

        assertEq(manager.balanceOf(user1), 2);
    }

    function test_PurchaseCredits_ForwardsFujiAvaxToTreasury() public {
        vm.deal(user1, 1 ether);
        vm.prank(owner);
        manager.setTreasury(treasury);

        uint256 treasuryBefore = treasury.balance;

        vm.prank(user1);
        vm.expectEmit(true, false, false, true);
        emit CreditManager.CreditsPurchased(user1, 0.1 ether, 50);
        manager.purchaseCredits{value: 0.1 ether}();

        assertEq(manager.balanceOf(user1), 50);
        assertEq(treasury.balance, treasuryBefore + 0.1 ether);
    }

    function test_PurchaseCredits_ZeroValueReverts() public {
        vm.prank(user1);
        vm.expectRevert(CreditManager.CreditManager__ZeroValue.selector);
        manager.purchaseCredits{value: 0}();
    }

    // ─────────────────────────────────────────────────────────
    // Reward Credits Tests
    // ─────────────────────────────────────────────────────────

    function test_RewardCredits_AuthorizedSpenderOnly() public {
        vm.prank(owner);
        manager.setAuthorizedSpender(spender, true);

        // Spender rewards user1
        vm.prank(spender);
        vm.expectEmit(true, false, false, true);
        emit CreditManager.CreditsEarned(user1, 3, "job_completed");
        manager.rewardCredits(user1, 3, "job_completed");

        assertEq(manager.balanceOf(user1), 3);
    }

    function test_RewardCredits_UnauthorizedReverts() public {
        vm.prank(user1);
        vm.expectRevert(CreditManager.CreditManager__NotAuthorizedSpender.selector);
        manager.rewardCredits(user2, 3, "job_completed");
    }

    // ─────────────────────────────────────────────────────────
    // Access Control Admin Tests
    // ─────────────────────────────────────────────────────────

    function test_Admin_NotOwnerReverts() public {
        vm.startPrank(user1);

        vm.expectRevert(CreditManager.CreditManager__NotOwner.selector);
        manager.setAuthorizedSpender(spender, true);

        vm.expectRevert(CreditManager.CreditManager__NotOwner.selector);
        manager.setCreditsPerAvax(600);

        vm.expectRevert(CreditManager.CreditManager__NotOwner.selector);
        manager.setTreasury(user2);

        vm.expectRevert(CreditManager.CreditManager__NotOwner.selector);
        manager.transferOwnership(user2);

        vm.stopPrank();
    }

    function test_Admin_OwnerSetters() public {
        vm.startPrank(owner);

        // Spender authorization
        manager.setAuthorizedSpender(spender, true);
        assertTrue(manager.authorizedSpenders(spender));

        // Set credits per AVAX
        manager.setCreditsPerAvax(600);
        assertEq(manager.creditsPerAvax(), 600);

        // Set treasury
        manager.setTreasury(treasury);
        assertEq(manager.treasury(), treasury);

        // Transfer ownership
        manager.transferOwnership(user2);
        assertEq(manager.owner(), user2);

        vm.stopPrank();
    }

    function test_Admin_AuthorizedSpenderCannotGrantAuth() public {
        // Set up: owner authorizes spender
        vm.prank(owner);
        manager.setAuthorizedSpender(spender, true);
        assertTrue(manager.authorizedSpenders(spender), "Spender should be authorized");

        // Attempt: authorized spender tries to authorize another address
        // This is the bug that was fixed - spender should NOT be able to do this
        vm.prank(spender);
        vm.expectRevert(CreditManager.CreditManager__NotOwner.selector);
        manager.setAuthorizedSpender(user1, true);

        // Verify user1 is still NOT authorized
        assertFalse(manager.authorizedSpenders(user1), "User1 should not be authorized by spender");

        // Verify ONLY owner can authorize
        vm.prank(owner);
        manager.setAuthorizedSpender(user1, true);
        assertTrue(manager.authorizedSpenders(user1), "User1 should be authorized by owner");
    }
}
