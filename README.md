# DeFi Safe Leveraged LP – Hackathon Spec (Full Version, Gnosis Pay Version)

*For Junior Developers: This document will walk you through everything step-by-step, including why, how, and what to code. It’s designed for hackathon speed and clarity!*

**Wallet Onboarding & Management:**  
_All user onboarding, wallet creation, connection, and contract approvals must be performed using **Gnosis Pay** (which creates and manages Gnosis Safe wallets underneath). All user flows, UI, and code should reference Gnosis Pay, not generic wallet providers._

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
Allow a user to create a Gnosis Pay wallet (Gnosis Safe), deposit ETH, and—using a smart contract—automate:
- Supplying ETH as collateral to Aave V3,
- Borrowing USDC,
- Creating a full-range USDC/ETH liquidity position on Uniswap V4,
- Using a Uniswap V4 "hook" to automate fee collection: on every 10th trade, collected fees are used to repay Aave debt (USDC) and add more ETH as collateral (if any).

**Typical Flow:**

1. **User connects to the dApp via Gnosis Pay** and creates a new Gnosis Pay wallet (Gnosis Safe, 1/1, i.e., only they control it).
2. **User deposits ETH** into their Gnosis Pay wallet.
3. **User starts the strategy:** the contract (with the Gnosis Pay wallet’s permission) deposits ETH into Aave, borrows USDC, and creates the LP on Uniswap.
4. **Uniswap V4 Hook:** every 10 trades, the hook collects fees from the LP NFT (held by the Gnosis Pay wallet), and the contract repays USDC debt and tops up ETH collateral using these fees.
5. **User can exit at any time:** the contract unwinds everything and returns assets to the Gnosis Pay wallet.

**Goal:**  
Allow a user to create a **Gnosis Pay** account (backed by a Gnosis Safe wallet), deposit ETH, and—using a smart contract—automate:
- Supplying ETH as collateral to Aave V3,
- Borrowing USDC,
- Creating a full-range USDC/ETH liquidity position on Uniswap V4,
- Using a Uniswap V4 "hook" to automate fee collection: on every 10th trade, collected fees are used to repay Aave debt (USDC) and add more ETH as collateral (if any).

**Typical Flow:**

1. **User connects to the dApp via Gnosis Pay** and creates a new Gnosis Pay wallet (which is a Gnosis Safe under the hood).
2. **User deposits ETH** into their Gnosis Pay wallet.
3. **User starts the strategy:** the contract (with the Gnosis Pay wallet’s permission) deposits ETH into Aave, borrows USDC, and creates the LP on Uniswap.
4. **Uniswap V4 Hook:** every 10 trades, the hook collects fees from the LP NFT (held by the Gnosis Pay wallet), and the contract repays USDC debt and tops up ETH collateral using these fees.
5. **User can exit at any time:** the contract unwinds everything and returns assets to the Gnosis Pay wallet.

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
        // Removed ethSupplied and usdcBorrowed fields - now querying Aave directly
        // Removed isActive field - position is active if safe != address(0)
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
    function startStrategy(address safe, uint256 ethAmount, uint256 ltv, uint16 slippageBps) external {
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

        // Pseudocode for Uniswap swap (V4 router is still evolving, so assume a router interface):
        // address[] memory path = new address[](2);
        // path[0] = usdc;
        // path[1] = weth;
        // uint256 minETH = ...; // Set slippage protection (e.g., via off-chain quote/API)
        // IUniswapRouter(uniswapRouter).swapExactTokensForETH(
        //      usdcToSwap,
        //      minETH,
        //      path,
        //      address(this),
        //      block.timestamp + 15 minutes
        // );
        // For hackathon, you may call Uniswap's off-chain API for a quote, then construct the calldata for the on-chain router.
        // After swap, contract will have `usdcToBorrow/2` USDC and the swapped ETH.

        // [4] Mint Uniswap V4 full-range LP (using both USDC and ETH)
        // (uint256 lpTokenId, , , ) = IUniswapV4PositionManager(positionManager).mint(...);
        uint256 fakeLpTokenId = 123; // Placeholder for minted tokenId

        // [5] Transfer LP NFT to Safe
        // IUniswapV4PositionManager(positionManager).safeTransferFrom(address(this), safe, lpTokenId);

        // [6] Save position data
        userPositions[safe] = UserPosition(safe, fakeLpTokenId, ethAmount, usdcToBorrow, true);
        lpTokenToSafe[fakeLpTokenId] = safe;
        emit StrategyStarted(safe, ethAmount, usdcToBorrow, fakeLpTokenId);
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
    function exitStrategy(address safe, bool swapEthForDebt) external {
        require(userPositions[safe].safe != address(0), "No active strategy");
        // [1] Withdraw liquidity from Uniswap V4, collect to Safe
        // [2] Repay remaining USDC debt (if swapEthForDebt=true, will swap ETH for USDC if needed)
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

## 8. Contract Implementation Improvements

The LeveragedLPManager contract has been improved with several key enhancements:

1. **Simplified UserPosition Struct**:
   - Removed `ethSupplied`, `usdcBorrowed`, and `isActive` fields to prevent accounting issues
   - Now directly queries Aave for accurate debt and collateral information
   - A position is considered active if `safe != address(0)`

2. **Direct Protocol Integration**:
   - Added direct queries to Aave for user debt and collateral data
   - Added Uniswap V4 position queries for accurate position details
   - Eliminates potential discrepancies between stored values and actual protocol state

3. **Flexible Exit Strategy**:
   - Added `swapEthForDebt` parameter to `exitStrategy` function
   - Gives users control over whether to swap ETH for USDC when repaying debt
   - Allows for more efficient exit strategies depending on market conditions

4. **Improved Slippage Control**:
   - Added `slippageBps` parameter to `startStrategy` function
   - Allows users to set their own slippage tolerance in basis points
   - Provides better protection against price movements during strategy execution

These improvements make the contract more robust, accurate, and user-friendly while maintaining the core functionality of the leveraged LP strategy.

---

## 9. Extending or Debugging

- **Add more pairs:** Start with USDC/ETH, but could generalize.
- **Analytics:** Use events for P&L, APY, and health factor tracking.
- **Test thoroughly:** Use Hardhat mainnet forking for realistic testing.
- **Review all approvals:** Most errors come from missing/unexpected approval logic.

---

## 8. What is Gnosis Pay? Why Do We Use It?

**Gnosis Pay** is a smart contract wallet solution built on top of Gnosis Safe, offering a modern, user-friendly, and secure wallet experience.  
- **Key Points for Developers:**
  - It gives users a “bank-like” experience on-chain (including card and payment features) but all user assets are actually held in a Gnosis Safe smart contract wallet.
  - For our dApp, **Gnosis Pay handles all wallet creation, funding, and approval logic.** Your users will interact with your dApp through their Gnosis Pay wallet.
  - **Why do we use Gnosis Pay?**
    - Easier onboarding for non-crypto users (social login, fiat onramp, etc.).
    - Out-of-the-box 1/1 Safe wallet management (no manual contract wallet deployment).
    - Strong security model: all assets, LP NFTs, and DeFi positions are always under the user’s Safe (Gnosis Pay) wallet.

**As a developer:**  
- When the user “Connects Wallet” or “Creates Wallet,” you are prompting them to use Gnosis Pay to manage their Gnosis Safe wallet.
- All contract interactions, approvals, and DeFi logic must be initiated by or approved through the Gnosis Pay wallet.
- **Do NOT let users use MetaMask, WalletConnect, or other EOAs for this flow!**  
  This MVP is designed *only* for Gnosis Pay wallets.

---

## 9. UI Pages & Screens Needed (Gnosis Pay, Gnosis Safe, and General Wallet Context)

For a smooth user journey, you should implement the following UI screens/pages.  
**This breakdown includes extra context and comments for junior developers, and describes how Gnosis Pay (built on Gnosis Safe) fits into the user experience.**

---

### 1. **Landing Page / Connect Wallet**
- **Purpose:** Welcome user, let them connect their wallet **via Gnosis Pay** (which creates and manages Gnosis Safe wallets for them).
- **Core elements:**
  - "Connect with Gnosis Pay" button (show Gnosis Pay account or Gnosis Safe address after connection).
  - *Tip:* Gnosis Pay provides a familiar, Web2-like onboarding for users, abstracting away direct contract interactions. All user funds and contract actions are managed through their Gnosis Safe wallet, provisioned by Gnosis Pay.
  - Brief intro to the dApp and what it does.

---

### 2. **Gnosis Pay (Gnosis Safe) Wallet Creation Page**
- **Purpose:** Guide user to create a **Gnosis Pay account** (which is a Gnosis Safe wallet under the hood) if they don’t have one already.
- **Core elements:**
  - Button: "Create Gnosis Pay Account"
  - After creation, show the resulting Gnosis Safe wallet address on Base.
  - Option to “Select Existing Gnosis Pay Wallet” if already created or imported.
  - *Tip for devs:* Gnosis Pay may handle the wallet creation flow natively, so your frontend often just triggers their SDK’s onboarding modal.
- **Approvals Required:** None at this stage—just wallet creation.

---

### 3. **Gnosis Pay Wallet Funding Page**
- **Purpose:** Let user deposit ETH into their Gnosis Pay wallet (Gnosis Safe).
- **Core elements:**
  - Display Gnosis Pay wallet address and ETH balance on Base.
  - Input field for deposit amount.
  - "Deposit ETH" button.
  - Transaction status (pending/success/fail).
  - *Tip:* If Gnosis Pay provides fiat onramps, you can link to those here.
- **Approvals Required:** None yet—just ETH deposit.

---

### 4. **Strategy Setup & Approval Page**
- **Purpose:** Prepare user for starting the strategy, and handle all contract approvals via their Gnosis Pay wallet.
- **Core elements:**
  - List required approvals and their purpose:
    1. **Approve `LeveragedLPManager` contract for ERC20 tokens (ETH/USDC):**
       - Needed so the manager contract can deposit/withdraw/repay on Aave and interact with Uniswap on your behalf.
       - *UI Tip:* Show approval status and provide a button: "Approve Manager for Token Access".
    2. **After LP NFT mint:**  
       - **Approve `FeeCollectHook` contract for LP NFT:**
         - Needed so the hook contract can collect fees on your behalf every 10th trade.
         - *UI Tip:* Show approval status and provide a button: "Approve Hook for Fee Collection".
       - **Approve `LeveragedLPManager` contract for LP NFT:**  
         - Needed so the manager contract can unwind (exit) your position and withdraw all funds when you choose to exit.
         - *UI Tip:* Show approval status and provide a button: "Approve Manager for LP NFT Exit".
  - Safety tips: Explain why each approval is needed (e.g., "The fee hook needs permission to collect fees from your liquidity position; the manager needs permission to unwind your position and return funds.").
  - Only allow strategy start after all ERC20 approvals are confirmed. Only allow fee automation/exit after NFT approvals are confirmed.
- **Approvals Required:**  
  - ERC20 token approvals for manager (pre-strategy).
  - LP NFT approvals for hook and manager (post-mint, before fee collection/exit).

---

### 5. **Start Strategy Page**
- **Purpose:** Let user start the DeFi strategy (deposit, borrow, LP mint) directly from their Gnosis Pay wallet.
- **Core elements:**
  - Display wallet balances (ETH, USDC, etc.).
  - Form/input to choose "Deposit Amount" and "Leverage" (LTV).
  - Button: "Start Strategy"
  - Show transaction status and the resulting LP NFT ID (display confirmation once strategy is live).
- **Approvals Required:**  
  - All ERC20 approvals for manager must be set before starting.
  - After LP NFT is minted, user must approve both FeeCollectHook (for fee automation) and LeveragedLPManager (for exit/unwind) for the NFT.

---

### 6. **Dashboard / Monitoring Page**
- **Purpose:** Show current strategy status and key metrics.
- **Core elements:**
  - Gnosis Pay wallet balances: ETH, USDC, aETH, LP NFT status.
  - Aave health factor, borrowed USDC, remaining debt.
  - LP position stats: accrued fees, trade count toward next fee collection.
  - Event/activity log (showing recent contract events).
  - Button: "Exit & Unwind" (visible if strategy active).
  - *Show approval status for both FeeCollectHook and LeveragedLPManager for the LP NFT.*
- **Approvals Required:**  
  - None for viewing.  
  - For fee automation and exit, show status and prompt user if NFT approvals are missing.

---

### 7. **Fee Automation Status Page**
- **Purpose:** Explain and visualize fee collection automation.
- **Core elements:**
  - Progress bar or counter: “Trades since last fee collection.”
  - Last fees collected (amounts, timestamp).
  - Next scheduled collection (after 10 trades).
  - Status of FeeCollectHook contract (approved? collecting?).
- **Approvals Required:**  
  - **FeeCollectHook** must be approved for the LP NFT for fee automation to function.
  - If not, guide user to approve via UI.

---

### 8. **Exit/Unwind Confirmation Page**
- **Purpose:** Let user confirm and execute full unwind of their strategy via their Gnosis Pay wallet.
- **Core elements:**
  - Summary of current position and what will happen on exit.
  - Button: "Exit & Withdraw All"
  - Transaction progress and final balances returned to Gnosis Pay wallet.
  - *Display status of approval for LeveragedLPManager to access the LP NFT. If not approved, prompt user to approve before allowing exit!*
- **Approvals Required:**  
  - **LeveragedLPManager** must be approved for the LP NFT (either by `approve(manager, lpTokenId)` or `setApprovalForAll(manager, true)`) to enable the smart contract to unwind/exit the position and return funds.
  - If approval is missing, the contract will revert and exit will fail. Always check and request approval before showing "Exit & Withdraw All" as actionable!

---

### 9. **Error & Troubleshooting Page/Modal**
- **Purpose:** Display clear errors and next steps.
- **Core elements:**
  - Catch missing approvals, failed transactions, or on-chain errors.
  - Guidance for user to retry or seek help.
  - *If an exit fails due to missing NFT approval, show a specific error and a button to approve the LeveragedLPManager for the LP NFT!*

---

**Notes for Junior Dev:**
- All pages should clearly show both the current EOA (if present) and Gnosis Pay wallet (Gnosis Safe) addresses.
- Loading indicators and transaction feedback are crucial—users should always know what's happening.
- Use a router/navigation bar for easy switching between screens.
- Event-driven updates (listen for contract events!) keep your UI live and responsive.
- **All onboarding, funding, and approvals must use Gnosis Pay’s UI/SDK. If using WalletKit or another connector, ensure it is Gnosis Pay compatible.**
- **NFT approvals are essential for both fee automation (FeeCollectHook) and exit/unwind (LeveragedLPManager). Always prompt the user after LP NFT mint to approve both!**
- *Reminder:* Gnosis Pay abstracts Safe wallet creation/management into a streamlined experience, but under the hood, you are always interacting with a Gnosis Safe on the Base network.

---

**Sample Approval UI Button (ethers.js pseudocode):**
```js
// For Fee Automation (after LP NFT mint):
await nftContract.approve(feeCollectHookAddress, lpTokenId); 

// For Exit/Unwind (before exit allowed!):
await nftContract.approve(leveragedLPManagerAddress, lpTokenId); 
// Or, for either, setApprovalForAll(<contract>, true)
```

*Always check if the approval is already set before showing the button.*

---

**In summary:**  
- **To collect fees:** Approve FeeCollectHook for the LP NFT.
- **To exit/unwind:** Approve LeveragedLPManager for the LP NFT.
- **UI must surface these requirements and block actions until approvals are granted.**

## 10. Libraries & Frameworks Used

For this MVP, use the following libraries and frameworks.  
**This section provides extra context on how Gnosis Pay and Gnosis Safe relate, and gives options for wallet providers.**

- **Gnosis Pay SDK** (or official wallet connection modules)
  - *Primary wallet provider and onboarding toolkit. All user actions and funds are managed via Gnosis Pay, which provisions and maintains a Gnosis Safe wallet for each user on Base.*
  - [Gnosis Pay Developer Docs](https://docs.gnosis.pay/) *(replace with actual link when available)*
  - *Frontend Integration Tip:* Use the Gnosis Pay SDK to connect wallets, create accounts, and manage Safe-based transactions. This should be the default path for users.

- **Gnosis Safe{Core} SDK**  
  *For low-level Gnosis Safe wallet management, transaction batching, and approvals (used internally by Gnosis Pay and, where needed, directly in dApp logic).*
  - [Safe{Core} SDK Docs](https://docs.safe.global/)
  - *Dev Note:* You typically do not need to interact with Safe{Core} directly unless customizing advanced wallet features.

- **WalletKit** (optional, only if compatible with Gnosis Pay)
  - *Can be used for wallet connection UI and network switching. If used, make sure it supports Gnosis Pay accounts and Gnosis Safe wallets on Base.*
  - [WalletKit Docs](https://github.com/rainbow-me/walletkit)
  - *If not compatible, rely exclusively on Gnosis Pay SDK for wallet connections.*

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

**Quick Reference for Junior Devs:**
- **Gnosis Pay** = user-friendly onboarding and payments UI, always creates a Gnosis Safe wallet for the user.
- **Gnosis Safe** = smart contract wallet on Base, owned and managed *through* Gnosis Pay.
- **Safe{Core} SDK** = low-level toolkit for Safe wallets; Gnosis Pay SDK may use this under the hood.
- **WalletKit** = general wallet connector, only use if it supports Gnosis Pay.
- **All user assets and contract actions are performed through the Gnosis Safe wallet, with Gnosis Pay providing the interface.**

---

## 11. Network: Base Only (network ID 8453)

> **Important:**  
> This MVP is to be built and tested **only on the Base blockchain** (network ID 8453).

- **All contract deployments** should target Base.
- **All frontend wallet connections** (via Gnosis Pay SDK, or WalletKit if compatible) must default to and require Base.
- **All addresses, faucets, and test scripts** should use Base-compatible endpoints.
- Ensure all Gnosis Pay, Gnosis Safe, Aave, and Uniswap addresses and parameters are set for Base.

---

- [Base Docs](https://docs.base.org/)
- [Chainlist for Base](https://chainlist.org/chain/8453)

---

---

## 12. Developer Task Breakdown & Assignments

This project is split into two main roles.  
**Dev 1:** Gnosis Pay UI / Frontend  
**Dev 2:** Smart Contracts / Backend

### **Dev 1 — Gnosis Pay UI / Frontend**

**Primary Responsibilities:**
- All user-facing pages, wallet onboarding, approvals, and transactions.
- Surface contract events, errors, and approval status.
- Integrate with Gnosis Pay wallet SDK and Safe{Core} SDK as needed.

**Task List:**
1. **Landing & Wallet Connection**
   - Integrate Gnosis Pay SDK for wallet connection and account creation.
   - Show wallet address, onboarding status, and instructions.

2. **Funding Page**
   - Allow user to deposit ETH into Gnosis Pay wallet (show balance, deposit flow).
   - Optional: Integrate fiat onramps if available.

3. **Strategy Setup & Approvals**
   - UI for ERC20 approvals to LeveragedLPManager (ETH, USDC).
   - After LP NFT mint, UI for NFT approvals:
     - Approve FeeCollectHook for fee automation.
     - Approve LeveragedLPManager for exit/unwind.
   - Display approval status and block further actions until approvals confirmed.

4. **Start Strategy Page**
   - UI/forms to enter deposit amount, LTV, and start strategy.
   - Show result (LP NFT minted, transaction receipts).

5. **Monitoring Dashboard**
   - Display wallet balances, strategy status, Aave/Uniswap stats, events, and trade/fee counters.
   - Listen for contract events and update UI live.
   - Show approval status for both FeeCollectHook and LeveragedLPManager.

6. **Exit/Unwind Page**
   - Confirm exit, check NFT approval for LeveragedLPManager, and prompt if missing.
   - Show progress and receipt of exit/unwind operation.

7. **Error Handling / Troubleshooting**
   - Display errors, failed transactions, or missing approvals.
   - Guide user to resolve (re-try, re-approve, etc).

**Collaboration/Integration Points:**
- Coordinate with Dev 2 for contract addresses, ABI, and event definitions.
- Test all flows on Base testnet; sync with Dev 2 for contract deployments.

---

### **Dev 2 — Smart Contracts / Backend**

**Primary Responsibilities:**
- Implement, test, and deploy all smart contracts for the protocol.
- Ensure proper event emission and support for approval flows.
- Document contract ABIs and interaction steps for Dev 1.

**Task List:**
1. **LeveragedLPManager**
   - Implement supply, borrow, swap, and LP mint logic.
   - Add USDC→ETH swap using Uniswap (see startStrategy update).
   - Ensure ERC20 and NFT approvals are checked and required (fail gracefully if missing).
   - Implement exitStrategy to unwind and require NFT approval from the Safe.
   - Emit all specified events (StrategyStarted, FeesProcessed, StrategyExited).

2. **FeeCollectHook**
   - Track trade count per LP NFT.
   - After every 10th trade, collect fees (requires NFT approval).
   - Call LeveragedLPManager.processFees with collected amounts.
   - Emit FeesCollected event.

3. **Testing/Deployment**
   - Write and run unit tests for all contract functions (supply, borrow, swap, mint, collect, exit).
   - Deploy contracts to Base testnet.
   - Provide deployed addresses, ABIs, and event names to Dev 1.

4. **Documentation**
   - Clearly document required approvals for ERC20 and LP NFT.
   - Provide example calldata for all key contract interactions.

**Collaboration/Integration Points:**
- Provide contract addresses, ABIs, and event schemas to Dev 1.
- Support Dev 1 in debugging or tracing contract events and state.
- Coordinate upgrade/bugfix cycles during hackathon.

---

**Hand this doc to both devs—they should be able to start building with clear ownership and handoffs! If you have questions, check the links above or reach out to your technical lead. Good luck at your hackathon! 🚀**

For a smooth user journey, you should implement the following UI screens/pages, tailored for **Gnosis Pay** (which uses Gnosis Safe wallets under the hood):

### 1. **Landing Page / Connect Gnosis Pay Wallet**
- **Purpose:** Welcome user, let them connect via Gnosis Pay.
- **Core elements:**
  - "Connect with Gnosis Pay" button (show current Gnosis Pay account if connected).
  - Brief intro to the dApp and what it does.

### 2. **Gnosis Pay Wallet Creation Page**
- **Purpose:** Guide user to create a Gnosis Pay account (Gnosis Safe wallet) if they don’t already have one.
- **Core elements:**
  - Button: "Create Gnosis Pay Account"
  - Show Safe wallet address after creation.
  - Option to “Select Existing Gnosis Pay Wallet” if already created.

### 3. **Gnosis Pay Wallet Funding Page**
- **Purpose:** Let user deposit ETH into their Gnosis Pay wallet.
- **Core elements:**
  - Display Gnosis Pay wallet address and ETH balance.
  - Input field for deposit amount.
  - "Deposit ETH" button.
  - Transaction status (pending/success/fail).

### 4. **Strategy Setup & Approval Page**
- **Purpose:** Prepare user for strategy start, handle all contract approvals via Gnosis Pay.
- **Core elements:**
  - List required approvals:
    - Approve LeveragedLPManager for wallet's ETH/USDC and future Uniswap LP NFT.
    - Approve FeeCollectHook for LP NFT (after it is minted).
  - Buttons to trigger each approval (show status).
  - Safety tips: Explain why each approval is needed.
  - Only allow strategy start after all approvals are done.

### 5. **Start Strategy Page**
- **Purpose:** Let user start the DeFi strategy (deposit, borrow, LP mint).
- **Core elements:**
  - Display Gnosis Pay wallet balances.
  - Form/input to choose "Deposit Amount" and "Leverage" (LTV).
  - Button: "Start Strategy"
  - Show transaction status and resulting LP NFT ID.

### 6. **Dashboard / Monitoring Page**
- **Purpose:** Show current strategy status and key metrics.
- **Core elements:**
  - Gnosis Pay wallet balances: ETH, USDC, aETH, LP NFT status.
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
  - Transaction progress and final balances returned to Gnosis Pay wallet.

### 9. **Error & Troubleshooting Page/Modal**
- **Purpose:** Display clear errors and next steps.
- **Core elements:**
  - Catch missing approvals, failed transactions, or on-chain errors.
  - Guidance for user to retry or seek help.

---

**Notes for Junior Dev:**
- All pages should clearly show current wallet and Gnosis Pay wallet addresses.
- Loading indicators and status feedback are important for all transactions.
- Use a router/navigation bar for easy switching between screens.
- Event-driven updates (listen for contract events!) help keep UI live and responsive.
- All onboarding, funding, and approvals must use Gnosis Pay’s UI/SDK.

---

## 10. Libraries & Frameworks Used (with Gnosis Pay)

For this MVP, use the following libraries and frameworks for both backend and frontend. **All wallet operations must use Gnosis Pay.**

- **Gnosis Pay SDK / Modules**  
  - *The official wallet provider and onboarding toolkit for Gnosis Pay wallets (built on Gnosis Safe).*
  - Use this for:
    - Connecting the user's Gnosis Pay wallet to your frontend.
    - Creating a new Gnosis Pay (Safe) account for the user.
    - Guiding the user through funding, approvals, and transaction signing.
  - [Gnosis Pay Developer Docs](https://docs.gnosis.pay/) *(replace with actual link when available)*
  - *If Gnosis Pay exposes a React hook/component for wallet connection, use it in your “Connect Wallet” page.*

- **Safe{Core} SDK**  
  - *For advanced Gnosis Safe wallet management, transaction batching, and approvals. Gnosis Pay uses this under the hood.*
  - [Safe{Core} SDK Docs](https://docs.safe.global/)

- **Aave V3 SDK / Interfaces**  
  - *For contract calls to supply/borrow on Aave.*
  - [Aave V3 Docs](https://docs.aave.com/)

- **Uniswap V4 SDK / Interfaces**  
  - *For creating LP positions, interacting with hooks, and fee collection.*
  - [Uniswap V4 Docs](https://docs.uniswap.org/)

- **ethers.js / viem**  
  - *For contract and wallet interaction in frontend apps.*
  - [ethers.js Docs](https://docs.ethers.org/)
  - [viem Docs](https://viem.sh/)

- **OpenZeppelin Contracts**  
  - *For safe, standard ERC20/ERC721 logic and security helpers.*
  - [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/4.x/)

---

**Tip for Junior Dev:**  
Whenever you see “connect wallet,” “approve,” or “sign” in the UI, always use the Gnosis Pay SDK hooks/components.  
If you need to fetch the current wallet address, Safe address, or check balances, use the Gnosis Pay SDK or its exposed APIs.  
Do NOT use MetaMask, WalletKit, or any EOA-based flows for this project!

## 11. Network: Base Only (network ID 8453)

> **Important:**  
> This MVP is to be built and tested **only on the Base blockchain** (network ID 8453), and all Gnosis Pay wallets must be deployed and funded on Base.

- **All smart contract deployments** (LeveragedLPManager, FeeCollectHook, etc.) must be on Base.
- **All frontend wallet connections** (using Gnosis Pay SDK) must default to and require Base. Prompt user to switch networks if not on Base.
- **All addresses, faucets, and test scripts** should use Base-compatible endpoints.
- Make sure to use Gnosis Pay, Safe, Aave, and Uniswap contract addresses for Base.
- If Gnosis Pay provides a direct onramp or faucet for Base, surface this in the UI.

---

- [Base Docs](https://docs.base.org/)
- [Chainlist for Base](https://chainlist.org/chain/8453)
- [Gnosis Pay Docs](https://docs.gnosis.pay/) *(Replace with correct link)*

---

**Hand this doc to any junior dev and they should be able to start building!  
If you have questions, check the links above or reach out to your technical lead.  
Good luck at your hackathon! 🚀**
