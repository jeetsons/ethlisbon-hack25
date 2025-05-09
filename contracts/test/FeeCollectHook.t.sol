// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {LeveragedLPManager} from "../src/LeveragedLPManager.sol";
import {FeeCollectHook} from "../src/FeeCollectHook.sol";

contract MockToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) public {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) public returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public returns (bool) {
        require(allowance[from][msg.sender] >= amount, "Insufficient allowance");
        require(balanceOf[from] >= amount, "Insufficient balance");
        
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        allowance[from][msg.sender] -= amount;
        
        return true;
    }
}

contract MockPositionManager {
    uint256 public nextTokenId = 1;
    
    function mint() external returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1) {
        tokenId = nextTokenId++;
        liquidity = 1000;
        amount0 = 100;
        amount1 = 100;
        return (tokenId, liquidity, amount0, amount1);
    }
    
    function safeTransferFrom(address from, address to, uint256 tokenId) external {}
    
    function collect(
        uint256 tokenId,
        address recipient,
        uint128 amount0Max,
        uint128 amount1Max
    ) external returns (uint256 amount0, uint256 amount1) {
        amount0 = 10; // Mock USDC fees
        amount1 = 5;  // Mock ETH fees
        return (amount0, amount1);
    }
}

// Mock LeveragedLPManager for testing the hook
contract MockLeveragedLPManager {
    mapping(uint256 => address) public lpTokenToSafe;
    bool public feesProcessed;
    address public lastSafe;
    uint256 public lastUsdcAmount;
    uint256 public lastEthAmount;
    
    function setLpTokenToSafe(uint256 lpTokenId, address safe) external {
        lpTokenToSafe[lpTokenId] = safe;
    }
    
    function processFees(address safe, uint256 usdcAmount, uint256 ethAmount) external {
        feesProcessed = true;
        lastSafe = safe;
        lastUsdcAmount = usdcAmount;
        lastEthAmount = ethAmount;
    }
}

contract FeeCollectHookTest is Test {
    FeeCollectHook public hook;
    MockLeveragedLPManager public manager;
    MockPositionManager public positionManager;
    MockToken public usdc;
    MockToken public weth;
    
    address public safeWallet;
    uint256 public lpTokenId;
    
    function setUp() public {
        // Deploy mock contracts
        positionManager = new MockPositionManager();
        usdc = new MockToken();
        weth = new MockToken();
        manager = new MockLeveragedLPManager();
        
        // Create a mock Safe wallet
        safeWallet = makeAddr("safeWallet");
        
        // Deploy the hook contract
        hook = new FeeCollectHook(
            address(positionManager),
            address(manager),
            address(usdc),
            address(weth)
        );
        
        // Set up a mock LP token
        lpTokenId = 123;
        manager.setLpTokenToSafe(lpTokenId, safeWallet);
        
        // Mint some tokens to the hook for testing
        usdc.mint(address(hook), 100);
        weth.mint(address(hook), 50);
    }
    
    function testAfterSwap() public {
        // Test the first 9 swaps (should not collect fees)
        for (uint256 i = 1; i < 10; i++) {
            hook.afterSwap(lpTokenId);
            assertEq(hook.tradeCounts(lpTokenId), i);
        }
        
        // The 10th swap should collect fees and call processFees
        hook.afterSwap(lpTokenId);
        
        // Verify that processFees was called with the correct parameters
        assertEq(hook.tradeCounts(lpTokenId), 10);
        assertTrue(manager.feesProcessed());
        assertEq(manager.lastSafe(), safeWallet);
        assertEq(manager.lastUsdcAmount(), 10);
        assertEq(manager.lastEthAmount(), 5);
    }
    
    function testMultipleLpTokens() public {
        // Test with multiple LP tokens
        uint256 lpTokenId2 = 456;
        manager.setLpTokenToSafe(lpTokenId2, safeWallet);
        
        // Increment trade counts for both tokens
        for (uint256 i = 0; i < 5; i++) {
            hook.afterSwap(lpTokenId);
            hook.afterSwap(lpTokenId2);
        }
        
        // Both should have 5 trades
        assertEq(hook.tradeCounts(lpTokenId), 5);
        assertEq(hook.tradeCounts(lpTokenId2), 5);
        
        // Add 5 more trades to lpTokenId (should trigger fee collection)
        for (uint256 i = 0; i < 5; i++) {
            hook.afterSwap(lpTokenId);
        }
        
        // lpTokenId should have 10 trades, lpTokenId2 should still have 5
        assertEq(hook.tradeCounts(lpTokenId), 10);
        assertEq(hook.tradeCounts(lpTokenId2), 5);
    }
}
