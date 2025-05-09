# Deployment Guide for DeFi Safe Leveraged LP

This guide will walk you through the process of deploying the LeveragedLPManager and FeeCollectHook contracts to the Base network.

## Prerequisites

1. Make sure you have Foundry installed and set up
2. Ensure your `.env` file contains:
   - `PRIVATE_KEY`: Your private key for deployment
   - `BASE_RPC_URL`: The RPC URL for the Base network

## Deployment Steps

### 1. Deploy the FeeCollectHook Contract

First, deploy the FeeCollectHook contract with a temporary manager address:

```bash
forge create --rpc-url ${BASE_RPC_URL} --private-key ${PRIVATE_KEY} src/FeeCollectHook.sol:FeeCollectHook --constructor-args 0x0000000000000000000000000000000000000000 0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 0x4200000000000000000000000000000000000006
```

Take note of the deployed contract address.

### 2. Deploy the LeveragedLPManager Contract

Next, deploy the LeveragedLPManager contract with the FeeCollectHook address:

```bash
forge create --rpc-url ${BASE_RPC_URL} --private-key ${PRIVATE_KEY} src/LeveragedLPManager.sol:LeveragedLPManager --constructor-args 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5 0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 0x4200000000000000000000000000000000000006 HOOK_ADDRESS 0x2626664c2603336E57B271c5C0b26F421741e481 3000
```

Replace `HOOK_ADDRESS` with the address of the FeeCollectHook contract you deployed in step 1.

### 3. Update the FeeCollectHook with the Manager Address

Now, call the `transferOwnership` function on the FeeCollectHook to set the LeveragedLPManager as the owner:

```bash
cast send --rpc-url ${BASE_RPC_URL} --private-key ${PRIVATE_KEY} HOOK_ADDRESS "transferOwnership(address)" MANAGER_ADDRESS
```

Replace `HOOK_ADDRESS` with the address of the FeeCollectHook contract and `MANAGER_ADDRESS` with the address of the LeveragedLPManager contract.

### 4. Authorize the Uniswap V4 Pool

Finally, authorize the Uniswap V4 pool to use the hook:

```bash
cast send --rpc-url ${BASE_RPC_URL} --private-key ${PRIVATE_KEY} HOOK_ADDRESS "setPoolAuthorization(address,bool)" POOL_ADDRESS true
```

Replace `HOOK_ADDRESS` with the address of the FeeCollectHook contract and `POOL_ADDRESS` with the address of the Uniswap V4 pool.

## Verification

After deployment, you can verify the contracts on the Base block explorer:

```bash
forge verify-contract --chain-id 8453 --watch MANAGER_ADDRESS src/LeveragedLPManager.sol:LeveragedLPManager
forge verify-contract --chain-id 8453 --watch HOOK_ADDRESS src/FeeCollectHook.sol:FeeCollectHook
```

Replace `MANAGER_ADDRESS` and `HOOK_ADDRESS` with the addresses of the deployed contracts.

## Testing the Deployment

You can test the deployment using the TestEndToEnd.js script:

1. Update the contract addresses in the script:
   - Open `script/TestEndToEnd.js`
   - Set `leveragedLPManager` to the address of the deployed LeveragedLPManager contract

2. Run the end-to-end test:
   ```bash
   npm run test:e2e
   ```

## Troubleshooting

If you encounter any issues during deployment:

1. Check that your RPC URL is correct and accessible
2. Ensure you have enough ETH in your wallet for gas fees
3. Verify that the contract addresses used in the constructor arguments are correct
4. Check the Base block explorer for transaction details if a transaction fails
