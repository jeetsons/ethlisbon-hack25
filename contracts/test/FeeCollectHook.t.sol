// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console} from "forge-std/Test.sol";
import {LeveragedLPManager} from "../src/LeveragedLPManager.sol";
import {FeeCollectHook} from "../src/FeeCollectHook.sol";
import {IPoolManager, BalanceDelta} from "../src/FeeCollectHook.sol";

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

contract MockPositionManager {
    uint256 public nextTokenId = 1;
    mapping(uint256 => address) private _owners;
    
    function ownerOf(uint256 tokenId) external view returns (address) {
        return _owners[tokenId];
    }
    
    function setOwner(uint256 tokenId, address owner) external {
        _owners[tokenId] = owner;
    }
    
    function mint() external returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1) {
        tokenId = nextTokenId++;
        liquidity = 1000;
        amount0 = 100;
        amount1 = 100;
        _owners[tokenId] = msg.sender;
        return (tokenId, liquidity, amount0, amount1);
    }
    
    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        require(_owners[tokenId] == from, "Not owner");
        _owners[tokenId] = to;
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

// Mock Pool for Uniswap V4
contract MockPool {
    address public immutable hookAddress;
    
    constructor(address _hookAddress) {
        hookAddress = _hookAddress;
    }
}

contract FeeCollectHookTest is Test {
    FeeCollectHook public hook;
    MockLeveragedLPManager public manager;
    MockPositionManager public positionManager;
    MockToken public usdc;
    MockToken public weth;
    MockPool public pool;
    
    address public safeWallet;
    uint256 public lpTokenId;
    address public owner;
    
    // Events for testing
    event FeesCollected(uint256 indexed lpTokenId, uint256 usdcAmount, uint256 ethAmount, uint256 tradeCount);
    event PoolAuthorized(address indexed pool, bool authorized);
    
    function setUp() public {
        // Deploy mock contracts
        positionManager = new MockPositionManager();
        usdc = new MockToken();
        weth = new MockToken();
        manager = new MockLeveragedLPManager();
        
        // Create a mock Safe wallet
        safeWallet = makeAddr("safeWallet");
        owner = makeAddr("owner");
        
        // Deploy the hook contract
        vm.startPrank(owner);
        hook = new FeeCollectHook(
            address(positionManager),
            address(manager),
            address(usdc),
            address(weth)
        );
        vm.stopPrank();
        
        // Create a mock pool and authorize it
        pool = new MockPool(address(hook));
        
        vm.startPrank(owner);
        hook.setPoolAuthorization(address(pool), true);
        vm.stopPrank();
        
        // Set up a mock LP token
        lpTokenId = 123;
        manager.setLpTokenToSafe(lpTokenId, safeWallet);
        positionManager.setOwner(lpTokenId, safeWallet);
        
        // Mint some tokens to the hook for testing
        usdc.mint(address(hook), 100 * 10**6); // 100 USDC
        weth.mint(address(hook), 0.05 ether);  // 0.05 ETH
    }
    
    function testAfterSwap() public {
        // Create hook data with LP token ID
        bytes memory hookData = abi.encode(lpTokenId);
        
        // Create swap params
        IPoolManager.SwapParams memory swapParams = IPoolManager.SwapParams({
            zeroForOne: true,
            amountSpecified: 1000,
            sqrtPriceLimitX96: 0
        });
        
        // Create balance delta
        BalanceDelta memory delta = BalanceDelta({
            amount0: 100,
            amount1: 50
        });
        
        // Test the first 9 swaps (should not collect fees)
        for (uint256 i = 1; i < 10; i++) {
            hook.afterSwap(address(pool), hookData, swapParams, delta);
            assertEq(hook.tradeCounts(lpTokenId), i);
        }
        
        // The 10th swap should collect fees and call processFees
        vm.expectEmit(true, false, false, false);
        emit FeesCollected(lpTokenId, 10, 5, 10);
        
        hook.afterSwap(address(pool), hookData, swapParams, delta);
        
        // Verify that processFees was called with the correct parameters
        assertEq(hook.tradeCounts(lpTokenId), 10);
        assertTrue(manager.feesProcessed());
        assertEq(manager.lastSafe(), safeWallet);
        assertEq(manager.lastUsdcAmount(), 10);
        assertEq(manager.lastEthAmount(), 5);
    }
    
    function testAfterSwapUnauthorizedPool() public {
        // Create hook data with LP token ID
        bytes memory hookData = abi.encode(lpTokenId);
        
        // Create swap params
        IPoolManager.SwapParams memory swapParams = IPoolManager.SwapParams({
            zeroForOne: true,
            amountSpecified: 1000,
            sqrtPriceLimitX96: 0
        });
        
        // Create balance delta
        BalanceDelta memory delta = BalanceDelta({
            amount0: 100,
            amount1: 50
        });
        
        // Create an unauthorized pool
        address unauthorizedPool = makeAddr("unauthorizedPool");
        
        // Expect revert when calling with unauthorized pool
        vm.expectRevert("Unauthorized pool");
        hook.afterSwap(unauthorizedPool, hookData, swapParams, delta);
    }
    
    function testMultipleLpTokens() public {
        // Test with multiple LP tokens
        uint256 lpTokenId2 = 456;
        manager.setLpTokenToSafe(lpTokenId2, safeWallet);
        positionManager.setOwner(lpTokenId2, safeWallet);
        
        // Create hook data and params for both tokens
        bytes memory hookData1 = abi.encode(lpTokenId);
        bytes memory hookData2 = abi.encode(lpTokenId2);
        
        IPoolManager.SwapParams memory swapParams = IPoolManager.SwapParams({
            zeroForOne: true,
            amountSpecified: 1000,
            sqrtPriceLimitX96: 0
        });
        
        BalanceDelta memory delta = BalanceDelta({
            amount0: 100,
            amount1: 50
        });
        
        // Increment trade counts for both tokens
        for (uint256 i = 0; i < 5; i++) {
            hook.afterSwap(address(pool), hookData1, swapParams, delta);
            hook.afterSwap(address(pool), hookData2, swapParams, delta);
        }
        
        // Both should have 5 trades
        assertEq(hook.tradeCounts(lpTokenId), 5);
        assertEq(hook.tradeCounts(lpTokenId2), 5);
        
        // Add 5 more trades to lpTokenId (should trigger fee collection)
        for (uint256 i = 0; i < 5; i++) {
            hook.afterSwap(address(pool), hookData1, swapParams, delta);
        }
        
        // lpTokenId should have 10 trades, lpTokenId2 should still have 5
        assertEq(hook.tradeCounts(lpTokenId), 10);
        assertEq(hook.tradeCounts(lpTokenId2), 5);
        
        // Verify that processFees was called for lpTokenId
        assertTrue(manager.feesProcessed());
        assertEq(manager.lastSafe(), safeWallet);
    }
    
    function testPoolAuthorization() public {
        address newPool = makeAddr("newPool");
        
        // Only owner should be able to authorize pools
        vm.startPrank(owner);
        vm.expectEmit(true, false, false, true);
        emit PoolAuthorized(newPool, true);
        hook.setPoolAuthorization(newPool, true);
        vm.stopPrank();
        
        // Verify the pool is authorized
        assertTrue(hook.authorizedPools(newPool));
        
        // Non-owner should not be able to authorize pools
        address nonOwner = makeAddr("nonOwner");
        vm.startPrank(nonOwner);
        vm.expectRevert("Only owner can authorize pools");
        hook.setPoolAuthorization(newPool, false);
        vm.stopPrank();
    }
    
    function testTransferOwnership() public {
        address newOwner = makeAddr("newOwner");
        
        // Only current owner should be able to transfer ownership
        vm.startPrank(owner);
        hook.transferOwnership(newOwner);
        vm.stopPrank();
        
        // Verify ownership was transferred
        assertEq(hook.owner(), newOwner);
        
        // Old owner should no longer be able to call owner functions
        vm.startPrank(owner);
        vm.expectRevert("Only owner can authorize pools");
        hook.setPoolAuthorization(address(0x1), true);
        vm.stopPrank();
        
        // New owner should be able to call owner functions
        vm.startPrank(newOwner);
        hook.setPoolAuthorization(address(0x1), true);
        vm.stopPrank();
    }
    
    function testOtherHookFunctions() public {
        // Test that other hook functions return their selectors
        bytes memory emptyData = "";
        
        bytes4 beforeInitializeSelector = hook.beforeInitialize(address(0), emptyData);
        assertEq(beforeInitializeSelector, hook.beforeInitialize.selector);
        
        bytes4 afterInitializeSelector = hook.afterInitialize(address(0), emptyData);
        assertEq(afterInitializeSelector, hook.afterInitialize.selector);
        
        IPoolManager.ModifyPositionParams memory modifyParams = IPoolManager.ModifyPositionParams({
            tickLower: 0,
            tickUpper: 0,
            liquidityDelta: 0
        });
        
        bytes4 beforeModifyPositionSelector = hook.beforeModifyPosition(address(0), emptyData, modifyParams);
        assertEq(beforeModifyPositionSelector, hook.beforeModifyPosition.selector);
        
        BalanceDelta memory delta = BalanceDelta({
            amount0: 0,
            amount1: 0
        });
        
        bytes4 afterModifyPositionSelector = hook.afterModifyPosition(address(0), emptyData, modifyParams, delta);
        assertEq(afterModifyPositionSelector, hook.afterModifyPosition.selector);
        
        IPoolManager.SwapParams memory swapParams = IPoolManager.SwapParams({
            zeroForOne: false,
            amountSpecified: 0,
            sqrtPriceLimitX96: 0
        });
        
        bytes4 beforeSwapSelector = hook.beforeSwap(address(0), emptyData, swapParams);
        assertEq(beforeSwapSelector, hook.beforeSwap.selector);
        
        bytes4 beforeDonateSelector = hook.beforeDonate(address(0), emptyData, 0, 0);
        assertEq(beforeDonateSelector, hook.beforeDonate.selector);
        
        bytes4 afterDonateSelector = hook.afterDonate(address(0), emptyData, 0, 0);
        assertEq(afterDonateSelector, hook.afterDonate.selector);
    }
}
