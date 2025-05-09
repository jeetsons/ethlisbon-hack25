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

contract MockAavePool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external payable {}
    function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf) external {}
    function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) external returns (uint256) {
        return amount;
    }
    function withdraw(address asset, uint256 amount, address to) external returns (uint256) {
        return amount;
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

contract LeveragedLPManagerTest is Test {
    LeveragedLPManager public manager;
    FeeCollectHook public hook;
    MockAavePool public aavePool;
    MockPositionManager public positionManager;
    MockToken public usdc;
    MockToken public weth;
    
    address public safeWallet;
    
    function setUp() public {
        // Deploy mock contracts
        aavePool = new MockAavePool();
        positionManager = new MockPositionManager();
        usdc = new MockToken();
        weth = new MockToken();
        
        // Create a mock Safe wallet
        safeWallet = makeAddr("safeWallet");
        
        // Deploy the manager contract
        manager = new LeveragedLPManager(
            address(aavePool),
            address(positionManager),
            address(usdc),
            address(weth),
            address(0) // Will be set after hook deployment
        );
        
        // Deploy the hook contract
        hook = new FeeCollectHook(
            address(positionManager),
            address(manager),
            address(usdc),
            address(weth)
        );
        
        // For testing, we'll redeploy the manager with the hook address
        // This is simpler than trying to manipulate storage slots
        manager = new LeveragedLPManager(
            address(aavePool),
            address(positionManager),
            address(usdc),
            address(weth),
            address(hook)
        );
    }
    
    function testStartStrategy() public {
        // Test starting a strategy
        uint256 ethAmount = 1 ether;
        uint256 ltv = 50; // 50% LTV
        
        // Start the strategy
        manager.startStrategy(safeWallet, ethAmount, ltv);
        
        // Check that the position was created
        (
            address safe,
            uint256 lpTokenId,
            uint256 ethSupplied,
            uint256 usdcBorrowed,
            bool isActive
        ) = manager.userPositions(safeWallet);
        
        // Verify the position details
        assertEq(safe, safeWallet);
        assertEq(ethSupplied, ethAmount);
        assertEq(usdcBorrowed, ethAmount * ltv / 100);
        assertTrue(isActive);
    }
    
    function testProcessFees() public {
        // First start a strategy
        testStartStrategy();
        
        // Get the LP token ID
        (,uint256 lpTokenId,,,) = manager.userPositions(safeWallet);
        
        // Mock being the hook
        vm.startPrank(address(hook));
        
        // Process fees
        uint256 usdcAmount = 100;
        uint256 ethAmount = 50;
        manager.processFees(safeWallet, usdcAmount, ethAmount);
        
        vm.stopPrank();
        
        // In a real test, we would check that the USDC debt was repaid
        // and ETH collateral was added, but for this dummy test we just
        // verify that the function didn't revert
    }
    
    function testExitStrategy() public {
        // First start a strategy
        testStartStrategy();
        
        // Exit the strategy
        manager.exitStrategy(safeWallet);
        
        // Check that the position was deleted
        (,,,, bool isActive) = manager.userPositions(safeWallet);
        assertFalse(isActive);
    }
}
