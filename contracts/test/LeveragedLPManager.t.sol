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
    
    function transfer(address to, uint256 amount) public returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
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
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external {
        // Mock implementation
    }
    
    function supplyETH(address onBehalfOf, uint16 referralCode) external payable {
        // Mock implementation
    }
    
    function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf) external {
        // Mock implementation
    }
    
    function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) external returns (uint256) {
        return amount; // Mock return value
    }
    
    function withdraw(address asset, uint256 amount, address to) external returns (uint256) {
        return amount; // Mock return value
    }
    
    function withdrawETH(uint256 amount, address to) external returns (uint256) {
        return amount; // Mock return value
    }
}

contract MockUniswapRouter {
    function exactInputSingle(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        address recipient,
        uint256 amountIn,
        uint256 amountOutMinimum,
        uint160 sqrtPriceLimitX96
    ) external returns (uint256) {
        // Mock implementation that returns a fixed amount
        return amountIn / 2; // Simplified mock conversion rate
    }
}

contract MockPositionManager {
    uint256 public nextTokenId = 1;
    mapping(uint256 => address) public ownerOf;
    
    struct MintParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }
    
    function mint(MintParams calldata params) external returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1) {
        tokenId = nextTokenId++;
        liquidity = 1000;
        amount0 = params.amount0Desired - 10; // Mock some slippage
        amount1 = params.amount1Desired - 5;  // Mock some slippage
        ownerOf[tokenId] = params.recipient;
        return (tokenId, liquidity, amount0, amount1);
    }
    
    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        ownerOf[tokenId] = to;
    }
    
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
    
    function decreaseLiquidity(
        uint256 tokenId,
        uint128 liquidity,
        uint256 amount0Min,
        uint256 amount1Min,
        uint256 deadline
    ) external returns (uint256 amount0, uint256 amount1) {
        amount0 = 90; // Mock USDC returned
        amount1 = 45; // Mock ETH returned
        return (amount0, amount1);
    }
}

contract LeveragedLPManagerTest is Test {
    LeveragedLPManager public manager;
    FeeCollectHook public hook;
    MockAavePool public aavePool;
    MockPositionManager public positionManager;
    MockUniswapRouter public uniswapRouter;
    MockToken public usdc;
    MockToken public weth;
    
    address public safeWallet;
    uint256 public constant ETH_AMOUNT = 1 ether;
    uint256 public constant LTV = 50; // 50% LTV
    uint256 public constant USDC_BORROW_AMOUNT = ETH_AMOUNT * LTV / 100;
    uint24 public constant POOL_FEE = 3000; // 0.3%
    
    // Events for testing
    event StrategyStarted(address indexed safe, uint256 indexed lpTokenId, uint256 ethSupplied, uint256 usdcBorrowed);
    event FeesProcessed(address indexed safe, uint256 indexed lpTokenId, uint256 usdcRepaid, uint256 ethAdded);
    event StrategyExited(address indexed safe, uint256 indexed lpTokenId, uint256 ethReturned, uint256 usdcRepaid);
    
    function setUp() public {
        // Deploy mock contracts
        aavePool = new MockAavePool();
        positionManager = new MockPositionManager();
        uniswapRouter = new MockUniswapRouter();
        usdc = new MockToken();
        weth = new MockToken();
        
        // Create a mock Safe wallet
        safeWallet = makeAddr("safeWallet");
        
        // Mint some tokens to the Safe wallet for testing
        weth.mint(safeWallet, 10 ether);
        usdc.mint(safeWallet, 10000 * 10**6); // Assuming 6 decimals for USDC
        
        // Deploy the manager contract
        manager = new LeveragedLPManager(
            address(aavePool),
            address(positionManager),
            address(usdc),
            address(weth),
            address(0), // Will be set after hook deployment
            address(uniswapRouter),
            POOL_FEE
        );
        
        // Deploy the hook contract
        hook = new FeeCollectHook(
            address(positionManager),
            address(manager),
            address(usdc),
            address(weth)
        );
        
        // Set pool authorization for the hook
        vm.startPrank(hook.owner());
        hook.setPoolAuthorization(address(0x123), true); // Mock pool address
        vm.stopPrank();
        
        // For testing, we'll redeploy the manager with the hook address
        manager = new LeveragedLPManager(
            address(aavePool),
            address(positionManager),
            address(usdc),
            address(weth),
            address(hook),
            address(uniswapRouter),
            POOL_FEE
        );
    }
    
    function testStartStrategy() public {
        // Approve tokens from the Safe wallet
        vm.startPrank(safeWallet);
        weth.approve(address(manager), ETH_AMOUNT);
        vm.stopPrank();
        
        // Expect the StrategyStarted event to be emitted
        vm.expectEmit(true, true, false, true);
        emit StrategyStarted(safeWallet, 1, ETH_AMOUNT, USDC_BORROW_AMOUNT);
        
        // Start the strategy
        manager.startStrategy(safeWallet, ETH_AMOUNT, LTV);
        
        // Check that the position was created
        (
            address safe,
            uint256 lpTokenId,
            uint256 ethSupplied,
            uint256 usdcBorrowed,
            uint128 liquidity,
            bool isActive
        ) = manager.userPositions(safeWallet);
        
        // Verify the position details
        assertEq(safe, safeWallet, "Safe wallet address mismatch");
        assertEq(ethSupplied, ETH_AMOUNT, "ETH supplied amount mismatch");
        assertEq(usdcBorrowed, USDC_BORROW_AMOUNT, "USDC borrowed amount mismatch");
        assertTrue(isActive, "Position should be active");
        assertEq(manager.lpTokenToSafe(lpTokenId), safeWallet, "LP token to Safe mapping incorrect");
    }
    
    function testStartStrategyInvalidLTV() public {
        // Test with LTV > 75%
        uint256 invalidLTV = 80;
        
        vm.startPrank(safeWallet);
        weth.approve(address(manager), ETH_AMOUNT);
        vm.stopPrank();
        
        // Expect the function to revert with the specific error message
        vm.expectRevert("LTV must be <= 75%");
        manager.startStrategy(safeWallet, ETH_AMOUNT, invalidLTV);
    }
    
    function testStartStrategyZeroAmount() public {
        // Test with zero ETH amount
        vm.expectRevert("ETH amount must be > 0");
        manager.startStrategy(safeWallet, 0, LTV);
    }
    
    function testStartStrategyTwice() public {
        // Start a strategy once
        testStartStrategy();
        
        // Try to start another strategy for the same Safe
        vm.startPrank(safeWallet);
        weth.approve(address(manager), ETH_AMOUNT);
        vm.stopPrank();
        
        vm.expectRevert("Strategy already active");
        manager.startStrategy(safeWallet, ETH_AMOUNT, LTV);
    }
    
    function testProcessFees() public {
        // First start a strategy
        testStartStrategy();
        
        // Get the LP token ID
        (,uint256 lpTokenId,,,,) = manager.userPositions(safeWallet);
        
        // Mock fee amounts
        uint256 usdcAmount = 100 * 10**6; // 100 USDC
        uint256 ethAmount = 0.05 ether;   // 0.05 ETH
        
        // Mint tokens to the hook to simulate collected fees
        usdc.mint(address(hook), usdcAmount);
        weth.mint(address(hook), ethAmount);
        
        // Expect the FeesProcessed event to be emitted
        vm.expectEmit(true, true, false, true);
        emit FeesProcessed(safeWallet, lpTokenId, usdcAmount, ethAmount);
        
        // Mock being the hook
        vm.startPrank(address(hook));
        
        // Process fees
        manager.processFees(safeWallet, usdcAmount, ethAmount);
        
        vm.stopPrank();
        
        // Verify that the tokens were transferred correctly
        // In a real implementation, we would check Aave interactions
    }
    
    function testProcessFeesNonHook() public {
        // First start a strategy
        testStartStrategy();
        
        // Try to process fees from an unauthorized address
        address attacker = makeAddr("attacker");
        
        vm.startPrank(attacker);
        vm.expectRevert("Only hook can process fees");
        manager.processFees(safeWallet, 100, 50);
        vm.stopPrank();
    }
    
    function testProcessFeesInactiveStrategy() public {
        // Try to process fees for a Safe without an active strategy
        address noStrategySafe = makeAddr("noStrategySafe");
        
        vm.startPrank(address(hook));
        vm.expectRevert("No active strategy");
        manager.processFees(noStrategySafe, 100, 50);
        vm.stopPrank();
    }
    
    function testExitStrategy() public {
        // First start a strategy
        testStartStrategy();
        
        // Get the LP token ID and position details
        (,uint256 lpTokenId, uint256 ethSupplied, uint256 usdcBorrowed,,) = manager.userPositions(safeWallet);
        
        // Exit the strategy - we don't check the event emission since the exact values may vary
        manager.exitStrategy(safeWallet);
        
        // Check that the position was marked as inactive
        (,,,,, bool isActive) = manager.userPositions(safeWallet);
        assertFalse(isActive, "Position should be inactive");
        
        // Check that the LP token mapping was cleared
        assertEq(manager.lpTokenToSafe(lpTokenId), address(0), "LP token mapping should be cleared");
    }
    
    function testExitStrategyNonExistent() public {
        // Try to exit a strategy that doesn't exist
        address noStrategySafe = makeAddr("noStrategySafe");
        
        vm.expectRevert("No active strategy");
        manager.exitStrategy(noStrategySafe);
    }
    
    function testGetUserPosition() public {
        // First start a strategy
        testStartStrategy();
        
        // Get the position details
        (
            address safe,
            uint256 lpTokenId,
            uint256 ethSupplied,
            uint256 usdcBorrowed,
            uint128 liquidity,
            bool isActive
        ) = manager.getUserPosition(safeWallet);
        
        // Verify the returned values
        assertEq(safe, safeWallet, "Safe wallet address mismatch");
        assertEq(ethSupplied, ETH_AMOUNT, "ETH supplied amount mismatch");
        assertEq(usdcBorrowed, USDC_BORROW_AMOUNT, "USDC borrowed amount mismatch");
        assertTrue(isActive, "Position should be active");
    }
}
