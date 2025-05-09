# End-to-End Testing Script

This directory contains scripts for deploying and testing the DeFi Safe Leveraged LP protocol.

## TestEndToEnd.js

The `TestEndToEnd.js` script provides an end-to-end test of the protocol flow without requiring the UI. It performs the following steps:

1. Creates a new Gnosis Safe wallet
2. Funds the Safe with 0.01 ETH
3. Approves the LeveragedLPManager contract to use WETH
4. Calls the `startStrategy` method on the LeveragedLPManager
5. Retrieves and displays the user's position details

### Prerequisites

Before running the script, you need to install the required dependencies:

```bash
npm install ethers@5.7.2 @safe-global/protocol-kit @safe-global/api-kit
```

### Configuration

Update the following values in the script:

- `leveragedLPManager`: Address of the deployed LeveragedLPManager contract
- `rpcUrl`: RPC URL for the Base network (mainnet or testnet)
- `chainId`: Chain ID (8453 for Base mainnet, 84532 for Base Sepolia)

### Running the Script

You can run the script using the following command:

```bash
npm run test:e2e -- YOUR_PRIVATE_KEY
```

Or you can set the `PRIVATE_KEY` environment variable and run:

```bash
export PRIVATE_KEY=your_private_key_here
npm run test:e2e
```

### Important Notes

- Make sure your account has enough ETH to:
  - Pay for gas fees
  - Fund the Safe with 0.01 ETH
  - Cover any additional transaction costs

- This script is for testing purposes only. In a production environment, you would want to implement proper security measures and error handling.

- The script uses placeholder addresses where needed. Make sure to update these with the actual deployed contract addresses before running.

## Deploy.s.sol

The `Deploy.s.sol` script is used to deploy the LeveragedLPManager and FeeCollectHook contracts to the Base network.

### Running the Deployment

To deploy to Base mainnet:

```bash
npm run deploy:base
```

To deploy to Base Sepolia testnet:

```bash
npm run deploy:base-sepolia
```

Make sure to set up your environment variables in a `.env` file:
```
PRIVATE_KEY=your_private_key_here
BASE_RPC_URL=https://mainnet.base.org
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
```
