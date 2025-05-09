# DeFi Hackathon Prototype Specification

**Project Name**: Automated DeFi Yield Generator with Safe Wallet Integration  
**Purpose**: A DeFi prototype that automates yield generation by collateralizing ETH on Aave V3, borrowing USDC, providing liquidity on Uniswap V4 with a custom hook, and reinvesting fees, using Safe wallets to secure user funds.  
**Target Audience**: Hackathon judges and potential users; focus on demonstrating Safe wallet integration with core DeFi mechanics.  
**Timeframe**: Hackathon duration (limited time); prioritize minimal viable functionality.

## 1. Overview of the DeFi Application
- **Purpose**: Automate yield generation using Safe wallets for user funds security, leveraging Aave V3 for lending/borrowing and Uniswap V4 for liquidity provision with custom hooks.
- **Core Workflow**: 
  1. User creates a 1/1 Safe wallet via Safe EVM SDK.
  2. User deposits ETH into their Safe wallet.
  3. Our smart contract, acting on behalf of the Safe, automates:
     - Depositing ETH as collateral on Aave V3.
     - Borrowing USDC.
     - Creating a full-range USDC/ETH liquidity position on Uniswap V4 (LP NFT held by Safe wallet).
     - Collecting fees on every 10th trade via a hook.
     - Repaying USDC loan on Aave and adding remaining ETH as collateral.

## 2. System Components (Minimal Implementation with Safe Focus)
- **Safe Wallet Integration**: 
  - Use Safe’s EVM SDK to create a 1/1 Safe wallet for each user (single owner for simplicity).
  - User deposits ETH directly into their Safe wallet.
  - Our smart contract is authorized to act on behalf of the Safe wallet (e.g., via a pre-approved module or transaction batch setup during wallet creation).
  - Safe wallet holds all user funds (ETH, borrowed USDC, etc.) and the Uniswap V4 LP NFT position; our contract never custodially holds funds or NFTs.
- **Aave V3 Integration**: 
  - On behalf of the Safe wallet, deposit ETH as collateral and borrow USDC at a fixed, conservative loan-to-value (LTV) ratio (e.g., 50%) to minimize liquidation risk.
  - Borrowed USDC is sent to the Safe wallet for further actions.
- **Uniswap V4 Integration**: 
  - On behalf of the Safe wallet, create a full-range liquidity position for the USDC/ETH pair using borrowed USDC and a portion of deposited ETH (if needed for balance).
  - Resulting LP NFT is owned by the Safe wallet.
  - Implement a basic hook to count trades and collect fees on the 10th trade, with fees returned to the Safe wallet.
- **Fee Reinvestment Logic**: 
  - On fee collection, use fees held in the Safe wallet to repay part of the USDC loan on Aave.
  - If excess fees remain, convert to ETH (via Uniswap) and deposit as additional collateral on Aave, all on behalf of the Safe wallet.

## 3. Key Functional Requirements (Simplified)
- **Wallet Creation and Initial Deposit**: 
  - User creates a 1/1 Safe wallet using Safe’s EVM SDK (via app frontend or direct interaction).
  - User deposits ETH into their Safe wallet.
  - Our smart contract is granted permission to act on behalf of the Safe (e.g., via a pre-approved module or delegate during setup).
- **Collateral and Borrowing**: 
  - Smart contract, acting for the Safe, deposits ETH from the Safe wallet to Aave V3 and borrows USDC, which is returned to the Safe wallet.
- **Liquidity Provision and Hook**: 
  - Smart contract sets up a full-range USDC/ETH liquidity position on Uniswap V4 using funds from the Safe wallet.
  - LP NFT is owned by the Safe wallet.
  - Hook counts trades and triggers fee collection on the 10th trade, with fees sent to the Safe wallet.
- **Fee Collection and Reinvestment**: 
  - On fee collection, repay USDC loan using funds from the Safe wallet; if excess, swap to ETH and deposit to Aave as collateral, all executed on behalf of the Safe wallet.
- **Position Closing (Single Transaction)**: 
  - User triggers a full unwind via a single transaction.
  - Smart contract, acting on behalf of the Safe wallet, executes:
    1. Withdraws liquidity from Uniswap V4 (returning USDC and ETH to Safe wallet).
    2. Repays the USDC loan on Aave using available USDC from Safe wallet (if insufficient, swaps ETH to USDC via Uniswap to cover remainder).
    3. Retrieves remaining ETH collateral from Aave to Safe wallet.
    4. Ensures all funds remain in the user’s Safe wallet.
  - Transaction reverts if any step fails.

## 4. Edge Cases and Risk Mitigation (Minimal for Prototype)
- **Borrowing Rate Exceeding Fees**: Ignored for prototype; system continues to accrue debt if fees are insufficient. Noted as a future improvement.
- **Liquidation Risk on Aave**: Use conservative LTV (e.g., 50%) to minimize risk; no active monitoring or adjustment.
- **Impermanent Loss on Uniswap**: Not addressed in prototype; assume user accepts risk for demo purposes.
- **Position Closing Failures**: Single transaction unwind risks reversion if any step fails (e.g., Uniswap swap slippage). No fallback for prototype; noted as future improvement.

## 5. Data Tracking and Analytics (Bare Minimum with Events)
- **Profit/Loss Reporting**: 
  - Display current position value (ETH collateral on Aave + Uniswap position value - outstanding USDC loan) via a simple contract query or frontend display tied to the Safe wallet.
  - No historical data tracking in prototype.
- **Event Emissions for Future Tracking**: 
  - Smart contract must emit events for key actions to enable off-chain historical data collection later. Events to implement:
    - `UserDeposit(address safeWallet, uint256 ethAmount)` - When user deposits ETH into Safe.
    - `CollateralDeposited(address safeWallet, uint256 ethAmount)` - When ETH is deposited to Aave.
    - `USDCLoanBorrowed(address safeWallet, uint256 usdcAmount)` - When USDC is borrowed on Aave.
    - `LiquidityPositionCreated(address safeWallet, uint256 positionId, uint256 usdcAmount, uint256 ethAmount)` - When Uniswap V4 position is created.
    - `FeesCollected(address safeWallet, uint256 usdcAmount, uint256 ethAmount, uint256 tradeCount)` - When fees are collected on 10th trade.
    - `LoanRepaid(address safeWallet, uint256 usdcAmount)` - When USDC loan is partially or fully repaid.
    - `PositionClosed(address safeWallet, uint256 ethReturned, uint256 usdcReturned)` - When position is unwound.
- **Historical Data (e.g., Rates via Ratehopper.ai)**: Not implemented due to time constraints; placeholder for future integration using emitted events as data source.

## 6. Technical Considerations (Hackathon Focus with Safe SDK)
- **Smart Contract**: 
  - Written in Solidity for Ethereum.
  - Leverage Safe’s EVM SDK for wallet creation and transaction execution on behalf of the Safe.
  - Use existing libraries/interfaces for Aave V3 and Uniswap V4 to save time (e.g., OpenZeppelin for ERC20 interactions, official Aave/Uniswap interfaces).
- **Safe Wallet Interaction**: 
  - Implement logic to propose and execute transactions via the Safe wallet (e.g., using Safe’s transaction batching or module system if supported in SDK for automation).
  - For hackathon simplicity, assume user pre-approves our contract as a delegate or module during wallet setup.
  - Ensure contract never holds funds or LP NFTs; all assets remain in Safe wallet.
- **Gas Optimization**: Minimal focus; prioritize functionality. Note that single-transaction unwind may incur high gas costs.
- **Security**: 
  - Basic checks (e.g., reentrancy guards using OpenZeppelin’s `ReentrancyGuard`).
  - Ensure Safe wallet permissions are tightly scoped to our contract actions.
  - No full audit due to time limits.
- **Testing**: 
  - Deploy on testnet (e.g., Sepolia).
  - Minimal unit tests for core functions (Safe wallet creation, deposit, borrow, liquidity provision, fee collection, unwind).
  - Use testnet faucets for ETH/USDC if needed.

## 7. User Experience (Basic)
- **Interaction**: 
  - Simple UI or direct contract calls for Safe wallet creation, ETH deposit into Safe, and triggering position closing (unwind).
  - UI can be minimal (e.g., Hardhat scripts or a basic React frontend if time permits).
- **Transparency**: 
  - Display current position value tied to the user’s Safe wallet (no historical data or detailed analytics for now).
  - Query contract for position value or display via UI if implemented.

## 8. Sample Code Placeholders
Below are placeholders for key smart contract components. Developers should replace these with actual implementations using Safe SDK, Aave V3, and Uniswap V4 interfaces. Focus on functionality over optimization for hackathon.

### 8.1. Smart Contract Skeleton (Solidity)
```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
// TODO: Import Safe SDK interfaces for wallet interaction
// TODO: Import Aave V3 interfaces for lending/borrowing
// TODO: Import Uniswap V4 interfaces for liquidity provision and hooks

contract DeFiYieldGenerator is ReentrancyGuard {
    // Mapping of user to their Safe wallet address
    mapping(address => address) public userSafeWallets;

    // Events for historical tracking
    event UserDeposit(address indexed safeWallet, uint256 ethAmount);
    event CollateralDeposited(address indexed safeWallet, uint256 ethAmount);
    event USDCLoanBorrowed(address indexed safeWallet, uint256 usdcAmount);
    event LiquidityPositionCreated(address indexed safeWallet, uint256 positionId, uint256 usdcAmount, uint256 ethAmount);
    event FeesCollected(address indexed safeWallet, uint256 usdcAmount, uint256 ethAmount, uint256 tradeCount);
    event LoanRepaid(address indexed safeWallet, uint256 usdcAmount);
    event PositionClosed(address indexed safeWallet, uint256 ethReturned, uint256 usdcReturned);

    // TODO: Add constructor to initialize Aave/Uniswap addresses

    // Function to create Safe wallet for user (via Safe SDK)
    function createSafeWallet() external {
        // TODO: Implement Safe wallet creation (1/1) using Safe EVM SDK
        // TODO: Store Safe wallet address in userSafeWallets mapping
        // TODO: Set up pre-approval for this contract to act on behalf of Safe
    }

    // Function to deposit ETH and start DeFi strategy
    function depositAndStart() external payable nonReentrant {
        address safeWallet = userSafeWallets[msg.sender];
        require(safeWallet != address(0), "Safe wallet not created");
        // TODO: Verify ETH is in Safe wallet
        emit UserDeposit(safeWallet, msg.value);
        // TODO: Call internal functions to deposit to Aave, borrow USDC, etc.
    }

    // Function to close position (single transaction)
    function closePosition() external nonReentrant {
        address safeWallet = userSafeWallets[msg.sender];
        require(safeWallet != address(0), "Safe wallet not created");
        // TODO: Withdraw liquidity from Uniswap V4 to Safe wallet
        // TODO: Repay USDC loan on Aave using funds from Safe wallet
        // TODO: Retrieve ETH collateral from Aave to Safe wallet
        // TODO: Emit PositionClosed event
    }

    // TODO: Implement Uniswap V4 hook logic for fee collection on 10th trade
    // TODO: Implement reinvestment logic (repay loan, deposit collateral)
}

### 8.2. Frontend Interaction (Optional, if time permits)

// TODO: Basic JavaScript/React code to interact with contract
// Example using ethers.js (placeholder)
async function createSafeWallet() {
    // TODO: Connect to user's wallet (e.g., MetaMask)
    // TODO: Call contract.createSafeWallet() to create 1/1 Safe
}

async function depositETH(amount) {
    // TODO: Send ETH to user's Safe wallet via contract.depositAndStart()
}

async function closePosition() {
    // TODO: Call contract.closePosition() to unwind
}

### 9. Development Priorities (Hackathon Focus)
Given time constraints, prioritize in this order:

- Safe Wallet Integration: Create 1/1 Safe wallet using Safe EVM SDK; ensure contract acts on behalf of Safe without holding funds.
- Core DeFi Workflow: Implement deposit to Aave, borrow USDC, create Uniswap V4 liquidity position (USDC/ETH pair).
- Uniswap V4 Hook: Basic hook to collect fees on every 10th trade.
- Position Closing: Single transaction unwind (withdraw, repay, return funds to Safe).
- Event Emissions: Ensure all specified events are emitted for future tracking.
- Basic Reporting: Display current position value (no historical data).
- Skip gas optimization, advanced error handling, or historical data tracking for now.

### 10. Testing and Deployment
- Testnet: Deploy on Sepolia or similar Ethereum testnet.
- Unit Tests: Minimal tests for core functions (use Hardhat/Truffle for quick setup).
- Test Safe wallet creation and permission setup.
- Test deposit/workflow (Aave deposit, borrow, Uniswap position).
- Test fee collection via hook.
- Test position closing.
- Tools: Use Hardhat for development/testing; Remix if faster for hackathon.

### 11. Future Improvements (Post-Hackathon)
- Address borrowing rate exceeding fees (e.g., pause mechanism if debt grows).
- Implement historical data tracking using emitted events.
- Integrate tools like Ratehopper.ai for rate history.
- Add user controls for manual interventions (e.g., add collateral).
- Enhance error handling for unwind transaction failures.
- Optimize gas costs and conduct security audits.

### 12. Deliverables for Hackathon
- Smart Contract: Deployed on testnet with core functionality (deposit, workflow, fee collection, unwind).
- Minimal UI or Scripts: Basic interaction for wallet creation, deposit, and closing (UI optional if time-constrained; Hardhat scripts acceptable).
- Demo: Show user flow (create Safe, deposit ETH, see position value, close position).
- Documentation: This spec + any developer notes on deployment/testing.

### 13. Resources
- Safe EVM SDK: Refer to Safe documentation for wallet creation and transaction execution (https://docs.safe.global/).
- Aave V3: Use official Aave docs for lending/borrowing interfaces (https://docs.aave.com/).
- Uniswap V4: Use Uniswap docs for liquidity provision and hooks (check latest V4 resources; may be in preview).
- Testnet Funds: Use Sepolia faucets for ETH/USDC.
- Contact: For questions during development, reach out to the product manager (you) for clarification on requirements or prioritization.

