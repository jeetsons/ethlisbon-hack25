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
  "function balanceOf(address account) external view returns (uint256)"
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
  ethToTransfer: ethers.utils.parseEther("0.01"),
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


    // Create a new Safe
    console.log("Creating a new Safe...");
    
    const safeDeploymentConfig = {
      saltNonce: Date.now().toString(),
      safeVersion: '1.3.0'
    };

    const safeFactory = await SafeFactory.create({ ethAdapter })

    const safeAccountConfig = {
      owners: [signerAddress],
      threshold: 1,
    }
    
    // 5. Deploy the Safe
    const safeSdk = await safeFactory.deploySafe({ safeAccountConfig })
    
    // 6. Get the address of the newly deployed Safe
    const newSafeAddress = await safeSdk.getAddress()
    console.log('Deployed Safe address:', newSafeAddress)

    // Fund the Safe with ETH
    console.log(`Sending ${ethers.utils.formatEther(config.ethToTransfer)} ETH to Safe...`);
    const tx = await signer.sendTransaction({
      to: newSafeAddress,
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
    
    // Create and execute the Safe transaction
    const safeTransaction = await safeSdkForDeployment.createTransaction({ safeTransactionData });
    const signedSafeTx = await safeSdkForDeployment.signTransaction(safeTransaction);
    const executeTxResponse = await safeSdkForDeployment.executeTransaction(signedSafeTx);
    await executeTxResponse.transactionResponse?.wait();
    
    console.log(`WETH approved for LeveragedLPManager. Tx hash: ${executeTxResponse.transactionResponse?.hash}`);
    
    // Call startStrategy on the LeveragedLPManager
    console.log("Calling startStrategy...");
    const startStrategyTx = await leveragedLPManager.startStrategy(
      newSafeAddress,
      config.ethToTransfer,
      config.ltv,
      config.slippageBps
    );
    
    await startStrategyTx.wait();
    console.log(`Strategy started. Tx hash: ${startStrategyTx.hash}`);
    
    // Get user position details
    const position = await leveragedLPManager.getUserPosition(newSafeAddress);
    console.log("User position created:");
    console.log(`- Safe: ${position.safe}`);
    console.log(`- LP Token ID: ${position.lpTokenId.toString()}`);
    
    // Get debt and collateral information directly from Aave
    const debt = await leveragedLPManager.getUserDebt(newSafeAddress);
    const collateral = await leveragedLPManager.getUserCollateral(newSafeAddress);
    console.log(`- ETH Collateral: ${ethers.utils.formatEther(collateral)}`);
    console.log(`- USDC Debt: ${ethers.utils.formatUnits(debt, 6)}`);
    
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
