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

## 9. UI Pages & Screens Needed

For a smooth user journey, you should implement the following UI screens/pages. This will help your junior dev break down frontend work and ensure nothing is missed.

### 1. **Landing Page / Connect Wallet**
- **Purpose:** Welcome user, let them connect their standard wallet (e.g., MetaMask).
- **Core elements:**
  - "Connect Wallet" button (show current address if connected).
  - Brief intro to the dApp and what it does.

### 2. **Safe Wallet Creation Page**
- **Purpose:** Guide user to create a Safe (1/1 owner) if they don’t already have one.
- **Core elements:**
  - Button: "Create Safe Wallet"
  - Show Safe address after creation.
  - Option to “Select Existing Safe” if already created.

### 3. **Safe Funding Page**
- **Purpose:** Let user deposit ETH into their Safe.
- **Core elements:**
  - Display Safe address and ETH balance.
  - Input field for deposit amount.
  - "Deposit ETH" button.
  - Transaction status (pending/success/fail).

### 4. **Strategy Setup & Approval Page**
- **Purpose:** Prepare user for strategy start, handle all contract approvals.
- **Core elements:**
  - List required approvals:
    - Approve LeveragedLPManager for Safe's ETH/USDC and future Uniswap LP NFT.
    - Approve FeeCollectHook for LP NFT (after it is minted).
  - Buttons to trigger each approval (show status of each).
  - Safety tips: Explain why each approval is needed.
  - Only allow strategy start after all approvals are done.

### 5. **Start Strategy Page**
- **Purpose:** Let user start the DeFi strategy (deposit, borrow, LP mint).
- **Core elements:**
  - Display current Safe balances.
  - Form/input to choose "Deposit Amount" and "Leverage" (LTV).
  - Button: "Start Strategy"
  - Show transaction status and resulting LP NFT ID.

### 6. **Dashboard / Monitoring Page**
- **Purpose:** Show current strategy status and key metrics.
- **Core elements:**
  - Safe balances: ETH, USDC, aETH, LP NFT status.
  - Aave health factor, borrowed USDC, remaining debt.
  - LP position stats: accrued fees, trade count toward next fee collection.
  - Event/activity log (showing recent contract events).
  - Button: "Exit & Unwind" (visible if strategy active).

### 7. **Fee Automation Status Page**
- **Purpose:** Explain and visualize fee collection automation.
- **Core elements:**
  - Progress bar or counter: “Trades since last fee collection.”
  - Last fees collected (amounts, timestamp).
  - Next scheduled collection (after 10 trades).
  - Status of FeeCollectHook contract (approved? collecting?).

### 8. **Exit/Unwind Confirmation Page**
- **Purpose:** Let user confirm and execute full unwind of their strategy.
- **Core elements:**
  - Summary of current position and what will happen on exit.
  - Button: "Exit & Withdraw All"
  - Transaction progress and final balances returned to Safe.

### 9. **Error & Troubleshooting Page/Modal**
- **Purpose:** Display clear errors and next steps.
- **Core elements:**
  - Catch missing approvals, failed transactions, or on-chain errors.
  - Guidance for user to retry or seek help.

---

**Notes for Junior Dev:**
- All pages should clearly show current wallet and Safe addresses.
- Loading indicators and status feedback are important for all transactions.
- Use a router/navigation bar for easy switching between screens.
- Event-driven updates (listen for contract events!) help keep UI live and responsive.

---

## 10. Libraries & Frameworks Used

For this MVP, use the following libraries and frameworks for a smooth developer and user experience:

- **WalletKit**  
  *Wallet connection provider for React and web apps. Handles multi-wallet support, network switching, and is recommended for onboarding users to Safe and Base.*
  - [WalletKit Docs](https://github.com/rainbow-me/walletkit)
  - Use WalletKit to connect user's EOA and guide them to Base (network ID 8453).

- **Safe{Core} SDK**  
  *For Safe wallet creation, transaction batching, and approvals.*
  - [Safe{Core} SDK Docs](https://docs.safe.global/)

- **Aave V3 SDK / Interfaces**  
  *For contract calls to supply/borrow on Aave.*
  - [Aave V3 Docs](https://docs.aave.com/)

- **Uniswap V4 SDK / Interfaces**  
  *For liquidity positions, hooks, and fee collection.*
  - [Uniswap V4 Docs](https://docs.uniswap.org/)

- **ethers.js / viem**  
  *For contract and wallet interaction in frontend apps.*
  - [ethers.js Docs](https://docs.ethers.org/)
  - [viem Docs](https://viem.sh/)

- **OpenZeppelin Contracts**  
  *For safe, standard ERC20/ERC721 logic and security helpers.*
  - [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/4.x/)

---

## 11. Network: Base Only (network ID 8453)

> **Important:**  
> This MVP is to be built and tested **only on the Base blockchain** (network ID 8453).

- **All contract deployments** should target Base.
- **All frontend wallet connections** (via WalletKit or other providers) must default to and require Base.
- **All addresses, faucets, and test scripts** should use Base-compatible endpoints.
- Ensure all Safe, Aave, and Uniswap addresses and parameters are set for Base.

---

- [Base Docs](https://docs.base.org/)
- [Chainlist for Base](https://chainlist.org/chain/8453)

---

**Hand this doc to any junior dev and they should be able to start building! If you have questions, check the links above or reach out to your technical lead. Good luck at your hackathon! 🚀**
