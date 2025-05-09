// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../lib/openzeppelin-contracts/contracts/token/ERC721/IERC721Receiver.sol";
import "../lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import "../lib/openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import "../lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import "../lib/openzeppelin-contracts/contracts/access/Ownable.sol";

// Interfaces for Aave V3
interface IAavePool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
    function supplyETH(address onBehalfOf, uint16 referralCode) external payable;
    function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf) external;
    function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) external returns (uint256);
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
    function withdrawETH(uint256 amount, address to) external returns (uint256);
    
    // New functions for querying user data directly
    function getUserDebt(address user, address asset, uint256 interestRateMode) external view returns (uint256);
    function getUserCollateral(address user, address asset) external view returns (uint256);
}

// Interface for WETH
interface IWETH {
    function deposit() external payable;
    function withdraw(uint256 amount) external;
}

// Interface for Uniswap V4 Router
interface IUniswapV4Router {
    function exactInputSingle(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        address recipient,
        uint256 amountIn,
        uint256 amountOutMinimum,
        uint160 sqrtPriceLimitX96
    ) external returns (uint256 amountOut);
}

// Interfaces for Uniswap V4 Position Manager
interface IUniswapV4PositionManager {
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
    
    function mint(MintParams calldata params) external returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
    function collect(uint256 tokenId, address recipient, uint128 amount0Max, uint128 amount1Max) external returns (uint256 amount0, uint256 amount1);
    function decreaseLiquidity(
        uint256 tokenId,
        uint128 liquidity,
        uint256 amount0Min,
        uint256 amount1Min,
        uint256 deadline
    ) external returns (uint256 amount0, uint256 amount1);
    
    // Function to query position details
    function positions(uint256 tokenId) external view returns (
        address token0,
        address token1,
        uint24 fee,
        int24 tickLower,
        int24 tickUpper,
        int24 tickCurrent,
        uint128 feeGrowthInside0LastX128,
        uint128 feeGrowthInside1LastX128,
        uint128 liquidity,
        uint256 feeGrowthOutside0X128,
        uint256 feeGrowthOutside1X128,
        uint256 tokensOwed0,
        uint256 tokensOwed1
    );
}

/**
 * @title LeveragedLPManager
 * @dev Main contract for managing leveraged LP positions using Aave V3 and Uniswap V4
 * All user funds and NFTs remain in the Gnosis Safe wallet at all times
 * Contracts only act as operators with explicit approval from the Safe
 */
contract LeveragedLPManager is IERC721Receiver, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;
    
    struct UserPosition {
        address safe;
        uint256 lpTokenId;
    }
    
    mapping(address => UserPosition) public userPositions;
    mapping(uint256 => address) public lpTokenToSafe;

    address public immutable aavePool;
    address public immutable positionManager;
    address public immutable usdc;
    address public immutable weth;
    address public feeHook;
    address public immutable uniswapRouter;
    uint24 public immutable poolFee;
    
    // Constants
    uint16 public constant REFERRAL_CODE = 0;
    uint256 public constant INTEREST_RATE_MODE = 2; // Variable rate
    uint256 public constant MAX_LTV = 75; // Maximum loan-to-value ratio (75%)
    
    // Minimum amounts for slippage protection
    uint256 public minEthAmount;
    uint256 public minUsdcAmount;
    
    // Protocol fee in basis points (1/100 of a percent)
    // 100 = 1%, 10 = 0.1%, etc.
    uint8 public protocolFeeBps = 0;

    // Events for analytics and debugging
    event StrategyStarted(address indexed safe, uint256 indexed lpTokenId, uint256 ethSupplied, uint256 usdcBorrowed);
    event FeesProcessed(address indexed safe, uint256 indexed lpTokenId, uint256 usdcRepaid, uint256 ethAdded);
    event StrategyExited(address indexed safe, uint256 indexed lpTokenId, uint256 ethReturned, uint256 usdcRepaid);
    event SlippageParamsUpdated(uint256 minEthAmount, uint256 minUsdcAmount);

    /**
     * @dev Constructor to initialize the contract with required addresses
     * @param _aavePool Address of the Aave V3 lending pool
     * @param _positionManager Address of the Uniswap V4 position manager
     * @param _usdc Address of the USDC token
     * @param _weth Address of the WETH token
     * @param _feeHook Address of the fee collection hook
     * @param _uniswapRouter Address of the Uniswap V4 router
     * @param _poolFee The fee tier for the Uniswap V4 pool (e.g., 3000 for 0.3%)
     */
    constructor(
        address _aavePool,
        address _positionManager,
        address _usdc,
        address _weth,
        address _feeHook,
        address _uniswapRouter,
        uint24 _poolFee
    ) Ownable(msg.sender) {
        require(_aavePool != address(0), "Invalid Aave pool address");
        require(_positionManager != address(0), "Invalid position manager address");
        require(_usdc != address(0), "Invalid USDC address");
        require(_weth != address(0), "Invalid WETH address");
        require(_uniswapRouter != address(0), "Invalid Uniswap router address");
        
        aavePool = _aavePool;
        positionManager = _positionManager;
        usdc = _usdc;
        weth = _weth;
        feeHook = _feeHook;
        uniswapRouter = _uniswapRouter;
        poolFee = _poolFee;
        
        // Set default slippage parameters (can be updated later)
        minEthAmount = 1e15; // 0.001 ETH
        minUsdcAmount = 1e6; // 1 USDC
    }
    
    /**
     * @dev Start the leveraged LP strategy
     * @param safe The address of the user's Gnosis Safe wallet
     * @param ethAmount The amount of ETH to supply as collateral
     * @param ltv The loan-to-value ratio for borrowing (as a percentage)
     * @param slippageBps Slippage tolerance in basis points (e.g., 50 = 0.5%)
     */
    function startStrategy(address safe, uint256 ethAmount, uint256 ltv, uint16 slippageBps) external nonReentrant {
        require(safe != address(0), "Invalid Safe address");
        require(ethAmount > 0, "ETH amount must be > 0");
        require(ltv > 0 && ltv <= MAX_LTV, "LTV must be <= 75%");
        require(userPositions[safe].safe == address(0), "Strategy already active");
        
        // [1] Transfer ETH from Safe to this contract
        // The Safe must have approved this contract to transfer ETH
        IERC20(weth).transferFrom(safe, address(this), ethAmount);
        
        // [2] Supply ETH to Aave as collateral on behalf of the Safe
        IERC20(weth).approve(aavePool, ethAmount);
        IAavePool(aavePool).supply(weth, ethAmount, safe, REFERRAL_CODE);
        
        // [3] Borrow USDC against ETH collateral
        uint256 usdcToBorrow = (ethAmount * ltv) / 100;
        IAavePool(aavePool).borrow(usdc, usdcToBorrow, INTEREST_RATE_MODE, REFERRAL_CODE, address(this));
        
        // [4] Split USDC: 50% for LP, 50% to swap for more ETH
        uint256 usdcForLp = usdcToBorrow / 2;
        uint256 usdcToSwap = usdcToBorrow - usdcForLp;
        
        // [5] Swap USDC for ETH using Uniswap
        IERC20(usdc).approve(uniswapRouter, usdcToSwap);
        
        uint256 ethFromSwap = IUniswapV4Router(uniswapRouter).exactInputSingle(
            usdc,
            weth,
            poolFee,
            address(this),
            usdcToSwap,
            minEthAmount,  // Minimum ETH to receive (slippage protection)
            0  // No price limit
        );
        
        // [6] Create Uniswap V4 LP position
        IERC20(usdc).approve(positionManager, usdcForLp);
        IERC20(weth).approve(positionManager, ethFromSwap);
        
        // Create a full-range position
        int24 tickSpacing = 60;  // For 0.3% fee tier
        int24 minTick = -887272;  // Min tick for full range
        int24 maxTick = 887272;   // Max tick for full range
        
        // Ensure ticks are multiples of tickSpacing
        minTick = (minTick / tickSpacing) * tickSpacing;
        maxTick = (maxTick / tickSpacing) * tickSpacing;
        
        // Calculate minimum amounts based on slippage tolerance
        uint256 amount0Min = usdcForLp - ((usdcForLp * slippageBps) / 10000);
        uint256 amount1Min = ethFromSwap - ((ethFromSwap * slippageBps) / 10000);
        
        // Mint the LP position
        IUniswapV4PositionManager.MintParams memory params = IUniswapV4PositionManager.MintParams({
            token0: usdc,
            token1: weth,
            fee: poolFee,
            tickLower: minTick,
            tickUpper: maxTick,
            amount0Desired: usdcForLp,
            amount1Desired: ethFromSwap,
            amount0Min: amount0Min,
            amount1Min: amount1Min,
            recipient: safe,  // Mint directly to the Safe wallet
            deadline: block.timestamp + 15 minutes
        });
        
        (uint256 tokenId, uint128 liquidity, uint256 usedUsdc, uint256 usedEth) = 
            IUniswapV4PositionManager(positionManager).mint(params);
        
        // [7] Save position data
        // Only store the minimal information needed
        UserPosition storage position = userPositions[safe];
        position.safe = safe;
        position.lpTokenId = tokenId;
        // Position is active when it has a valid safe address and lpTokenId
        
        lpTokenToSafe[tokenId] = safe;
        
        // [8] Return any unused tokens to the Safe
        uint256 remainingUsdc = usdcForLp - usedUsdc;
        uint256 remainingEth = ethFromSwap - usedEth;
        
        // Only transfer if there's a meaningful amount to transfer
        if (remainingUsdc > 1000) { // Small threshold to avoid dust transfers
            IERC20(usdc).transfer(safe, remainingUsdc);
        }
        
        // Only transfer if there's a meaningful amount to transfer
        if (remainingEth > 1000) { // Small threshold to avoid dust transfers
            IERC20(weth).transfer(safe, remainingEth);
        }
        
        emit StrategyStarted(safe, tokenId, ethAmount, usdcToBorrow);
    }

    /**
     * @dev Process fees collected from the LP position
     * @param safe The address of the user's Gnosis Safe wallet
     * @param usdcAmount The amount of USDC fees collected
     * @param ethAmount The amount of ETH fees collected
     */
    function processFees(address safe, uint256 usdcAmount, uint256 ethAmount) external nonReentrant {
        require(msg.sender == feeHook, "Only hook can process fees");
        
        UserPosition storage position = userPositions[safe];
        require(position.safe != address(0), "No active strategy");
        
        uint256 lpTokenId = position.lpTokenId;
        
        // Track how much was processed for the event
        uint256 usdcProcessed = 0;
        uint256 ethProcessed = 0;
        
        // Calculate protocol fee if enabled
        uint256 usdcFee = 0;
        uint256 ethFee = 0;
        
        if (protocolFeeBps > 0) {
            usdcFee = (usdcAmount * protocolFeeBps) / 10000;
            ethFee = (ethAmount * protocolFeeBps) / 10000;
            
            // Deduct fee from amounts
            usdcAmount = usdcAmount - usdcFee;
            ethAmount = ethAmount - ethFee;
            
            // Transfer fees to contract owner
            if (usdcFee > 0) {
                IERC20(usdc).transfer(owner(), usdcFee);
            }
            
            if (ethFee > 0) {
                IERC20(weth).transfer(owner(), ethFee);
            }
        }
        
        // [1] Repay Aave USDC debt (on behalf of Safe)
        if (usdcAmount > 0) {
            // Get the current debt from Aave directly
            uint256 currentDebt = IAavePool(aavePool).getUserDebt(safe, usdc, INTEREST_RATE_MODE);
            
            if (currentDebt > 0) {
                // Approve Aave to spend the USDC
                IERC20(usdc).approve(aavePool, usdcAmount);
                
                // Repay USDC debt
                usdcProcessed = IAavePool(aavePool).repay(usdc, usdcAmount, INTEREST_RATE_MODE, safe);
            } else {
                // If there's no debt, transfer USDC back to the Safe
                IERC20(usdc).transfer(safe, usdcAmount);
                usdcProcessed = usdcAmount;
            }
        }
        
        // [2] Add ETH as collateral (on behalf of Safe)
        if (ethAmount > 0) {
            // Approve Aave to spend the WETH
            IERC20(weth).approve(aavePool, ethAmount);
            
            // Supply ETH as additional collateral
            IAavePool(aavePool).supply(weth, ethAmount, safe, REFERRAL_CODE);
            ethProcessed = ethAmount;
        }
        
        emit FeesProcessed(safe, lpTokenId, usdcProcessed, ethProcessed);
    }

    /**
     * @dev Exit the strategy and unwind all positions
     * @param safe The address of the user's Gnosis Safe wallet
     * @param swapEthForDebt Whether to swap ETH for USDC to repay remaining debt
     */
    function exitStrategy(address safe, bool swapEthForDebt) external nonReentrant {
        UserPosition storage position = userPositions[safe];
        require(position.safe != address(0), "No active strategy");
        
        uint256 lpTokenId = position.lpTokenId;
        uint256 ethReturned = 0;
        uint256 usdcRepaid = 0;
        
        // [1] The Safe must have approved this contract to manage the LP NFT
        // Transfer the LP NFT from Safe to this contract temporarily
        IUniswapV4PositionManager(positionManager).safeTransferFrom(safe, address(this), lpTokenId);
        
        // [2] Get position info from Uniswap
        (address token0, address token1, , , , , , uint128 liquidity, , , , , ) = IUniswapV4PositionManager(positionManager).positions(lpTokenId);
        
        // Decrease liquidity from the position
        (uint256 amount0, uint256 amount1) = IUniswapV4PositionManager(positionManager).decreaseLiquidity(
            lpTokenId,
            liquidity,  // Withdraw all liquidity
            0,  // Min USDC (we're unwinding, so accept any amount)
            0,  // Min ETH (we're unwinding, so accept any amount)
            block.timestamp + 15 minutes
        );
        
        // [3] Collect all tokens from the position
        (uint256 collected0, uint256 collected1) = IUniswapV4PositionManager(positionManager).collect(
            lpTokenId,
            address(this),
            type(uint128).max,  // Collect all token0
            type(uint128).max   // Collect all token1
        );
        
        // Determine which token is USDC and which is WETH based on token addresses
        uint256 collectedUsdc;
        uint256 collectedEth;
        
        if (token0 == usdc) {
            collectedUsdc = amount0 + collected0;
            collectedEth = amount1 + collected1;
        } else {
            collectedUsdc = amount1 + collected1;
            collectedEth = amount0 + collected0;
        }
        
        // [4] Transfer the LP NFT back to the Safe (it's now empty but still owned)
        IUniswapV4PositionManager(positionManager).safeTransferFrom(address(this), safe, lpTokenId);
        
        // [5] Query Aave for current USDC debt
        uint256 usdcDebt = IAavePool(aavePool).getUserDebt(safe, usdc, INTEREST_RATE_MODE);
        
        if (usdcDebt > 0) {
            if (collectedUsdc >= usdcDebt) {
                // We have enough USDC to repay the debt
                IERC20(usdc).approve(aavePool, usdcDebt);
                IAavePool(aavePool).repay(usdc, usdcDebt, INTEREST_RATE_MODE, safe);
                usdcRepaid = usdcDebt;
                
                // Return any excess USDC to the Safe
                uint256 usdcExcess = collectedUsdc - usdcDebt;
                if (usdcExcess > 0) {
                    // Only transfer if there's a meaningful amount to transfer
                    if (usdcExcess > 1000) { // Small threshold to avoid dust transfers
                        IERC20(usdc).transfer(safe, usdcExcess);
                    }
                }
            } else {
                // Not enough USDC, use all collected USDC to repay part of the debt
                IERC20(usdc).approve(aavePool, collectedUsdc);
                IAavePool(aavePool).repay(usdc, collectedUsdc, INTEREST_RATE_MODE, safe);
                usdcRepaid = collectedUsdc;
                
                // Calculate remaining debt
                uint256 remainingDebt = usdcDebt - collectedUsdc;
                
                // Only swap ETH for USDC if the user opted for it
                if (swapEthForDebt) {
                    // Swap some ETH for USDC to repay the remaining debt
                    uint256 ethToSwap = (collectedEth * remainingDebt) / (collectedUsdc + remainingDebt);
                    if (ethToSwap > 0 && ethToSwap < collectedEth) {
                        IERC20(weth).approve(uniswapRouter, ethToSwap);
                        uint256 usdcFromSwap = IUniswapV4Router(uniswapRouter).exactInputSingle(
                            weth,
                            usdc,
                            poolFee,
                            address(this),
                            ethToSwap,
                            0,  // Accept any amount of USDC
                            0   // No price limit
                        );
                        
                        // Repay additional USDC debt
                        IERC20(usdc).approve(aavePool, usdcFromSwap);
                        uint256 additionalRepaid = IAavePool(aavePool).repay(usdc, usdcFromSwap, INTEREST_RATE_MODE, safe);
                        usdcRepaid += additionalRepaid;
                        
                        // Update ETH amount
                        collectedEth -= ethToSwap;
                    }
                }
                // If user opted not to swap, they'll handle the remaining debt separately
            }
        }
        
        // [6] Query Aave for ETH collateral and withdraw it
        uint256 ethCollateral = IAavePool(aavePool).getUserCollateral(safe, weth);
        if (ethCollateral > 0) {
            IAavePool(aavePool).withdraw(weth, ethCollateral, address(this));
        }
        
        // [7] Return all ETH to the Safe
        // Make sure we don't try to transfer more than we have
        uint256 availableEth = IERC20(weth).balanceOf(address(this));
        ethReturned = availableEth > 0 ? availableEth : 0;
        
        // Only transfer if there's a meaningful amount to transfer
        if (ethReturned > 1000) { // Small threshold to avoid dust transfers
            IERC20(weth).transfer(safe, ethReturned);
        }
        
        // [8] Update position mapping
        emit StrategyExited(safe, lpTokenId, ethReturned, usdcRepaid);
        delete lpTokenToSafe[position.lpTokenId];
        delete userPositions[safe];
    }

    /**
     * @dev Get the user's position details
     * @param safe The address of the user's Gnosis Safe wallet
     * @return The user's position details (safe address, LP token ID, active status)
     */
    function getUserPosition(address safe) external view returns (address, uint256, bool) {
        UserPosition storage position = userPositions[safe];
        // A position is considered active if it has a valid safe address
        bool isActive = position.safe != address(0);
        return (
            position.safe,
            position.lpTokenId,
            isActive
        );
    }
    
    // Events for protocol fee changes
    event ProtocolFeeUpdated(uint8 oldFeeBps, uint8 newFeeBps);

    /**
     * @dev Update the fee hook address
     * @param _feeHook New fee hook address
     */
    function setFeeHook(address _feeHook) external onlyOwner {
        require(_feeHook != address(0), "Invalid fee hook address");
        feeHook = _feeHook;
    }
    
    /**
     * @dev Update the protocol fee in basis points
     * @param _feeBps New fee in basis points (100 = 1%)
     */
    function setProtocolFee(uint8 _feeBps) external onlyOwner {
        require(_feeBps <= 1000, "Fee too high"); // Max 10%
        uint8 oldFeeBps = protocolFeeBps;
        protocolFeeBps = _feeBps;
        emit ProtocolFeeUpdated(oldFeeBps, _feeBps);
    }
    
    // Note: transferOwnership function is inherited from OpenZeppelin's Ownable contract

    /**
     * @dev Required for IERC721Receiver
     */
    function onERC721Received(address, address, uint256, bytes calldata) external pure override returns (bytes4) {
        return this.onERC721Received.selector;
    }
}
