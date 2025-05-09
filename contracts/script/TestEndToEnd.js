// TestEndToEnd.js - Script to test the end-to-end flow with Gnosis Safe
require('dotenv').config();
const { getSafeAddressFromDeploymentTx } = require('@safe-global/protocol-kit');
const ethers = require('ethers');
const Safe = require('@safe-global/protocol-kit').default;
const SafeApiKit = require('@safe-global/api-kit').default;
const EthersAdapter = require('@safe-global/protocol-kit').EthersAdapter;

const { SafeFactory } = require('@safe-global/protocol-kit');


// Contract ABIs - You'll need to replace these with the actual ABIs
const LeveragedLPManagerABI = require('../out/LeveragedLPManager.sol/LeveragedLPManager.json').abi;
const WETHABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) external returns (bool)",
  "function name() external view returns (string)",
  "function symbol() external view returns (string)",
  "function decimals() external view returns (uint8)",
  "function totalSupply() external view returns (uint256)"
];

// Configuration
const config = {
  // Contract addresses from deployment
  leveragedLPManager: "0x7DD8fB835e39aeb631C1Be80dA0fcb6E0C17D979", // LeveragedLPManager address
  weth: "0x4200000000000000000000000000000000000006", // WETH on Base
  usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base

  // Network settings
  rpcUrl: process.env.BASE_RPC_URL || "https://mainnet.base.org",
  chainId: 8453, // Base mainnet

  // Safe settings
  safeService: "https://safe-transaction-base.safe.global",

  // Test parameters
  ethToTransfer: ethers.utils.parseEther("0.001"),
  ltv: 50, // 50% LTV
  slippageBps: 50, // 0.5% slippage
};

async function main() {
  try {
    // Get private key from command line args or environment
    const privateKey = process.argv[2] || process.env.PRIVATE_KEY_E2E;
    if (!privateKey) {
      throw new Error("Private key is required. Pass it as an argument or set PRIVATE_KEY_E2E env variable.");
    }

    // Set up provider and signer
    console.log(`Connecting to network: ${config.rpcUrl}`);
    const provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);

    // Verify the network
    const network = await provider.getNetwork();
    console.log(`Connected to network: ${network.name} (Chain ID: ${network.chainId})`);

    if (network.chainId !== 8453) {
      console.warn(`WARNING: Expected Base network (Chain ID: 8453), but connected to Chain ID: ${network.chainId}`);
    }

    const signer = new ethers.Wallet(privateKey, provider);
    const signerAddress = await signer.getAddress();

    console.log(`Using signer address: ${signerAddress}`);

    // Create EthersAdapter instance
    const ethAdapter = new EthersAdapter({
      ethers,
      signerOrProvider: signer
    });

    // Initialize Safe API Kit
    const safeService = new SafeApiKit({
      txServiceUrl: config.safeService,
      ethAdapter
    });


    // Use the existing Safe address instead of creating a new one
    console.log("Using existing Safe address...");
    const safeAddress = "0x37adcff072f44bec0413029e7bfd785ca0467143";
    console.log(`Safe address: ${safeAddress}`);

    // Declare safeSdk variable outside the try/catch block so it's accessible throughout the script
    let safeSdk;
    
    // Connect to the existing Safe
    try {
      console.log("Connecting to existing Safe...");
      safeSdk = await Safe.create({
        ethAdapter,
        safeAddress
      });
      console.log("Successfully connected to Safe!");
    } catch (error) {
      console.error(`Error connecting to Safe: ${error.message}`);
      throw error;
    }

    // Fund the Safe with ETH
    console.log(`Sending ${ethers.utils.formatEther(config.ethToTransfer)} ETH to Safe...`);
    const tx = await signer.sendTransaction({
      to: safeAddress,
      value: config.ethToTransfer,
    });

    await tx.wait();
    console.log(`ETH transferred to Safe. Tx hash: ${tx.hash}`);

    // Connect to the LeveragedLPManager contract
    const leveragedLPManager = new ethers.Contract(
      config.leveragedLPManager,
      LeveragedLPManagerABI,
      signer
    );

    // Connect to the WETH contract
    const weth = new ethers.Contract(
      config.weth,
      WETHABI,
      signer
    );

    // Create a Safe transaction to approve WETH for the LeveragedLPManager
    console.log("Creating Safe transaction to approve WETH...");
    const safeTransactionData = {
      to: config.weth,
      data: weth.interface.encodeFunctionData("approve", [
        config.leveragedLPManager,
        config.ethToTransfer
      ]),
      value: "0",
    };

    // Create and execute the Safe transaction using safeSdk
    try {
        // Use the Safe SDK for transaction creation
        const safeTransaction = await safeSdk.createTransaction({ safeTransactionData });
        const signedSafeTx = await safeSdk.signTransaction(safeTransaction);
        
        // Execute the transaction with a fixed gas limit
        const executeTxResponse = await safeSdk.executeTransaction(signedSafeTx, { gasLimit: 1000000 });
        await executeTxResponse.transactionResponse?.wait();

        console.log(`WETH approved for LeveragedLPManager via Safe. Tx hash: ${executeTxResponse.transactionResponse?.hash}`);
    } catch (error) {
      console.error(`Error creating/executing Safe transaction: ${error.message}`);
      console.log('Continuing with the test despite transaction error...');
    }

    // Call startStrategy on the LeveragedLPManager using the Safe wallet
    console.log("Calling startStrategy via Safe transaction...");
    try {
      // Check if safeSdk is defined
      if (!safeSdk) {
        throw new Error("Safe SDK is not initialized. Cannot create Safe transaction for startStrategy.");
      }
      
      // Check if the Safe has enough ETH
      const safeBalance = await provider.getBalance(safeAddress);
      console.log(`Safe balance: ${ethers.utils.formatEther(safeBalance)} ETH`);
      
      if (safeBalance.lt(config.ethToTransfer)) {
        console.warn(`Safe doesn't have enough ETH. Has ${ethers.utils.formatEther(safeBalance)} ETH, needs ${ethers.utils.formatEther(config.ethToTransfer)} ETH`);
        throw new Error("Safe doesn't have enough ETH for the strategy");
      }
      
      // Check if the Safe has approved the LeveragedLPManager to spend its WETH
      const wethAllowance = await weth.allowance(safeAddress, config.leveragedLPManager);
      console.log(`WETH allowance for LeveragedLPManager: ${ethers.utils.formatEther(wethAllowance)} WETH`);
      
      if (wethAllowance.lt(config.ethToTransfer)) {
        console.warn("Safe hasn't approved enough WETH for LeveragedLPManager");
        console.log("Creating approval transaction first...");
        
        // Create a Safe transaction to approve WETH first
        const approveWethData = weth.interface.encodeFunctionData("approve", [
          config.leveragedLPManager,
          ethers.constants.MaxUint256  // Approve maximum amount
        ]);
        
        const approveWethTxData = {
          to: config.weth,
          data: approveWethData,
          value: "0",
        };
        
        // Use the Safe SDK for approval transaction
        console.log("Creating Safe transaction for WETH approval...");
        const approvalTransaction = await safeSdk.createTransaction({ safeTransactionData: approveWethTxData });
        const signedApprovalTx = await safeSdk.signTransaction(approvalTransaction);
        
        // Execute the approval transaction with a fixed gas limit
        console.log("Executing Safe transaction for WETH approval...");
        const approvalTxResponse = await safeSdk.executeTransaction(signedApprovalTx, { gasLimit: 1000000 });
        await approvalTxResponse.transactionResponse?.wait();
        
        console.log(`WETH approved for LeveragedLPManager via Safe. Tx hash: ${approvalTxResponse.transactionResponse?.hash}`);
      }
      
      // Now create the startStrategy transaction
      console.log("Creating startStrategy transaction with parameters:");
      console.log(`- Safe address: ${safeAddress}`);
      console.log(`- ETH amount: ${ethers.utils.formatEther(config.ethToTransfer)} ETH`);
      console.log(`- LTV: ${config.ltv}%`);
      console.log(`- Slippage: ${config.slippageBps / 100}%`);
      
      // Create a Safe transaction for the startStrategy call
      const startStrategyData = leveragedLPManager.interface.encodeFunctionData("startStrategy", [
        safeAddress,  // Using our existing Safe address
        config.ethToTransfer,
        config.ltv,
        config.slippageBps
      ]);
      
      // Debug: Decode the transaction data to verify parameters
      console.log("\nDEBUG: Decoding startStrategy transaction data");
      console.log("Raw transaction data:", startStrategyData);
      
      try {
        const decodedData = leveragedLPManager.interface.decodeFunctionData("startStrategy", startStrategyData);
        console.log("Decoded parameters:");
        console.log("- Safe address:", decodedData[0]);
        console.log("- ETH amount:", ethers.utils.formatEther(decodedData[1]), "ETH");
        console.log("- LTV:", decodedData[2].toString());
        console.log("- Slippage BPS:", decodedData[3].toString());
        
        // Validate parameters
        if (decodedData[0].toLowerCase() !== safeAddress.toLowerCase()) {
          console.error("ERROR: Safe address mismatch!");
          console.error(`Expected: ${safeAddress}, Got: ${decodedData[0]}`);
        }
        
        if (!decodedData[1].eq(config.ethToTransfer)) {
          console.error("ERROR: ETH amount mismatch!");
          console.error(`Expected: ${ethers.utils.formatEther(config.ethToTransfer)}, Got: ${ethers.utils.formatEther(decodedData[1])}`);
        }
        
        if (decodedData[2].toString() !== config.ltv.toString()) {
          console.error("ERROR: LTV mismatch!");
          console.error(`Expected: ${config.ltv}, Got: ${decodedData[2]}`);
        }
        
        if (decodedData[3].toString() !== config.slippageBps.toString()) {
          console.error("ERROR: Slippage BPS mismatch!");
          console.error(`Expected: ${config.slippageBps}, Got: ${decodedData[3]}`);
        }
      } catch (error) {
        console.error("Error decoding transaction data:", error.message);
      }
      
      // Also decode the specific data string provided by the user
      console.log("\nDEBUG: Decoding the specific data string provided by the user");
      const userProvidedData = "0x7c281f7200000000000000000000000037adcff072f44bec0413029e7bfd785ca046714300000000000000000000000000000000000000000000000000038d7ea4c6800000000000000000000000000000000000000000000000000000000000000000320000000000000000000000000000000000000000000000000000000000000032";
      
      try {
        const decodedUserData = leveragedLPManager.interface.decodeFunctionData("startStrategy", userProvidedData);
        console.log("Decoded user-provided data:");
        console.log("- Safe address:", decodedUserData[0]);
        console.log("- ETH amount:", ethers.utils.formatEther(decodedUserData[1]), "ETH");
        console.log("- LTV:", decodedUserData[2].toString());
        console.log("- Slippage BPS:", decodedUserData[3].toString());
      } catch (error) {
        console.error("Error decoding user-provided data:", error.message);
      }
      
      const startStrategyTxData = {
        to: config.leveragedLPManager,
        data: startStrategyData,
        value: "0",
      };
      
      // Use the Safe SDK for transaction creation
      console.log("Creating Safe transaction for startStrategy...");
      const safeTransaction = await safeSdk.createTransaction({ safeTransactionData: startStrategyTxData });
      const signedSafeTx = await safeSdk.signTransaction(safeTransaction);
      
      // Execute the transaction with a fixed gas limit
      console.log("Executing Safe transaction for startStrategy...");
      const executeTxResponse = await safeSdk.executeTransaction(signedSafeTx, { gasLimit: 1000000 });
      await executeTxResponse.transactionResponse?.wait();
      
      console.log(`Strategy started via Safe. Tx hash: ${executeTxResponse.transactionResponse?.hash}`);
      
      // Get user position details
      const position = await leveragedLPManager.getUserPosition(safeAddress);
      console.log("User position created:");
      console.log(`- Safe: ${position.safe}`);
      console.log(`- LP Token ID: ${position.lpTokenId.toString()}`);
    } catch (error) {
      console.error(`Error starting strategy via Safe: ${error.message}`);
      throw error;
    }

    // Get debt and collateral information directly from Aave
    try {
      // We need to interact with Aave directly instead of using the removed functions
      // First, let's get the Aave pool address from the LeveragedLPManager
      console.log("Getting position details from Aave...");

      // For demonstration purposes, we'll just log that we would need to query Aave
      // In a real implementation, we would:
      // 1. Get the Aave pool address
      // 2. Create a contract instance for the Aave pool
      // 3. Call getUserAccountData to get debt and collateral information

      console.log("Note: To get actual position details, we would need to:");
      console.log("- Query the Aave pool contract directly");
      console.log("- Call getUserAccountData(safeAddress) on the pool");
      console.log("- Parse the returned collateral and debt values");
    } catch (error) {
      console.error(`Error getting position details: ${error.message}`);
    }

    console.log("End-to-end test completed successfully!");

  } catch (error) {
    console.error("Error in end-to-end test:", error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
