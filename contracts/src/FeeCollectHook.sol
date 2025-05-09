// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

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
}

/**
 * @title FeeCollectHook
 * @dev Uniswap V4 hook for collecting fees from LP positions after every 10th trade
 */
contract FeeCollectHook {
    mapping(uint256 => uint256) public tradeCounts;

    address public immutable positionManager;
    address public immutable leveragedLpManager;
    address public immutable usdc;
    address public immutable weth;

    // Event for analytics
    event FeesCollected(uint256 indexed lpTokenId, uint256 usdcAmount, uint256 ethAmount, uint256 tradeCount);

    constructor(address _positionManager, address _leveragedLpManager, address _usdc, address _weth) {
        positionManager = _positionManager;
        leveragedLpManager = _leveragedLpManager;
        usdc = _usdc;
        weth = _weth;
    }

    /**
     * @dev Called by Uniswap V4 after a swap affecting the position
     * @param lpTokenId The ID of the LP token affected by the swap
     * @return The function selector to confirm hook execution
     */
    function afterSwap(uint256 lpTokenId /*, ...other params... */) external returns (bytes4) {
        tradeCounts[lpTokenId]++;
        
        if (tradeCounts[lpTokenId] % 10 == 0) {
            // (1) Collect fees from Uniswap for this LP NFT
            // The Safe (owner) must have approved this contract for the NFT
            (uint256 amount0, uint256 amount1) = IUniswapV4PositionManager(positionManager).collect(
                lpTokenId,
                address(this), // collect to hook contract
                type(uint128).max,
                type(uint128).max
            );
            
            // (2) Determine which token is USDC/ETH (for demonstration, assume amount0 = USDC, amount1 = WETH)
            uint256 usdcAmount = amount0;
            uint256 ethAmount = amount1;
            
            emit FeesCollected(lpTokenId, usdcAmount, ethAmount, tradeCounts[lpTokenId]);
            
            // (3) Approve LeveragedLPManager to spend the tokens
            IERC20(usdc).approve(leveragedLpManager, usdcAmount);
            IERC20(weth).approve(leveragedLpManager, ethAmount);
            
            // (4) Find the Safe owner and notify
            address safeOwner = ILeveragedLPManager(leveragedLpManager).lpTokenToSafe(lpTokenId);
            ILeveragedLPManager(leveragedLpManager).processFees(safeOwner, usdcAmount, ethAmount);
        }
        
        return this.afterSwap.selector;
    }
}
