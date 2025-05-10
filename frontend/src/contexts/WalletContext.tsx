import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Address } from 'viem';
import type { ReactNode } from 'react';
import { baseChain } from '../constants/chains';
import { ethers, providers, Signer, Contract, utils } from 'ethers';

// Import Safe SDK for production-ready implementation
import Safe from '@safe-global/protocol-kit';
import type {
  PredictedSafeProps,
  SafeAccountConfig,
  SafeDeploymentConfig,
} from '@safe-global/protocol-kit';
import { getContractAddresses } from '../constants/contractAddresses';
import { ABIs } from '../abis';

declare global {
  interface Window {
    ethereum?: any;
  }
}

// Define interface for WalletContext
interface WalletContextProps {
  // Connection state
  isConnected: boolean;
  isLoading: boolean;
  account: string;
  chainId: number;
  safeAddress: string;

  balance: string;

  connect: () => Promise<boolean>;
  createSafeAccount: () => Promise<string | null>;
  disconnect: () => void;
  fetchBalance: (address?: string | Address) => Promise<void>;
  startStrategy: (ethAmount: string, ltv: number) => Promise<string>;
  exitStrategy: (positionId: string) => Promise<string>;
  depositETH: (amount: string) => Promise<string>;
  convertEthToWeth: (amount: string) => Promise<string>;
  completeApprovalProcess: (ethAmount: string, ltv: number) => Promise<boolean>;
}

// Create context with default values
const WalletContext = createContext<WalletContextProps>({
  isConnected: false,
  isLoading: false,
  account: '',
  chainId: 0,
  safeAddress: '',
  balance: '0',
  connect: async () => false,
  createSafeAccount: async () => null,
  disconnect: () => {},
  depositETH: async () => '',
  fetchBalance: async () => {},
  startStrategy: async () => '',
  exitStrategy: async () => '',
  convertEthToWeth: async () => '',
  completeApprovalProcess: async () => '',
});

// Define props for WalletProvider
interface WalletProviderProps {
  children: ReactNode;
}

// Create WalletProvider component
const WalletProvider: React.FC<WalletProviderProps> = ({ children }) => {
  // Connection state
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [account, setAccount] = useState<string>('');
  const [chainId, setChainId] = useState<number>(0);
  const [safeAddress, setSafeAddress] = useState<string>('');

  // Error and loading state
  const [error, setError] = useState<Error | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Balance
  const [balance, setBalance] = useState<string>('0');

  // Provider and signer
  const [provider, setProvider] = useState<providers.Web3Provider | null>(null);
  const [signer, setSigner] = useState<Signer | null>(null);
  const [safeSDK, setSafeSDK] = useState<any | null>(null);

  // Contract instances
  const [leveragedLPManager, setLeveragedLPManager] = useState<Contract | null>(null);
  const [feeCollectHook, setFeeCollectHook] = useState<Contract | null>(null);
  const [positionManager, setPositionManager] = useState<Contract | null>(null);

  /**
   * Initialize contract instances needed for the strategy
   * @param provider - Ethers provider
   * @returns Object containing contract instances
   */
  const initializeContracts = (provider: providers.Web3Provider | providers.JsonRpcProvider) => {
    console.log('Initializing contract interfaces...');

    // Get contract addresses
    const addresses = getContractAddresses(chainId);
    if (!addresses) {
      throw new Error('Contract addresses not found for this network');
    }

    // Main protocol contracts
    const leveragedLPManager = new Contract(
      addresses.leveragedLPManager,
      ABIs.LeveragedLPManager,
      provider
    );

    // Token contracts
    const weth = new ethers.Contract(addresses.weth, ABIs.WETH, provider);

    const usdc = new ethers.Contract(addresses.usdc, ABIs.ERC20, provider);

    // Aave contracts
    const aaveDataProvider = new ethers.Contract(
      addresses.aaveDataProvider,
      ABIs.AaveDataProvider,
      provider
    );

    return { leveragedLPManager, weth, usdc, aaveDataProvider };
  };

  /**
   * Create and execute a Safe transaction
   * @param safeSdk - Safe SDK instance
   * @param txData - Transaction data
   * @param description - Description of the transaction for logging
   * @returns Transaction receipt
   */
  const executeSafeTransaction = async (safeSdk: any, txData: any, description: string) => {
    try {
      console.log(`Creating Safe transaction for ${description}...`);
      const safeTransaction = await safeSdk.createTransaction({ safeTransactionData: txData });
      const signedSafeTx = await safeSdk.signTransaction(safeTransaction);

      console.log(`Executing Safe transaction for ${description}...`);

      // Use a higher gas limit for complex transactions like startStrategy
      const options = {
        gasLimit: description === 'StartStrategy' ? 1500000 : 1000000,
        maxFeePerGas: utils.parseUnits('0.002', 'gwei'),
        maxPriorityFeePerGas: utils.parseUnits('0.0000001', 'gwei'),
      };

      const executeTxResponse = await safeSdk.executeTransaction(signedSafeTx, options);
      if (executeTxResponse.transactionResponse) {
        await executeTxResponse.transactionResponse.wait();
      }

      console.log(
        `${description} successful! Tx hash: ${executeTxResponse.transactionResponse?.hash}`
      );
      return executeTxResponse;
    } catch (error) {
      console.error(
        `Error executing Safe transaction for ${description}: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  };

  /**
   * Fund the Safe with ETH
   * @param signer - Ethers signer
   * @param safeAddress - Address of the Safe to fund
   * @returns Transaction receipt
   */
  const fundSafeWithEth = async (signer: Signer, safeAddress: string, amount: string) => {
    console.log(`Sending ${amount} ETH to Safe...`);
    const tx = await signer.sendTransaction({
      to: safeAddress,
      value: utils.parseEther(amount),
    });

    await tx.wait();
    console.log(`Successfully sent ETH to Safe. Tx hash: ${tx.hash}`);
    return tx;
  };
  
  // Connect wallet
  const connect = async (): Promise<boolean> => {
    setIsConnecting(true);
    setError(null);

    try {
      // Check if ethereum is available
      if (!window.ethereum) {
        throw new Error(
          'No Ethereum wallet detected. Please install MetaMask or another compatible wallet.'
        );
      }

      // Request accounts
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const userAccount = accounts[0];
      setAccount(userAccount);

      // Create provider and signer
      const web3Provider = new providers.Web3Provider(window.ethereum);
      setProvider(web3Provider);

      const userSigner = web3Provider.getSigner();
      setSigner(userSigner);

      // Get network
      const network = await web3Provider.getNetwork();
      const currentChainId = Number(network.chainId);
      setChainId(currentChainId);

      // Check if we're on Base
      if (currentChainId !== baseChain.id) {
        try {
          // Try to switch to Base
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${baseChain.id.toString(16)}` }],
          });

          // Update chain ID after switch
          const updatedNetwork = await web3Provider.getNetwork();
          setChainId(Number(updatedNetwork.chainId));
        } catch (switchError: any) {
          // This error code indicates that the chain has not been added to MetaMask
          if (switchError.code === 4902) {
            try {
              await window.ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [
                  {
                    chainId: `0x${baseChain.id.toString(16)}`,
                    chainName: 'Base',
                    nativeCurrency: {
                      name: 'ETH',
                      symbol: 'ETH',
                      decimals: 18,
                    },
                    rpcUrls: ['https://mainnet.base.org'],
                    blockExplorerUrls: ['https://basescan.org'],
                  },
                ],
              });

              // Update chain ID after adding
              const updatedNetwork = await web3Provider.getNetwork();
              setChainId(Number(updatedNetwork.chainId));
            } catch (addError) {
              throw new Error('Failed to add Base network to your wallet.');
            }
          } else {
            throw new Error('Failed to switch to Base network.');
          }
        }
      }
      // Check for existing Safe address in localStorage
      const savedSafeAddress = localStorage.getItem('safeAddress');

      if (savedSafeAddress) {
        setSafeAddress(savedSafeAddress);

        try {
          if (!userSigner) {
            throw new Error('No signer available');
          }

          console.log('Initializing Safe SDK with address:', savedSafeAddress);

          const rpcUrl = process.env.BASE_RPC_URL || baseChain.rpcUrls.default.http[0];

          const signerAddress = await userSigner.getAddress();

          // Initialize Safe SDK with the provider and signer
          const protocolKit = await Safe.init({
            provider: rpcUrl,
            signer: signerAddress,
            safeAddress: savedSafeAddress,
          });

          // Set the Safe SDK instance
          setSafeSDK(protocolKit);

          console.log('Successfully initialized Safe SDK');

          setIsConnected(true);

          // Fetch Safe balance
          await fetchBalance(savedSafeAddress);
        } catch (error) {
          console.error('Error initializing Safe SDK:', error);
          // If there's an error with the saved Safe address, clear it
          localStorage.removeItem('safeAddress');
          setSafeAddress('');
        }
      } else {
        // No Safe address found, but wallet is connected
        setIsConnected(true);
      }

      // Set up event listeners for account and chain changes
      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);

      setIsConnecting(false);
      return true;
    } catch (error) {
      console.error('Error connecting wallet:', error);
      setIsConnecting(false);
      setError(error instanceof Error ? error : new Error('Unknown error connecting wallet'));
      return false;
    }
  };

  // Function to create a new Safe account using Gnosis Pay
  const createSafeAccount = async (): Promise<string | null> => {
    try {
      setIsLoading(true);

      if (!provider || !signer) {
        throw new Error('No provider or signer available. Please connect your wallet first.');
      }

      const signerAddress = await signer.getAddress();
      console.log('Creating Safe with owner:', signerAddress);

      // Use the Safe SDK to create a new Safe
      // Initialize the Safe SDK with the provider and signer
      const rpcUrl = process.env.BASE_RPC_URL || baseChain.rpcUrls.default.http[0];

      // Create Safe account config
      const safeAccountConfig: SafeAccountConfig = {
        owners: [signerAddress],
        threshold: 1,
      };

      // Create Safe deployment config
      const safeDeploymentConfig: SafeDeploymentConfig = {};

      // Create predicted Safe props
      const predictedSafe: PredictedSafeProps = {
        safeAccountConfig,
        safeDeploymentConfig,
      };

      // Initialize Safe SDK
      const protocolKit = await Safe.init({
        provider: rpcUrl,
        signer: signerAddress,
        predictedSafe,
      });

      // Get the predicted Safe address
      const predictedSafeAddress = await protocolKit.getAddress();
      console.log('Predicted Safe address:', predictedSafeAddress);

      // Create the deployment transaction
      const deploymentTransaction = await protocolKit.createSafeDeploymentTransaction();

      // Execute the deployment transaction
      const jsonRpcProvider = new providers.JsonRpcProvider(rpcUrl);
      const tx = await signer.sendTransaction({
        to: deploymentTransaction.to,
        data: deploymentTransaction.data,
        value: ethers.BigNumber.from(deploymentTransaction.value),
      });

      // Wait for the transaction to be mined
      const receipt = await tx.wait();
      console.log('Safe deployed with transaction hash:', receipt.transactionHash);

      // Connect to the deployed Safe
      const deployedSafeProtocolKit = await protocolKit.connect({
        safeAddress: predictedSafeAddress,
      });

      // Save the Safe address to localStorage
      localStorage.setItem('safeAddress', predictedSafeAddress);
      setSafeAddress(predictedSafeAddress);
      setIsConnected(true);

      // Set the Safe SDK instance
      setSafeSDK(deployedSafeProtocolKit);

      // Fetch the Safe balance (this will be 0 for a new Safe)
      await fetchBalance(predictedSafeAddress);

      setIsLoading(false);
      return predictedSafeAddress;
    } catch (error) {
      console.error('Error creating Safe account:', error);
      setIsLoading(false);
      setError(error instanceof Error ? error : new Error('Unknown error creating Safe account'));
      return null;
    }
  };

  // Handle account changes
  const handleAccountsChanged = (accounts: string[]) => {
    if (accounts.length === 0) {
      // User disconnected their wallet
      disconnect();
    } else {
      // User switched accounts
      setAccount(accounts[0]);
      // Reconnect with new account
      connect();
    }
  };

  // Handle chain changes
  const handleChainChanged = () => {
    // Reload the page on chain change as recommended by MetaMask
    window.location.reload();
  };

  // Disconnect wallet
  const disconnect = () => {
    setIsConnected(false);
    setAccount('');
    setChainId(0);
    setSafeAddress('');
    setSafeSDK(null);
    setProvider(null);
    setSigner(null);
    setBalance('0');
    setLeveragedLPManager(null);
    setFeeCollectHook(null);
    setPositionManager(null);

    // Clear Safe address from localStorage
    localStorage.removeItem('safeAddress');
  };

  // Fetch ETH balance
  const fetchBalance = async (address?: string | Address) => {
    if (!provider) return;

    try {
      const targetAddress = address || safeAddress || account;

      if (!targetAddress || !utils.isAddress(targetAddress)) {
        throw new Error('Invalid address');
      }

      const balanceWei = await provider.getBalance(targetAddress);
      const balanceEth = utils.formatEther(balanceWei);

      setBalance(balanceEth);
    } catch (error) {
      console.error('Error fetching balance:', error);
    }
  };

  // Deposit ETH to Safe
  const depositETH = async (amount: string) => {
    if (!signer || !safeAddress) {
      throw new Error('Wallet not connected or Safe not initialized');
    }

    try {
      // Validate Safe address
      if (!utils.isAddress(safeAddress)) {
        throw new Error('Invalid Safe address');
      }

      // Send ETH directly to Safe address
      const tx = await signer.sendTransaction({
        to: safeAddress,
        value: utils.parseEther(amount),
      });

      const receipt = await tx.wait();

      // Refresh balance
      await fetchBalance();

      return receipt.transactionHash;
    } catch (error) {
      console.error('ETH deposit error:', error);
      throw error;
    }
  };

  /**
   * Convert ETH to WETH in the Safe
   * @param safeAddress - Address of the Safe
   * @param safeSdk - Safe SDK instance
   * @param contracts - Object containing contract instances
   * @returns Transaction receipt
   */
  const convertEthToWeth = async (amount: string) => {
    if (!safeAddress || !signer || !safeSDK) {
      throw new Error('Wallet not connected or Safe not initialized');
    }

    try {
      console.log('Converting ETH to WETH in the Safe...');

      // Get contract addresses
      const addresses = getContractAddresses(chainId);
      if (!addresses || !addresses.weth) {
        throw new Error('WETH address not found for this network');
      }

      // Send ETH directly to the Safe first
      await fundSafeWithEth(signer, safeAddress, amount);

      // Check current ETH balance in the Safe
      const ethBalance = await safeSDK.getBalance();
      console.log(`Current ETH balance in Safe: ${utils.formatEther(ethBalance)} ETH`);

      // Initialize contracts
      const contracts = initializeContracts(provider!);

      // Prepare transaction data to call WETH.deposit() with ETH value
      const wethDepositData = {
        to: addresses.weth,
        data: contracts.weth.interface.encodeFunctionData('deposit'),
        value: utils.parseEther(amount).toString(),
      };

      // Execute the transaction through the Safe
      const result = await executeSafeTransaction(safeSDK, wethDepositData, 'Convert ETH to WETH');

      // Verify WETH balance after conversion
      const wethBalance = await contracts.weth.balanceOf(safeAddress);
      console.log(`WETH balance after conversion: ${utils.formatEther(wethBalance)} WETH`);

      // Get transaction hash
      let txHash = '';
      if (result.transactionResponse && result.transactionResponse.hash) {
        txHash = result.transactionResponse.hash;
      }

      // Refresh balance
      await fetchBalance();

      return txHash;
    } catch (error) {
      console.error(
        `Error converting ETH to WETH: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  };

  /**
   * Approve WETH for the LeveragedLPManager contract
   * @param safeAddress - Address of the Safe
   * @param safeSdk - Safe SDK instance
   * @param contracts - Object containing contract instances
   * @param ethAmountWei - Amount of ETH to approve in Wei (BigNumber)
   */
  const approveWethForLeveragedLPManager = async (
    safeAddress: string,
    safeSdk: any,
    contracts: any,
    ethAmountWei = utils.parseEther('0.0001')
  ) => {
    try {
      console.log('Checking if WETH allowance is needed...');

      // Get contract addresses
      const addresses = getContractAddresses(chainId);
      if (!addresses) {
        throw new Error('Contract addresses not found for this network');
      }

      const wethAllowance = await contracts.weth.allowance(
        safeAddress,
        addresses.leveragedLPManager
      );
      console.log(`Current WETH allowance: ${utils.formatEther(wethAllowance)} WETH`);
      console.log(`Required WETH allowance: ${utils.formatEther(ethAmountWei)} WETH`);

      // Only approve if current allowance is less than what we need
      if (wethAllowance.lt(ethAmountWei)) {
        // Create approval transaction data
        const approveData = contracts.weth.interface.encodeFunctionData('approve', [
          addresses.leveragedLPManager,
          ethers.constants.MaxUint256, // Approve maximum amount
        ]);

        const approvalTxData = {
          to: addresses.weth,
          data: approveData,
          value: '0',
        };

        // Execute the approval transaction
        await executeSafeTransaction(safeSdk, approvalTxData, 'WETH approval');
      } else {
        console.log('WETH already approved for LeveragedLPManager.');
      }
    } catch (error) {
      console.error(
        `Error in WETH approval process: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  };

  /**
   * Approve USDC for the LeveragedLPManager contract
   * @param safeAddress - Address of the Safe
   * @param safeSdk - Safe SDK instance
   * @param contracts - Object containing contract instances
   * @param ethAmount - Amount of ETH as a string
   * @param ltv - Loan-to-Value ratio as a number
   */
  const approveUsdcForLeveragedLPManager = async (
    safeAddress: string,
    safeSdk: any,
    contracts: any,
    ethAmount = '0.0001', // Default amount if not provided
    ltv = 30 // Default LTV if not provided
  ) => {
    try {
      console.log('Checking USDC approval for LeveragedLPManager...');

      // Get contract addresses
      const addresses = getContractAddresses(chainId);
      if (!addresses) {
        throw new Error('Contract addresses not found for this network');
      }

      // Calculate approximately how much USDC might be borrowed for this strategy
      const ethPriceInUsdc = 2339 * 1e6; // Same price as in the contract
      const ethAmountInEth = parseFloat(ethAmount); // Use the provided ethAmount
      const estimatedUsdcBorrow = Math.ceil(ethAmountInEth * ethPriceInUsdc * (ltv / 100));

      console.log(`ETH amount: ${ethAmount} ETH`);
      console.log(`LTV: ${ltv}%`);
      console.log(`Estimated USDC borrow: ${estimatedUsdcBorrow} USDC units`);

      const usdcAllowance = await contracts.usdc.allowance(
        safeAddress,
        addresses.leveragedLPManager
      );
      console.log(`Current USDC allowance: ${usdcAllowance.toString()} USDC units`);

      // Only approve if current allowance is less than what we need
      if (usdcAllowance.lt(ethers.BigNumber.from(estimatedUsdcBorrow))) {
        // Create approval transaction data
        const approveUsdcData = contracts.usdc.interface.encodeFunctionData('approve', [
          addresses.leveragedLPManager,
          ethers.constants.MaxUint256, // Approve maximum amount
        ]);

        const approveUsdcTxData = {
          to: addresses.usdc,
          data: approveUsdcData,
          value: '0',
        };

        // Execute the approval transaction
        await executeSafeTransaction(safeSdk, approveUsdcTxData, 'USDC approval');
      } else {
        console.log('USDC already approved for LeveragedLPManager.');
      }
    } catch (error) {
      console.error(
        `Error in USDC approval process: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  };

  /**
   * Set up Aave V3 debt token delegation (critical for borrowing)
   * @param safeAddress - Address of the Safe
   * @param safeSdk - Safe SDK instance
   * @param provider - Ethers provider
   * @param contracts - Object containing contract instances
   */
  const setupAaveDebtTokenDelegation = async (
    safeAddress: string,
    safeSdk: any,
    provider: providers.Web3Provider | providers.JsonRpcProvider,
    contracts: any
  ) => {
    try {
      console.log(
        'Setting up Aave V3 debt token delegation - this is required for borrowing on behalf of another address'
      );

      // Get contract addresses
      const addresses = getContractAddresses(chainId);
      if (!addresses) {
        throw new Error('Contract addresses not found for this network');
      }

      // Get the USDC debt token address from Aave
      console.log('Fetching USDC variable debt token address from Aave...');
      const usdcTokenData = await contracts.aaveDataProvider.getReserveTokensAddresses(
        addresses.usdc
      );
      const variableDebtTokenAddress = usdcTokenData.variableDebtTokenAddress;

      console.log(`USDC Variable Debt Token address: ${variableDebtTokenAddress}`);

      // Set up the debt token contract
      const variableDebtToken = new Contract(
        variableDebtTokenAddress,
        ['function approveDelegation(address delegatee, uint256 amount) external'],
        provider
      );

      // Skip checking for existing delegation and always set it up
      console.log('Setting up debt delegation without checking current allowance');
      console.log(`From Safe: ${safeAddress}`);
      console.log(`To LeveragedLPManager: ${addresses.leveragedLPManager}`);

      // Prepare delegation data - CRITICAL: The Safe must be the one calling approveDelegation
      console.log(
        `Setting up debt delegation from Safe (${safeAddress}) to LeveragedLPManager (${addresses.leveragedLPManager})`
      );

      const delegationData = variableDebtToken.interface.encodeFunctionData('approveDelegation', [
        addresses.leveragedLPManager,
        ethers.constants.MaxUint256, // Delegate maximum amount
      ]);

      const delegationTxData = {
        to: variableDebtTokenAddress,
        data: delegationData,
        value: '0',
      };

      // Execute the debt token delegation transaction THROUGH the Safe
      await executeSafeTransaction(safeSdk, delegationTxData, 'Aave debt token delegation');
    } catch (error) {
      console.error(
        `Error in debt token delegation: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  };

  /**
   * Execute the startStrategy function on the LeveragedLPManager contract
   * @param safeAddress - Address of the Safe
   * @param safeSdk - Safe SDK instance
   * @param contracts - Object containing contract instances
   */
  const executeStartStrategy = async (safeAddress: string, safeSdk: any, contracts: any) => {
    try {
      // Default values - can be parameterized
      const ethAmount = utils.parseEther('0.001');
      const ltv = 30;
      const slippageBps = 50;

      console.log('Creating startStrategy transaction with parameters:');
      console.log(`- Safe address: ${safeAddress}`);
      console.log(`- ETH amount: ${utils.formatEther(ethAmount)} ETH`);
      console.log(`- LTV: ${ltv}%`);
      console.log(`- Slippage: ${slippageBps / 100}%`);

      // Create startStrategy transaction data
      const startStrategyData = contracts.leveragedLPManager.interface.encodeFunctionData(
        'startStrategy',
        [safeAddress, ethAmount, ltv, slippageBps]
      );

      const startStrategyTxData = {
        to: contracts.leveragedLPManager.address,
        data: startStrategyData,
        value: '0',
      };

      // Execute the startStrategy transaction
      await executeSafeTransaction(safeSdk, startStrategyTxData, 'StartStrategy');
    } catch (error) {
      console.error(
        `Error executing startStrategy: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  };

  /**
   * Verify the strategy was created successfully
   * @param safeAddress - Address of the Safe
   * @param contracts - Object containing contract instances
   */
  const verifyStrategyPosition = async (safeAddress: string, contracts: any) => {
    try {
      console.log('Verifying strategy position was created successfully...');
      const position = await contracts.leveragedLPManager.getUserPosition(safeAddress);

      if (position.safe === safeAddress) {
        console.log('Position successfully created!');
        console.log(`LP Token ID: ${position.lpTokenId.toString()}`);
        return true;
      } else {
        console.error('Position not found. Strategy initialization may have failed.');
        return false;
      }
    } catch (error) {
      console.error(
        `Error verifying position: ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    }
  };

  // Complete the approval process for starting a strategy
  // This includes approving WETH, USDC, and setting up Aave debt token delegation
  const completeApprovalProcess = async (ethAmount: string, ltv: number): Promise<boolean> => {
    if (!safeAddress || !signer || !safeSDK || !provider) {
      throw new Error('Wallet not connected or Safe not initialized');
    }

    try {
      const contracts = initializeContracts(provider);

      const ethAmountWei = utils.parseEther(ethAmount);

      // Step 1: Approve WETH for LeveragedLPManager with the provided ethAmount
      await approveWethForLeveragedLPManager(safeAddress, safeSDK, contracts, ethAmountWei);

      // Step 2: Approve USDC for LeveragedLPManager with the provided ethAmount and ltv
      await approveUsdcForLeveragedLPManager(safeAddress, safeSDK, contracts, ethAmount, ltv);

      // Step 3: Set up Aave debt token delegation (critical for borrowing)
      await setupAaveDebtTokenDelegation(safeAddress, safeSDK, provider, contracts);

      console.log('All approvals completed successfully!');
      return true;
    } catch (error) {
      console.error(
        `Error in approval process: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  };

  // Start a leveraged LP strategy
  const startStrategy = async (ethAmount: string, ltv: number): Promise<string> => {
    if (!safeAddress || !signer || !safeSDK || !provider) {
      throw new Error('Wallet not connected, Safe not initialized, or provider not available');
    }

    try {
      // Initialize contracts
      const contracts = initializeContracts(provider);

      // Execute the complete flow as in TestEndToEnd.js
      console.log('Starting the complete strategy flow...');

      // Step 1: Convert ETH to WETH
      await convertEthToWeth(ethAmount);

      const ethAmountWei = utils.parseEther(ethAmount);

      // Step 2: Approve WETH for LeveragedLPManager
      await approveWethForLeveragedLPManager(safeAddress, safeSDK, contracts, ethAmountWei);

      // Step 3: Approve USDC for LeveragedLPManager
      await approveUsdcForLeveragedLPManager(safeAddress, safeSDK, contracts, ethAmount);

      // Step 4: Set up Aave debt token delegation
      await setupAaveDebtTokenDelegation(safeAddress, safeSDK, provider, contracts);

      // Step 5: Execute the startStrategy function
      await executeStartStrategy(safeAddress, safeSDK, contracts);

      // Step 6: Verify the position was created
      const success = await verifyStrategyPosition(safeAddress, contracts);

      if (!success) {
        throw new Error('Strategy position verification failed');
      }

      // Refresh balance
      await fetchBalance();

      return 'Strategy started successfully!';
    } catch (error) {
      console.error(
        `Error starting strategy: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  };

  // Exit a leveraged LP strategy
  const exitStrategy = async (positionId: string): Promise<string> => {
    if (!safeAddress || !signer || !safeSDK || !leveragedLPManager) {
      throw new Error('Wallet not connected, Safe not initialized, or contracts not loaded');
    }

    try {
      console.log(`Exiting strategy for position ID: ${positionId}`);

      // Create exitStrategy transaction data
      const exitStrategyData = leveragedLPManager.interface.encodeFunctionData('exitStrategy', [
        safeAddress,
        positionId,
      ]);

      const exitStrategyTxData = {
        to: leveragedLPManager.address,
        data: exitStrategyData,
        value: '0',
      };

      // Execute the exitStrategy transaction
      console.log('Executing exitStrategy transaction...');
      const exitStrategyTx = await safeSDK.createTransaction({
        safeTransactionData: exitStrategyTxData,
      });

      const exitStrategyTxResponse = await safeSDK.executeTransaction(exitStrategyTx);

      // Wait for transaction to be mined
      let txHash = '';
      if (exitStrategyTxResponse.transactionResponse) {
        await exitStrategyTxResponse.transactionResponse.wait();
        txHash = exitStrategyTxResponse.transactionResponse.hash;
      }

      console.log(`Strategy exited successfully! Tx hash: ${txHash}`);

      // Refresh balance
      await fetchBalance();

      return txHash;
    } catch (error) {
      console.error('Error exiting strategy:', error);
      throw error;
    }
  };

  // Auto-connect on component mount
  useEffect(() => {
    // Only auto-connect if there's a saved Safe address
    if (localStorage.getItem('safeAddress') && !isConnected && chainId !== baseChain.id) {
      connect();
    }
  }, []);

  return (
    <WalletContext.Provider
      value={{
        isConnected,
        isLoading,
        account,
        chainId,
        safeAddress,
        balance,
        connect,
        createSafeAccount,
        depositETH,
        disconnect,
        fetchBalance,
        startStrategy,
        exitStrategy,
        convertEthToWeth,
        completeApprovalProcess,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

// Custom hook to use the wallet context
export const useWallet = () => useContext(WalletContext);

export default WalletProvider;
