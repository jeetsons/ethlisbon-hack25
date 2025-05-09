// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import "../lib/openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import "../lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";

// Interface for LeveragedLPManager
interface ILeveragedLPManager {
    function processFees(address safe, uint256 usdcAmount, uint256 ethAmount) external;
    function lpTokenToSafe(uint256 lpTokenId) external view returns (address);
}

// Interface for Uniswap V4 Position Manager
interface IUniswapV4PositionManager {
    function collect(
        uint256 tokenId,
        address recipient,
        uint128 amount0Max,
        uint128 amount1Max
    ) external returns (uint256 amount0, uint256 amount1);
    function ownerOf(uint256 tokenId) external view returns (address);
}

// Interface for Uniswap V4 Hook
interface IUniswapV4Hook {
    function beforeInitialize(address, bytes calldata) external returns (bytes4);
    function afterInitialize(address, bytes calldata) external returns (bytes4);
    function beforeModifyPosition(address, bytes calldata, IPoolManager.ModifyPositionParams calldata) external returns (bytes4);
    function afterModifyPosition(address, bytes calldata, IPoolManager.ModifyPositionParams calldata, BalanceDelta calldata) external returns (bytes4);
    function beforeSwap(address, bytes calldata, IPoolManager.SwapParams calldata) external returns (bytes4);
    function afterSwap(address, bytes calldata, IPoolManager.SwapParams calldata, BalanceDelta calldata) external returns (bytes4);
    function beforeDonate(address, bytes calldata, uint256, uint256) external returns (bytes4);
    function afterDonate(address, bytes calldata, uint256, uint256) external returns (bytes4);
}

// Minimal interfaces for Uniswap V4 structures
interface IPoolManager {
    struct ModifyPositionParams {
        int24 tickLower;
        int24 tickUpper;
        int256 liquidityDelta;
    }
    
    struct SwapParams {
        bool zeroForOne;
        int256 amountSpecified;
        uint160 sqrtPriceLimitX96;
    }
}

// Balance Delta structure for Uniswap V4
struct BalanceDelta {
    int256 amount0;
    int256 amount1;
}

/**
 * @title FeeCollectHook
 * @dev Uniswap V4 hook for collecting fees from LP positions after every 10th trade
 * This contract implements the Uniswap V4 hook interface and tracks trades per LP position
 */
contract FeeCollectHook is ReentrancyGuard, IUniswapV4Hook {
    using SafeERC20 for IERC20;
    
    // Mapping from LP token ID to trade count
    mapping(uint256 => uint256) public tradeCounts;
    
    // Mapping to track which pools this hook is authorized for
    mapping(address => bool) public authorizedPools;

    address public immutable positionManager;
    address public immutable leveragedLpManager;
    address public immutable usdc;
    address public immutable weth;
    address public owner;

    // Events for analytics and governance
    event FeesCollected(uint256 indexed lpTokenId, uint256 usdcAmount, uint256 ethAmount, uint256 tradeCount);
    event PoolAuthorized(address indexed pool, bool authorized);

    /**
     * @dev Constructor to initialize the contract with required addresses
     * @param _positionManager Address of the Uniswap V4 position manager
     * @param _leveragedLpManager Address of the LeveragedLPManager contract
     * @param _usdc Address of the USDC token
     * @param _weth Address of the WETH token
     */
    constructor(address _positionManager, address _leveragedLpManager, address _usdc, address _weth) {
        require(_positionManager != address(0), "Invalid position manager address");
        require(_leveragedLpManager != address(0), "Invalid manager address");
        require(_usdc != address(0), "Invalid USDC address");
        require(_weth != address(0), "Invalid WETH address");
        
        positionManager = _positionManager;
        leveragedLpManager = _leveragedLpManager;
        usdc = _usdc;
        weth = _weth;
        owner = msg.sender;
    }
    
    /**
     * @dev Authorize or deauthorize a pool to use this hook
     * @param pool Address of the Uniswap V4 pool
     * @param authorized Whether the pool is authorized
     */
    function setPoolAuthorization(address pool, bool authorized) external {
        require(msg.sender == owner, "Only owner can authorize pools");
        authorizedPools[pool] = authorized;
        emit PoolAuthorized(pool, authorized);
    }
    
    /**
     * @dev Transfer ownership of the contract
     * @param newOwner Address of the new owner
     */
    function transferOwnership(address newOwner) external {
        require(msg.sender == owner, "Only owner can transfer ownership");
        require(newOwner != address(0), "Invalid new owner address");
        owner = newOwner;
    }

    /**
     * @dev Called by Uniswap V4 after a swap affecting the position
     * @param pool The address of the pool where the swap occurred
     * @param hookData Custom data passed to the hook
     * @param params The swap parameters
     * @param delta The balance delta resulting from the swap
     * @return The function selector to confirm hook execution
     */
    function afterSwap(
        address pool,
        bytes calldata hookData,
        IPoolManager.SwapParams calldata params,
        BalanceDelta calldata delta
    ) external override nonReentrant returns (bytes4) {
        require(authorizedPools[pool], "Unauthorized pool");
        
        // Extract the LP token ID from the hook data
        uint256 lpTokenId = abi.decode(hookData, (uint256));
        
        // Increment the trade count for this LP position
        tradeCounts[lpTokenId]++;
        
        // Only collect fees every 10th trade
        if (tradeCounts[lpTokenId] % 10 == 0) {
            // Verify that the LP token exists and get its owner
            address lpOwner = IUniswapV4PositionManager(positionManager).ownerOf(lpTokenId);
            address safeOwner = ILeveragedLPManager(leveragedLpManager).lpTokenToSafe(lpTokenId);
            
            // Verify that the LP token is owned by a Safe wallet managed by our system
            require(lpOwner == safeOwner, "LP token not owned by Safe");
            
            // Collect fees from Uniswap for this LP NFT
            // The Safe (owner) must have approved this contract for the NFT
            (uint256 amount0, uint256 amount1) = IUniswapV4PositionManager(positionManager).collect(
                lpTokenId,
                address(this), // collect to hook contract
                type(uint128).max,
                type(uint128).max
            );
            
            // Determine which token is USDC/ETH based on token0/token1 ordering in the pool
            uint256 usdcAmount;
            uint256 ethAmount;
            
            // For simplicity in this implementation, we assume token0 is USDC and token1 is WETH
            // In a production environment, we would need to check the actual token addresses
            usdcAmount = amount0;
            ethAmount = amount1;
            
            // Log the fee collection event
            emit FeesCollected(lpTokenId, usdcAmount, ethAmount, tradeCounts[lpTokenId]);
            
            // Only process fees if we collected something
            if (usdcAmount > 0 || ethAmount > 0) {
                // Approve LeveragedLPManager to spend the tokens
                if (usdcAmount > 0) {
                    IERC20(usdc).approve(leveragedLpManager, usdcAmount);
                }
                
                if (ethAmount > 0) {
                    IERC20(weth).approve(leveragedLpManager, ethAmount);
                }
                
                // Process the fees through the LeveragedLPManager
                ILeveragedLPManager(leveragedLpManager).processFees(safeOwner, usdcAmount, ethAmount);
            }
        }
        
        return this.afterSwap.selector;
    }
    
    // Implement the required hook interface functions
    function beforeInitialize(address, bytes calldata) external pure override returns (bytes4) {
        return this.beforeInitialize.selector;
    }
    
    function afterInitialize(address, bytes calldata) external pure override returns (bytes4) {
        return this.afterInitialize.selector;
    }
    
    function beforeModifyPosition(address, bytes calldata, IPoolManager.ModifyPositionParams calldata) external pure override returns (bytes4) {
        return this.beforeModifyPosition.selector;
    }
    
    function afterModifyPosition(address, bytes calldata, IPoolManager.ModifyPositionParams calldata, BalanceDelta calldata) external pure override returns (bytes4) {
        return this.afterModifyPosition.selector;
    }
    
    function beforeSwap(address, bytes calldata, IPoolManager.SwapParams calldata) external pure override returns (bytes4) {
        return this.beforeSwap.selector;
    }
    
    function beforeDonate(address, bytes calldata, uint256, uint256) external pure override returns (bytes4) {
        return this.beforeDonate.selector;
    }
    
    function afterDonate(address, bytes calldata, uint256, uint256) external pure override returns (bytes4) {
        return this.afterDonate.selector;
    }
}
