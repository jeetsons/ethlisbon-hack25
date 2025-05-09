# DeFi Safe Leveraged LP – Hackathon Spec (Full Version)

*For Junior Developers: This document will walk you through everything step-by-step, including why, how, and what to code. It’s designed for hackathon speed and clarity!*

---

## Table of Contents

1. [Overview & User Journey](#overview--user-journey)
2. [Architecture: What are the Key Parts?](#architecture-what-are-the-key-parts)
3. [Contracts – Full Details & Sample Code](#contracts--full-details--sample-code)
   - Main Logic: LeveragedLPManager
   - UniswapV4 Fee Hook: FeeCollectHook
4. [Frontend/UX Guidance](#frontendux-guidance)
5. [Events & Analytics](#events--analytics)
6. [Security & Hackathon Constraints](#security--hackathon-constraints)
7. [Step-by-Step Hackathon Checklist](#step-by-step-hackathon-checklist)
8. [Extending or Debugging](#extending-or-debugging)
9. [References & Links](#references--links)

---

## 1. Overview & User Journey

**Goal:**  
Allow a user to create a Safe wallet, deposit ETH, and—using a smart contract—automate:
- Supplying ETH as collateral to Aave V3,
- Borrowing USDC,
- Creating a full-range USDC/ETH liquidity position on Uniswap V4,
- Using a Uniswap V4 "hook" to automate fee collection: on every 10th trade, collected fees are used to repay Aave debt (USDC) and add more ETH as collateral (if any).

**Typical Flow:**

1. **User connects to the dApp** and creates a new Safe wallet (1/1, i.e., only they control it).
2. **User deposits ETH** into their Safe wallet.
3. **User starts the strategy:** the contract (with the Safe’s permission) deposits ETH into Aave, borrows USDC, and creates the LP on Uniswap.
4. **Uniswap V4 Hook:** every 10 trades, the hook collects fees from the LP NFT (held by the Safe), and the contract repays USDC debt and tops up ETH collateral using these fees.
5. **User can exit at any time:** the contract unwinds everything and returns assets to the Safe.

---

## 2. Architecture: What are the Key Parts?

**Diagram (Textual):**
```
User (EOA)
    |
    v
[Safe Wallet (1/1)]
    |            \
    |             \
    v              v
[LeveragedLPManager]   [Uniswap V4 Pool <–> FeeCollectHook]
    |              /
    |             /
    v            v
 [Aave V3]   [Uniswap V4 Position Manager]
```

- **Safe Wallet:** Owns ETH, USDC, and the Uniswap LP NFT. Only acts if the user or authorized contract triggers it.
- **LeveragedLPManager:** Main contract that automates deposits, borrowing, LP creation, and unwinding. Only operates with Safe’s explicit approval.
- **FeeCollectHook:** Uniswap V4 "hook" contract. Listens for swaps, tracks trade count, and (when count = 10) collects fees from the LP NFT (with approval!), then calls LeveragedLPManager to process those fees.
- **Aave V3:** Lending protocol for ETH collateral and USDC debt.
- **Uniswap V4:** Where the LP position is created; fees accrue here.

---

## 3. Contracts – Full Details & Sample Code

### Main Logic: LeveragedLPManager

**Purpose:**  
- Start the strategy (deposit, borrow, LP mint)
- Handle fee processing (from hook)
- Exit/unwind strategy

#### Sample: LeveragedLPManager.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// Dummy interfaces for illustration.
// Use actual Aave/Uniswap V4 interfaces in production!
interface IAavePool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external payable;
    function borrow(address asset, uint256 amount, uint256 interestRateMode, uint16 referralCode, address onBehalfOf) external;
    function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) external returns (uint256);
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
}
interface IUniswapV4PositionManager {
    function mint(/* params */) external returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
    function collect(/* params */) external returns (uint256 amount0, uint256 amount1);
}

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

    // 1. Start the leveraged LP strategy
    function startStrategy(address safe, uint256 ethAmount, uint256 ltv) external {
        require(!userPositions[safe].isActive, "Strategy already active");
        // [0] PRECONDITION: This contract must be approved by Safe to move ETH/USDC and mint LP
        // [1] Supply ETH to Aave
        // IAavePool(aavePool).supply{value: ethAmount}(weth, ethAmount, safe, 0);
        // [2] Borrow USDC against ETH collateral
        // uint256 usdcToBorrow = ethAmount * ltv / 100;
        // IAavePool(aavePool).borrow(usdc, usdcToBorrow, 2, 0, safe);
        // [3] Mint Uniswap V4 full-range LP (actual params depend on Uniswap interface)
        // (uint256 lpTokenId, , , ) = IUniswapV4PositionManager(positionManager).mint(...);
        uint256 fakeLpTokenId = 123; // Placeholder for minted tokenId
        // [4] Transfer LP NFT to Safe
        // IUniswapV4PositionManager(positionManager).safeTransferFrom(address(this), safe, lpTokenId);
        // [5] Save position data
        userPositions[safe] = UserPosition(safe, fakeLpTokenId, ethAmount, (ethAmount * ltv) / 100, true);
        lpTokenToSafe[fakeLpTokenId] = safe;
        emit StrategyStarted(safe, ethAmount, (ethAmount * ltv) / 100, fakeLpTokenId);
    }

    // 2. Called by the hook after every 10th trade to process collected fees
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

    // 3. User triggers unwind of the position
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

    // This contract needs to be able to receive LP NFT from Uniswap
    function onERC721Received(address, address, uint256, bytes calldata) override external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
```

---

### UniswapV4 Fee Hook: FeeCollectHook

**Purpose:**  
- Track trades per LP,
- On every 10th trade, collect fees from the LP NFT (held by the Safe wallet, but Safe must approve Hook!),
- Send fees to LeveragedLPManager for processing.

#### Fee/NFT Approval Explained

> **Why is approval needed?**  
> Only the owner or an approved operator can call `collect()` on an Uniswap V4 NFT. The Safe must approve the FeeCollectHook contract to collect fees on its behalf.

- Approve all: `setApprovalForAll(hookAddress, true)`  
- Approve specific LP: `approve(hookAddress, lpTokenId)`

#### Sample: FeeCollectHook.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// Use actual Uniswap V4 interfaces in production!
interface IUniswapV4PositionManager {
    function collect(
        uint256 tokenId,
        address recipient,
        uint128 amount0Max,
        uint128 amount1Max
    ) external returns (uint256 amount0, uint256 amount1);
}

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

    // Called by Uniswap V4 after a swap affecting the position
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
            address safeOwner = LeveragedLPManager(leveragedLpManager).lpTokenToSafe(lpTokenId);
            LeveragedLPManager(leveragedLpManager).processFees(safeOwner, usdcAmount, ethAmount);
        }
        return this.afterSwap.selector;
    }
}
```

---

## 4. Frontend/UX Guidance

- **Wallet Creation:** Guide user to create a 1/1 Safe wallet (Safe{Core} SDK or web UI).
- **Deposit:** Let user deposit ETH into Safe wallet (show balance).
- **Strategy Start:** Button to trigger strategy. Under the hood, Safe must approve LeveragedLPManager and FeeCollectHook for relevant assets/NFTs.
- **NFT Fee Approval:** After LP mint, prompt user to approve FeeCollectHook for their LP NFT.
- **Monitoring:** Show LP position, Aave debt, accrued fees, and amounts repaid/recollateralized.
- **Exit:** Button for user to unwind the whole position—calls LeveragedLPManager.exitStrategy.

**Example: Safe NFT Approval (ethers.js)**
```js
// After LP mint
await nftContract.approve(feeCollectHookAddress, lpTokenId); // Or setApprovalForAll
```

---

## 5. Events & Analytics

- **On-chain Events:**
  - `StrategyStarted(safe, ethAmount, usdcAmount, lpTokenId)` (strategy begins)
  - `FeesProcessed(safe, usdcRepaid, ethAdded)` (hook triggers, fees processed)
  - `StrategyExited(safe, ethReturned, usdcReturned)` (user exits)
  - `FeesCollected(lpTokenId, usdcAmount, ethAmount, tradeCount)` (hook collects fees)

- **Frontend:**  
  - Listen for these events to update UI and offer transparency into what’s happening.

---

## 6. Security & Hackathon Constraints

- **No contract custody:** All user funds/NFTs stay in the Safe at all times.
- **Explicit approvals:** Never assume approval exists—always prompt user for asset and NFT approvals.
- **Conservative LTV:** Default borrow ratio to 50–75% to minimize risk of Aave liquidations.
- **Minimal error handling:** For hackathon, revert on any failure (add error messages for clarity).
- **No oracles:** Price feeds can be mocked for demo; warn users about real-world risk.

---

## 7. Step-by-Step Hackathon Checklist

- [ ] User creates Safe wallet (1/1).
- [ ] User funds Safe with ETH.
- [ ] User’s Safe approves LeveragedLPManager for ETH/USDC and Uniswap NFT.
- [ ] User’s Safe approves FeeCollectHook for LP NFT.
- [ ] User starts strategy: ETH → Aave (collateral), USDC borrowed, LP minted.
- [ ] Uniswap V4 hook collects fees every 10th trade, forwards to contract.
- [ ] Contract repays Aave debt and adds ETH collateral with fees.
- [ ] User presses "Exit" to unwind everything, all funds return to Safe.
- [ ] Frontend displays all steps and events.

---

## 8. Extending or Debugging

- **Add more pairs:** Start with USDC/ETH, but could generalize.
- **Analytics:** Use events for P&L, APY, and health factor tracking.
- **Test thoroughly:** Use Hardhat mainnet forking for realistic testing.
- **Review all approvals:** Most errors come from missing/unexpected approval logic.

---

## 9. References & Links

- [Safe{Core} SDK Docs](https://docs.safe.global/)
- [Aave V3 Developer Docs](https://docs.aave.com/)
- [Uniswap V4 Docs (Preview)](https://docs.uniswap.org/)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/4.x/)

---

**Hand this doc to any junior dev and they should be able to start building! If you have questions, check the links above or reach out to your technical lead. Good luck at your hackathon! 🚀**
