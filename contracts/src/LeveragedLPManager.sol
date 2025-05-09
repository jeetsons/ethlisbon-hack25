// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// Interfaces for Aave V3
interface IAavePool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external payable;
    function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf) external;
    function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) external returns (uint256);
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
}

// Interfaces for Uniswap V4
interface IUniswapV4PositionManager {
    function mint(/* params */) external returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
    function collect(uint256 tokenId, address recipient, uint128 amount0Max, uint128 amount1Max) external returns (uint256 amount0, uint256 amount1);
}

/**
 * @title LeveragedLPManager
 * @dev Main contract for managing leveraged LP positions using Aave V3 and Uniswap V4
 */
contract LeveragedLPManager is IERC721Receiver {
    struct UserPosition {
        address safe;
        uint256 lpTokenId;
        uint256 ethSupplied;
        uint256 usdcBorrowed;
        bool isActive;
    }
    
    mapping(address => UserPosition) public userPositions;
    mapping(uint256 => address) public lpTokenToSafe;

    address public aavePool;
    address public positionManager;
    address public usdc;
    address public weth;
    address public feeHook;

    // Events for analytics and debugging
    event StrategyStarted(address indexed safe, uint256 ethAmount, uint256 usdcAmount, uint256 lpTokenId);
    event FeesProcessed(address indexed safe, uint256 usdcRepaid, uint256 ethAdded);
    event StrategyExited(address indexed safe, uint256 ethReturned, uint256 usdcReturned);

    constructor(address _aavePool, address _positionManager, address _usdc, address _weth, address _feeHook) {
        aavePool = _aavePool;
        positionManager = _positionManager;
        usdc = _usdc;
        weth = _weth;
        feeHook = _feeHook;
    }

    /**
     * @dev Start the leveraged LP strategy
     * @param safe The address of the user's Gnosis Safe wallet
     * @param ethAmount The amount of ETH to supply as collateral
     * @param ltv The loan-to-value ratio for borrowing (as a percentage)
     */
    function startStrategy(address safe, uint256 ethAmount, uint256 ltv) external {
        require(!userPositions[safe].isActive, "Strategy already active");
        // [0] PRECONDITION: This contract must be approved by Safe to move ETH/USDC and mint LP

        // [1] Supply ETH to Aave
        // IAavePool(aavePool).supply{value: ethAmount}(weth, ethAmount, safe, 0);

        // [2] Borrow USDC against ETH collateral
        uint256 usdcToBorrow = (ethAmount * ltv) / 100;
        // IAavePool(aavePool).borrow(usdc, usdcToBorrow, 2, 0, safe);

        // [3] Swap 50% of USDC for ETH using Uniswap
        uint256 usdcToSwap = usdcToBorrow / 2;

        // Approve Uniswap router to spend USDC
        // IERC20(usdc).approve(uniswapRouter, usdcToSwap);

        // For hackathon, we'll use a placeholder for the LP token ID
        uint256 fakeLpTokenId = 123; // Placeholder for minted tokenId

        // [6] Save position data
        userPositions[safe] = UserPosition(safe, fakeLpTokenId, ethAmount, usdcToBorrow, true);
        lpTokenToSafe[fakeLpTokenId] = safe;
        emit StrategyStarted(safe, ethAmount, usdcToBorrow, fakeLpTokenId);
    }

    /**
     * @dev Process fees collected from Uniswap LP position
     * @param safe The address of the user's Gnosis Safe wallet
     * @param usdcAmount The amount of USDC fees collected
     * @param ethAmount The amount of ETH fees collected
     */
    function processFees(address safe, uint256 usdcAmount, uint256 ethAmount) external {
        require(msg.sender == feeHook, "Only hook can process");
        require(userPositions[safe].isActive, "No active position");
        
        // [1] Repay Aave USDC debt (on behalf of Safe)
        // IERC20(usdc).approve(aavePool, usdcAmount);
        // IAavePool(aavePool).repay(usdc, usdcAmount, 2, safe);
        
        // [2] Add ETH as collateral (on behalf of Safe)
        // IERC20(weth).approve(aavePool, ethAmount);
        // IAavePool(aavePool).supply{value: ethAmount}(weth, ethAmount, safe, 0);
        
        emit FeesProcessed(safe, usdcAmount, ethAmount);
    }

    /**
     * @dev Exit the strategy and unwind all positions
     * @param safe The address of the user's Gnosis Safe wallet
     */
    function exitStrategy(address safe) external {
        require(userPositions[safe].isActive, "No active position");
        
        // [1] Withdraw liquidity from Uniswap V4, collect to Safe
        // [2] Repay remaining USDC debt
        // [3] Withdraw all ETH collateral
        // [4] Update position mapping
        
        emit StrategyExited(safe, /*ethReturned=*/0, /*usdcReturned=*/0);
        delete lpTokenToSafe[userPositions[safe].lpTokenId];
        delete userPositions[safe];
    }

    /**
     * @dev Required for receiving ERC721 tokens (LP NFTs)
     */
    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) override external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
