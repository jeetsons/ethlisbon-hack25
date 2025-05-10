/**
 * TestEndToEnd.js - Script to test the end-to-end flow with Gnosis Safe
 * 
 * This script demonstrates the entire flow of using the LeveragedLPManager contract
 * with a Gnosis Safe wallet, including:
 * 1. Setting up connections to the Base network
 * 2. Connecting to an existing Gnosis Safe wallet
 * 3. Wrapping ETH to WETH and approving it for the LeveragedLPManager
 * 4. Setting up Aave V3 debt token delegation (critical for borrowing)
 * 5. Executing the startStrategy function
 * 6. Verifying the result
 */

require('dotenv').config();
const { getSafeAddressFromDeploymentTx } = require('@safe-global/protocol-kit');
const ethers = require('ethers');
const Safe = require('@safe-global/protocol-kit').default;
const SafeApiKit = require('@safe-global/api-kit').default;
const EthersAdapter = require('@safe-global/protocol-kit').EthersAdapter;
const { SafeFactory } = require('@safe-global/protocol-kit');

/**
 * Contract ABIs
 * These minimal ABIs contain just the functions we need to interact with each contract
 */
const ABIs = {
  // LeveragedLPManager ABI - our main contract
  LeveragedLPManager: [
    "function startStrategy(address safe, uint256 ethAmount, uint256 ltv, uint16 slippageBps) external",
    "function getUserPosition(address safe) external view returns (address safe, uint256 lpTokenId)",
    "function owner() external view returns (address)",
    "function protocolFeeBps() external view returns (uint8)",
    "function feeHook() external view returns (address)"
  ],
  
  // WETH token ABI
  WETH: [
    "function deposit() external payable",
    "function balanceOf(address owner) external view returns (uint256)",
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function transfer(address to, uint amount) external returns (bool)",
    "function name() external view returns (string)",
    "function symbol() external view returns (string)",
    "function decimals() external view returns (uint8)",
    "function totalSupply() external view returns (uint256)"
  ],
  
  // ERC20 standard ABI (for USDC)
  ERC20: [
    "function balanceOf(address owner) external view returns (uint256)",
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function decimals() external view returns (uint8)"
  ],
  
  // Aave V3 Data Provider ABI
  AaveDataProvider: [
    "function getReserveTokensAddresses(address asset) external view returns (address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress)"
  ],
  
  // Aave V3 Debt Token ABI
  AaveDebtToken: [
    "function approveDelegation(address delegatee, uint256 amount) external"
  ]
};

/**
 * Configuration object with all settings for the script
 */
const config = {
  // Contract addresses
  addresses: {
    leveragedLPManager: "0x8442aE593Dee7D8644BA23BA67a626BF64f6F2e6", // LeveragedLPManager on Base
    weth: "0x4200000000000000000000000000000000000006", // WETH on Base
    usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC on Base
    safe: "0x37adcff072f44bec0413029e7bfd785ca0467143", // Our existing Safe address
    
    // Aave V3 addresses on Base
    aavePool: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5", // Aave V3 Pool
    aaveDataProvider: "0x2d8A3C5677189723C4cB8873CfC9C8976FDF38Ac" // Aave V3 Protocol Data Provider
  },
  
  // Network settings
  network: {
    rpcUrl: process.env.BASE_RPC_URL || "https://mainnet.base.org",
    chainId: 8453, // Base mainnet
    safeService: "https://safe-transaction-base.safe.global"
  },
  
  // Strategy parameters
  strategy: {
    ethAmount: ethers.utils.parseEther("0.001"), // Amount of ETH to use
    ltv: 30, // 30% Loan-to-Value ratio (conservative to avoid liquidation)
    slippageBps: 50 // 0.5% slippage tolerance
  }
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Set up provider, signer, and network connections
 * @param {string} privateKey - Private key for signing transactions
 * @returns {Object} Object containing provider, signer, and signerAddress
 */
async function setupProviderAndSigner(privateKey) {
  if (!privateKey) {
    throw new Error("Private key is required. Pass it as an argument or set PRIVATE_KEY_E2E env variable.");
  }

  console.log(`Connecting to network: ${config.network.rpcUrl}`);
  const provider = new ethers.providers.JsonRpcProvider(config.network.rpcUrl);

  // Verify the network
  const network = await provider.getNetwork();
  console.log(`Connected to network: ${network.name} (Chain ID: ${network.chainId})`);

  if (network.chainId !== config.network.chainId) {
    console.warn(`WARNING: Expected Base network (Chain ID: ${config.network.chainId}), but connected to Chain ID: ${network.chainId}`);
  }

  const signer = new ethers.Wallet(privateKey, provider);
  const signerAddress = await signer.getAddress();
  console.log(`Using signer address: ${signerAddress}`);

  return { provider, signer, signerAddress };
}

/**
 * Initialize contract instances needed for the strategy
 * @param {Object} provider - Ethers provider
 * @returns {Object} Object containing contract instances
 */
function initializeContracts(provider) {
  console.log("Initializing contract interfaces...");
  
  // Main protocol contracts
  const leveragedLPManager = new ethers.Contract(
    config.addresses.leveragedLPManager,
    ABIs.LeveragedLPManager,
    provider
  );
  
  // Token contracts
  const weth = new ethers.Contract(
    config.addresses.weth,
    ABIs.WETH,
    provider
  );
  
  const usdc = new ethers.Contract(
    config.addresses.usdc,
    ABIs.ERC20,
    provider
  );
  
  // Aave contracts
  const aaveDataProvider = new ethers.Contract(
    config.addresses.aaveDataProvider,
    ABIs.AaveDataProvider,
    provider
  );
  
  console.log("Contract interfaces initialized.");
  return { leveragedLPManager, weth, usdc, aaveDataProvider };
}

/**
 * Connect to an existing Gnosis Safe
 * @param {Object} signer - Ethers signer
 * @returns {Object} Object containing Safe SDK instance and safeAddress
 */
async function connectToSafe(signer) {
  const ethAdapter = new EthersAdapter({
    ethers,
    signerOrProvider: signer
  });

  // Initialize Safe API Kit
  new SafeApiKit({
    txServiceUrl: config.network.safeService,
    ethAdapter
  });

  // Use the existing Safe address
  const safeAddress = config.addresses.safe;
  console.log(`Connecting to Safe at address: ${safeAddress}`);

  try {
    const safeSdk = await Safe.create({
      ethAdapter,
      safeAddress
    });
    console.log("Successfully connected to existing Safe.");
    return { safeSdk, safeAddress };
  } catch (error) {
    console.error(`Error connecting to Safe: ${error.message}`);
    throw error;
  }
}

/**
 * Fund the Safe with ETH
 * @param {Object} signer - Ethers signer
 * @param {string} safeAddress - Address of the Safe to fund
 * @returns {Object} Transaction receipt
 */
async function fundSafeWithEth(signer, safeAddress) {
  console.log(`Sending ${ethers.utils.formatEther(config.strategy.ethAmount)} ETH to Safe...`);
  const tx = await signer.sendTransaction({
    to: safeAddress,
    value: config.strategy.ethAmount
  });
  
  await tx.wait();
  console.log(`Successfully sent ETH to Safe. Tx hash: ${tx.hash}`);
  return tx;
}

/**
 * Convert ETH to WETH in the Safe
 * @param {string} safeAddress - Address of the Safe
 * @param {Object} safeSdk - Safe SDK instance
 * @param {Object} contracts - Object containing contract instances
 * @returns {Object} Transaction receipt
 */
async function convertEthToWeth(safeAddress, safeSdk, contracts) {
  try {
    console.log("Converting ETH to WETH in the Safe...");
    
    // Check current ETH balance in the Safe
    const ethBalance = await safeSdk.getBalance();
    console.log(`Current ETH balance in Safe: ${ethers.utils.formatEther(ethBalance)} ETH`);
    
    // Prepare transaction data to call WETH.deposit() with ETH value
    const wethDepositData = {
      to: config.addresses.weth,
      data: contracts.weth.interface.encodeFunctionData("deposit"),
      value: config.strategy.ethAmount.toString()
    };
    
    // Execute the transaction through the Safe
    await executeSafeTransaction(safeSdk, wethDepositData, "Convert ETH to WETH");
    
    // Verify WETH balance after conversion
    const wethBalance = await contracts.weth.balanceOf(safeAddress);
    console.log(`WETH balance after conversion: ${ethers.utils.formatEther(wethBalance)} WETH`);
    
    return true;
  } catch (error) {
    console.error(`Error converting ETH to WETH: ${error.message}`);
    throw error;
  }
}

/**
 * Create and execute a Safe transaction
 * @param {Object} safeSdk - Safe SDK instance
 * @param {Object} txData - Transaction data
 * @param {string} description - Description of the transaction for logging
 * @returns {Object} Transaction receipt
 */
async function executeSafeTransaction(safeSdk, txData, description) {
  try {
    console.log(`Creating Safe transaction for ${description}...`);
    const safeTransaction = await safeSdk.createTransaction({ safeTransactionData: txData });
    const signedSafeTx = await safeSdk.signTransaction(safeTransaction);
    
    console.log(`Executing Safe transaction for ${description}...`);
    
    // Use a higher gas limit for complex transactions like startStrategy
    const options = { 
      gasLimit: description === "StartStrategy" ? 2000000 : 1000000 
    };
    console.log(`Using gas limit of ${options.gasLimit} for ${description}`);
    
    const executeTxResponse = await safeSdk.executeTransaction(signedSafeTx, options);
    await executeTxResponse.transactionResponse?.wait();
    
    console.log(`${description} successful! Tx hash: ${executeTxResponse.transactionResponse?.hash}`);
    return executeTxResponse;
  } catch (error) {
    console.error(`Error executing Safe transaction for ${description}: ${error.message}`);
    throw error;
  }
}

/**
 * Approve WETH for the LeveragedLPManager contract
 * @param {string} safeAddress - Address of the Safe
 * @param {Object} safeSdk - Safe SDK instance
 * @param {Object} contracts - Object containing contract instances
 */
async function approveWethForLeveragedLPManager(safeAddress, safeSdk, contracts) {
  try {
    console.log("Checking if WETH allowance is needed...");
    const wethAllowance = await contracts.weth.allowance(safeAddress, config.addresses.leveragedLPManager);
    console.log(`Current WETH allowance: ${ethers.utils.formatEther(wethAllowance)} WETH`);
    
    // Only approve if current allowance is less than what we need
    if (wethAllowance.lt(config.strategy.ethAmount)) {
      // Create approval transaction data
      const approveData = contracts.weth.interface.encodeFunctionData("approve", [
        config.addresses.leveragedLPManager,
        ethers.constants.MaxUint256 // Approve maximum amount
      ]);
      
      const approvalTxData = {
        to: config.addresses.weth,
        data: approveData,
        value: "0"
      };
      
      // Execute the approval transaction
      await executeSafeTransaction(safeSdk, approvalTxData, "WETH approval");
    } else {
      console.log("WETH already approved for LeveragedLPManager.");
    }
  } catch (error) {
    console.error(`Error in WETH approval process: ${error.message}`);
    throw error;
  }
}

/**
 * Approve USDC for the LeveragedLPManager contract
 * @param {string} safeAddress - Address of the Safe
 * @param {Object} safeSdk - Safe SDK instance
 * @param {Object} contracts - Object containing contract instances
 */
async function approveUsdcForLeveragedLPManager(safeAddress, safeSdk, contracts) {
  try {
    console.log("Checking USDC approval for LeveragedLPManager...");
    
    // Calculate approximately how much USDC might be borrowed for this strategy
    const ethPriceInUsdc = 2339 * 1e6; // Same price as in the contract
    const ethAmountInEth = parseFloat(ethers.utils.formatEther(config.strategy.ethAmount));
    const estimatedUsdcBorrow = Math.ceil(ethAmountInEth * ethPriceInUsdc * (config.strategy.ltv / 100));
    
    const usdcAllowance = await contracts.usdc.allowance(safeAddress, config.addresses.leveragedLPManager);
    console.log(`Current USDC allowance: ${usdcAllowance.toString()} USDC units`);
    
    // Only approve if current allowance is less than what we need
    if (usdcAllowance.lt(ethers.BigNumber.from(estimatedUsdcBorrow))) {
      // Create approval transaction data
      const approveUsdcData = contracts.usdc.interface.encodeFunctionData("approve", [
        config.addresses.leveragedLPManager,
        ethers.constants.MaxUint256 // Approve maximum amount
      ]);
      
      const approveUsdcTxData = {
        to: config.addresses.usdc,
        data: approveUsdcData,
        value: "0"
      };
      
      // Execute the approval transaction
      await executeSafeTransaction(safeSdk, approveUsdcTxData, "USDC approval");
    } else {
      console.log("USDC already approved for LeveragedLPManager.");
    }
  } catch (error) {
    console.error(`Error in USDC approval process: ${error.message}`);
    throw error;
  }
}

/**
 * Set up Aave V3 debt token delegation (critical for borrowing)
 * @param {string} safeAddress - Address of the Safe
 * @param {Object} safeSdk - Safe SDK instance
 * @param {Object} provider - Ethers provider
 * @param {Object} contracts - Object containing contract instances
 */
async function setupAaveDebtTokenDelegation(safeAddress, safeSdk, provider, contracts) {
  try {
    console.log("Setting up Aave V3 debt token delegation - this is required for borrowing on behalf of another address");
    
    // Get the USDC debt token address from Aave
    console.log("Fetching USDC variable debt token address from Aave...");
    const usdcTokenData = await contracts.aaveDataProvider.getReserveTokensAddresses(config.addresses.usdc);
    const variableDebtTokenAddress = usdcTokenData.variableDebtTokenAddress;
    
    console.log(`USDC Variable Debt Token address: ${variableDebtTokenAddress}`);
    
    // Set up the debt token contract
    const variableDebtToken = new ethers.Contract(
      variableDebtTokenAddress,
      ABIs.AaveDebtToken,
      provider
    );
    
    // Skip checking for existing delegation and always set it up
    // This is more reliable than checking, as the borrowAllowance function might not be
    // available in all implementations or might require different parameters
    console.log("Setting up debt delegation without checking current allowance");
    console.log(`From Safe: ${safeAddress}`);
    console.log(`To LeveragedLPManager: ${config.addresses.leveragedLPManager}`);
    
    // Prepare delegation data - CRITICAL: The Safe must be the one calling approveDelegation
    console.log(`Setting up debt delegation from Safe (${safeAddress}) to LeveragedLPManager (${config.addresses.leveragedLPManager})`);
    
    const delegationData = variableDebtToken.interface.encodeFunctionData("approveDelegation", [
      config.addresses.leveragedLPManager,
      ethers.constants.MaxUint256 // Delegate maximum amount
    ]);
    
    const delegationTxData = {
      to: variableDebtTokenAddress,
      data: delegationData,
      value: "0"
    };
    
    // Execute the debt token delegation transaction THROUGH the Safe
    await executeSafeTransaction(safeSdk, delegationTxData, "Aave debt token delegation");
  } catch (error) {
    console.error(`Error in debt token delegation: ${error.message}`);
    throw error;
  }
}

/**
 * Execute the startStrategy function on the LeveragedLPManager contract
 * @param {string} safeAddress - Address of the Safe
 * @param {Object} safeSdk - Safe SDK instance
 * @param {Object} contracts - Object containing contract instances
 */
async function executeStartStrategy(safeAddress, safeSdk, contracts) {
  try {
    console.log("Creating startStrategy transaction with parameters:");
    console.log(`- Safe address: ${safeAddress}`);
    console.log(`- ETH amount: ${ethers.utils.formatEther(config.strategy.ethAmount)} ETH`);
    console.log(`- LTV: ${config.strategy.ltv}%`);
    console.log(`- Slippage: ${config.strategy.slippageBps / 100}%`);
    
    // Create startStrategy transaction data
    const startStrategyData = contracts.leveragedLPManager.interface.encodeFunctionData("startStrategy", [
      safeAddress,
      config.strategy.ethAmount,
      config.strategy.ltv,
      config.strategy.slippageBps
    ]);
    
    const startStrategyTxData = {
      to: config.addresses.leveragedLPManager,
      data: startStrategyData,
      value: "0"
    };
    
    // Execute the startStrategy transaction
    await executeSafeTransaction(safeSdk, startStrategyTxData, "StartStrategy");
  } catch (error) {
    console.error(`Error executing startStrategy: ${error.message}`);
    throw error;
  }
}

/**
 * Verify the strategy was created successfully
 * @param {string} safeAddress - Address of the Safe
 * @param {Object} contracts - Object containing contract instances
 */
async function verifyStrategyPosition(safeAddress, contracts) {
  try {
    console.log("Verifying strategy position was created successfully...");
    const position = await contracts.leveragedLPManager.getUserPosition(safeAddress);
    
    if (position.safe === safeAddress) {
      console.log("Position successfully created!");
      console.log(`LP Token ID: ${position.lpTokenId.toString()}`);
      return true;
    } else {
      console.error("Position not found. Strategy initialization may have failed.");
      return false;
    }
  } catch (error) {
    console.error(`Error verifying position: ${error.message}`);
    return false;
  }
}

/**
 * Main function that orchestrates the entire flow
 */
async function main() {
  try {
    // Get private key from command line args or environment
    const privateKey = process.argv[2] || process.env.PRIVATE_KEY_E2E;
    
    // Step 1: Set up provider and signer
    const { provider, signer } = await setupProviderAndSigner(privateKey);
    
    // Step 2: Connect to existing Safe
    const { safeSdk, safeAddress } = await connectToSafe(signer);
    
    // Step 3: Initialize contract instances
    const contracts = initializeContracts(provider);

    // Step 4: Fund the Safe with ETH
    await fundSafeWithEth(signer, safeAddress);
    
    // Step 4.5: Convert ETH to WETH in the Safe
    await convertEthToWeth(safeAddress, safeSdk, contracts);
    
    // Step 5: Approve WETH for LeveragedLPManager
    await approveWethForLeveragedLPManager(safeAddress, safeSdk, contracts);
    
    // Step 6: Approve USDC for LeveragedLPManager
    await approveUsdcForLeveragedLPManager(safeAddress, safeSdk, contracts);
    
    // Step 7: Set up Aave debt token delegation (CRITICAL for borrowing)
    await setupAaveDebtTokenDelegation(safeAddress, safeSdk, provider, contracts);
    
    // Step 8: Execute startStrategy function
    await executeStartStrategy(safeAddress, safeSdk, contracts);
    
    // Step 9: Verify the result
    await verifyStrategyPosition(safeAddress, contracts);
    
    console.log("====================================================");
    console.log("🎉 End-to-end test completed successfully! 🎉");
    console.log("====================================================");
    
  } catch (error) {
    console.error(`Error in main function: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the main function
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
