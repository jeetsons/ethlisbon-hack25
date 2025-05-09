# DeFi Safe Leveraged LP - Smart Contracts

This repository contains the smart contracts for the DeFi Safe Leveraged LP project, a hackathon implementation that uses Gnosis Pay (Gnosis Safe), Aave V3, and Uniswap V4 on the Base chain.

## Project Overview

The DeFi Safe Leveraged LP project allows users to:
1. Create a Gnosis Pay wallet (Gnosis Safe)
2. Deposit ETH
3. Use a smart contract to automate:
   - Supplying ETH as collateral to Aave V3
   - Borrowing USDC
   - Creating a full-range USDC/ETH liquidity position on Uniswap V4
   - Using a Uniswap V4 hook to automate fee collection and debt repayment

## Smart Contracts

### LeveragedLPManager.sol

The main contract that manages the leveraged LP strategy:
- Handles deposits, borrowing, and LP creation
- Processes fees collected by the hook
- Manages strategy exit/unwinding

#### Recent Improvements (May 2025)

1. **Storage Optimization**:
   - Simplified the UserPosition struct by removing unnecessary fields
   - Reduced gas costs and potential state inconsistencies
   - Position activity now determined by checking if safe address is non-zero

2. **Direct Protocol Integration**:
   - Added direct queries to Aave for user debt and collateral data
   - Added direct queries to Uniswap for position liquidity
   - Ensures accurate accounting even when users interact directly with protocols

3. **Bug Fixes**:
   - Fixed a critical bug in token collection during strategy exit
   - Now properly accounts for tokens from both decreaseLiquidity and collect operations
   - Ensures users receive all their funds when exiting a strategy

4. **User Control**:
   - Added a swapEthForDebt parameter to exitStrategy function
   - Gives users control over whether to swap ETH for USDC to repay remaining debt
   - Provides flexibility for different debt management preferences

### FeeCollectHook.sol

A Uniswap V4 hook that:
- Tracks trades per LP position
- On every 10th trade, collects fees from the LP NFT
- Forwards fees to LeveragedLPManager for processing

## Development Tools

This project uses Foundry, a blazing fast toolkit for Ethereum application development:

- **Forge**: Testing framework for smart contracts
- **Cast**: CLI for interacting with EVM smart contracts
- **Anvil**: Local Ethereum node for development

## Getting Started

### Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation)

### Installation

```shell
# Clone the repository
git clone <repository-url>
cd ethlisbon-hack25/contracts

# Install dependencies
forge install
```

### Build

```shell
forge build
```

### Test

```shell
forge test
```

### Deploy to Base Network

```shell
# Set environment variables
export BASE_RPC_URL=<your-base-rpc-url>
export PRIVATE_KEY=<your-private-key>

# Deploy contracts
forge script script/Deploy.s.sol:DeployScript --rpc-url $BASE_RPC_URL --broadcast --verify
```

## Usage Guide

### Starting a Strategy

To start a leveraged LP strategy:

```solidity
// Safe address must approve LeveragedLPManager for ETH transfer first
function startStrategy(
    address safe,          // Gnosis Safe wallet address
    uint256 ethAmount,     // Amount of ETH to supply as collateral
    uint256 ltv,           // Loan-to-value ratio (1-75)
    uint16 slippageBps     // Slippage tolerance in basis points (e.g., 50 = 0.5%)
) external nonReentrant
```

### Processing Fees

Fees are automatically collected by the FeeCollectHook and processed by:

```solidity
// Only callable by the FeeCollectHook
function processFees(
    address safe,          // Gnosis Safe wallet address
    uint256 usdcAmount,    // Amount of USDC fees collected
    uint256 ethAmount      // Amount of ETH fees collected
) external nonReentrant
```

### Exiting a Strategy

To exit a strategy and unwind all positions:

```solidity
// Safe address must approve LeveragedLPManager for LP NFT transfer first
function exitStrategy(
    address safe,          // Gnosis Safe wallet address
    bool swapEthForDebt    // Whether to swap ETH for USDC to repay remaining debt
) external nonReentrant
```

### Important Notes

1. **Direct Protocol Integration**: The contract now queries Aave and Uniswap directly for user data, ensuring accurate accounting even when users interact directly with these protocols.

2. **Exit Options**: When exiting a strategy, users can choose whether to swap ETH for USDC to repay remaining debt by setting the `swapEthForDebt` parameter.

3. **Token Collection**: The contract properly accounts for all tokens from both decreaseLiquidity and collect operations when exiting a strategy.

## Security Considerations

- All user funds and NFTs remain in the Gnosis Safe wallet at all times
- Contracts only act as operators with explicit approval from the Safe
- The Safe must approve both the LeveragedLPManager and FeeCollectHook for relevant assets/NFTs

### Cast

```shell
$ cast <subcommand>
```

### Help

```shell
$ forge --help
$ anvil --help
$ cast --help
```
