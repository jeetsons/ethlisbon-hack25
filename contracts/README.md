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
