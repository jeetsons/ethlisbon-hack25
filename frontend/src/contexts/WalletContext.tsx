import React, {createContext, useContext, useState, useEffect} from 'react';
import type {Address} from 'viem';
import type {ReactNode} from 'react';
import {baseChain} from '../constants/chains';
import {ethers, providers, Signer, Contract, utils} from 'ethers';

// Import Safe SDK for production-ready implementation
import Safe from '@safe-global/protocol-kit';
import type {PredictedSafeProps, SafeAccountConfig, SafeDeploymentConfig} from '@safe-global/protocol-kit';
import EthersAdapter from '@safe-global/safe-ethers-lib';
import SafeApiKit from '@safe-global/api-kit';
import {getContractAddresses} from '../constants/contractAddresses';

// Import ABIs
import LeveragedLPManagerABI from '../abis/LeveragedLPManager.json';
import FeeCollectHookABI from '../abis/FeeCollectHook.json';
import ERC20ABI from '../abis/ERC20.json';
import ERC721ABI from '../abis/ERC721.json';

// Add TypeScript declaration for window.ethereum
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

  // Balance
  balance: string;

  // Functions
  connect: () => Promise<boolean>;
  createSafeAccount: () => Promise<string | null>;
  disconnect: () => void;
  fetchBalance: (address?: string | Address) => Promise<void>;
  sendTransaction: (to: string, value: string, data?: string) => Promise<string>;
  approveERC20: (tokenAddress: string, spender: string, amount: string) => Promise<string>;
  approveERC721: (tokenAddress: string, spender: string, tokenId: string) => Promise<string>;
  depositETH: (amount: string) => Promise<string>;
  getTransactionHistory: () => Promise<any[]>;
  startStrategy: (ethAmount: string, ltv: number) => Promise<string>;
  exitStrategy: (positionId: string) => Promise<string>;
  getUserPosition: () => Promise<any>;
  isApprovedForFeeHook: (tokenId: string) => Promise<boolean>;
  isApprovedForExit: (tokenId: string) => Promise<boolean>;
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
  disconnect: () => {
  },
  fetchBalance: async () => {
  },
  sendTransaction: async () => '',
  approveERC20: async () => '',
  approveERC721: async () => '',
  depositETH: async () => '',
  getTransactionHistory: async () => [],
  startStrategy: async () => '',
  exitStrategy: async () => '',
  getUserPosition: async () => ({}),
  isApprovedForFeeHook: async () => false,
  isApprovedForExit: async () => false,
});

// Define props for WalletProvider
interface WalletProviderProps {
  children: ReactNode;
}

// Create WalletProvider component
const WalletProvider: React.FC<WalletProviderProps> = ({children}) => {
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

  // Initialize contract instances
  useEffect(() => {
    if (provider && signer && chainId === baseChain.id) {
      const addresses = getContractAddresses(chainId);

      // Initialize contract instances
      const lpManager = new Contract(
        addresses.leveragedLPManager,
        LeveragedLPManagerABI,
        signer
      );
      setLeveragedLPManager(lpManager);

      const feeHook = new Contract(
        addresses.feeCollectHook,
        FeeCollectHookABI,
        signer
      );
      setFeeCollectHook(feeHook);

      const posManager = new Contract(
        addresses.uniswapV4PositionManager,
        ERC721ABI, // Using ERC721 interface for position manager
        signer
      );
      setPositionManager(posManager);
    }
  }, [provider, signer, chainId]);


  // Connect wallet
  const connect = async (): Promise<boolean> => {
    setIsConnecting(true);
    setError(null);

    try {
      // Check if ethereum is available
      if (!window.ethereum) {
        throw new Error('No Ethereum wallet detected. Please install MetaMask or another compatible wallet.');
      }

      // Request accounts
      const accounts = await window.ethereum.request({method: 'eth_requestAccounts'});
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
            params: [{chainId: `0x${baseChain.id.toString(16)}`}],
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
                params: [{
                  chainId: `0x${baseChain.id.toString(16)}`,
                  chainName: 'Base',
                  nativeCurrency: {
                    name: 'ETH',
                    symbol: 'ETH',
                    decimals: 18
                  },
                  rpcUrls: ['https://mainnet.base.org'],
                  blockExplorerUrls: ['https://basescan.org']
                }],
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
            safeAddress: savedSafeAddress
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
        threshold: 1
      };

      // Create Safe deployment config
      const safeDeploymentConfig: SafeDeploymentConfig = {};

      // Create predicted Safe props
      const predictedSafe: PredictedSafeProps = {
        safeAccountConfig,
        safeDeploymentConfig
      };

      // Initialize Safe SDK
      const protocolKit = await Safe.init({
        provider: rpcUrl,
        signer: signerAddress,
        predictedSafe
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
        value: ethers.BigNumber.from(deploymentTransaction.value)
      });

      // Wait for the transaction to be mined
      const receipt = await tx.wait();
      console.log('Safe deployed with transaction hash:', receipt.transactionHash);

      // Connect to the deployed Safe
      const deployedSafeProtocolKit = await protocolKit.connect({
        safeAddress: predictedSafeAddress
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

  // Send transaction
  const sendTransaction = async (to: string, value: string, data = '0x') => {
    if (!safeAddress || !signer || !safeSDK) {
      throw new Error('Wallet not connected or Safe not initialized');
    }

    try {
      // Create transaction
      const safeTransactionData = {
        to,
        value: utils.parseEther(value).toString(),
        data
      };

      // Create and execute transaction
      const safeTransaction = await safeSDK.createTransaction({safeTransactionData});
      const txResponse = await safeSDK.executeTransaction(safeTransaction);
      const receipt = await txResponse.transactionResponse?.wait();

      // Refresh balance
      await fetchBalance();

      return receipt.transactionHash;
    } catch (error) {
      console.error('Transaction error:', error);
      throw error;
    }
  };

  // Approve ERC20 token for spending
  const approveERC20 = async (tokenAddress: string, spender: string, amount: string): Promise<string> => {
    try {
      if (!provider || !signer || !safeAddress || !safeSDK) {
        throw new Error('No provider, signer, or Safe address available');
      }

      // Create ERC20 contract instance
      const tokenContract = new Contract(tokenAddress, ERC20ABI, provider);

      // Get token decimals
      const decimals = await tokenContract.decimals();

      // Create approval transaction data
      const approvalData = tokenContract.interface.encodeFunctionData(
        'approve',
        [spender, utils.parseUnits(amount, decimals)]
      );

      // Create and execute transaction
      const safeTransactionData = {
        to: tokenAddress,
        value: '0',
        data: approvalData
      };

      const safeTransaction = await safeSDK.createTransaction({safeTransactionData});
      const txResponse = await safeSDK.executeTransaction(safeTransaction);
      const receipt = await txResponse.transactionResponse?.wait();

      return receipt.transactionHash;
    } catch (error) {
      console.error('ERC20 approval error:', error);
      throw error;
    }
  };

  // Approve ERC721 token (NFT)
  const approveERC721 = async (tokenAddress: string, spender: string, tokenId: string): Promise<string> => {
    if (!safeAddress || !signer) {
      throw new Error('Wallet not connected');
    }

    try {
      // Create ERC721 contract instance
      const nftContract = new Contract(
        tokenAddress,
        ERC721ABI,
        signer
      );

      // In a simplified approach for the hackathon, we'll call approve directly
      // In a production environment with Safe, we would use the Safe SDK
      const tx = await nftContract.approve(spender, tokenId);
      const receipt = await tx.wait();

      return receipt.transactionHash;
    } catch (error) {
      console.error('ERC721 approval error:', error);
      throw error;
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
        value: utils.parseEther(amount)
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

  // Start leveraged LP strategy
  const startStrategy = async (ethAmount: string, ltv: number) => {
    if (!safeAddress || !signer || !leveragedLPManager) {
      throw new Error('Wallet not connected or contracts not initialized');
    }

    try {
      // Validate inputs
      if (parseFloat(ethAmount) <= 0) {
        throw new Error('ETH amount must be greater than 0');
      }

      if (ltv < 0 || ltv > 75) {
        throw new Error('LTV must be between 0 and 75');
      }

      // Create transaction data for startStrategy
      const txData = leveragedLPManager.interface.encodeFunctionData(
        'startStrategy',
        [utils.parseEther(ethAmount), ltv]
      );

      // Create and execute transaction
      const safeTransactionData = {
        to: leveragedLPManager.address,
        value: '0',
        data: txData
      };

      const safeTransaction = await safeSDK.createTransaction({safeTransactionData});
      const txResponse = await safeSDK.executeTransaction(safeTransaction);
      const receipt = await txResponse.transactionResponse?.wait();

      // Refresh balance
      await fetchBalance();

      return receipt.transactionHash;
    } catch (error) {
      console.error('Start strategy error:', error);
      throw error;
    }
  };

  // Exit leveraged LP strategy
  const exitStrategy = async (positionId: string): Promise<string> => {
    if (!safeAddress || !signer || !leveragedLPManager) {
      throw new Error('Wallet not connected or contracts not initialized');
    }

    try {
      // Check if position exists
      const position = await leveragedLPManager.positions(safeAddress, positionId);

      if (!position || position.tokenId.toString() === '0') {
        throw new Error('Position not found');
      }

      // Create transaction data for exitStrategy
      const txData = leveragedLPManager.interface.encodeFunctionData(
        'exitStrategy',
        [positionId]
      );

      // Create and execute transaction
      const safeTransactionData = {
        to: leveragedLPManager.address,
        value: '0',
        data: txData
      };

      const safeTransaction = await safeSDK.createTransaction({safeTransactionData});
      const txResponse = await safeSDK.executeTransaction(safeTransaction);
      const receipt = await txResponse.transactionResponse?.wait();

      // Refresh balance
      await fetchBalance();

      return receipt.transactionHash;
    } catch (error) {
      console.error('Exit strategy error:', error);
      throw error;
    }
  };

  // Get user's position
  const getUserPosition = async () => {
    if (!safeAddress || !leveragedLPManager) {
      throw new Error('Wallet not connected or contracts not initialized');
    }

    try {
      // Get position count
      const positionCount = await leveragedLPManager.getPositionCount(safeAddress);

      if (positionCount.toString() === '0') {
        return null;
      }

      // Get the latest position
      const positionId = positionCount.sub(1).toString();
      const position = await leveragedLPManager.positions(safeAddress, positionId);

      return {
        positionId,
        tokenId: position.tokenId.toString(),
        ethAmount: utils.formatEther(position.ethAmount),
        ltv: position.ltv.toString(),
        createdAt: new Date(position.createdAt.toNumber() * 1000).toISOString(),
        active: position.active
      };
    } catch (error) {
      console.error('Get position error:', error);
      throw error;
    }
  };

  // Check if LP NFT is approved for fee hook
  const isApprovedForFeeHook = async (tokenId: string) => {
    if (!positionManager || !feeCollectHook) {
      throw new Error('Contracts not initialized');
    }

    try {
      // Check approval
      const approved = await positionManager.getApproved(tokenId);
      return approved === feeCollectHook.address;
    } catch (error) {
      console.error('Check fee hook approval error:', error);
      return false;
    }
  };

  // Check if LP NFT is approved for exit
  const isApprovedForExit = async (tokenId: string) => {
    if (!positionManager || !leveragedLPManager) {
      throw new Error('Contracts not initialized');
    }

    try {
      // Check approval
      const approved = await positionManager.getApproved(tokenId);
      return approved === leveragedLPManager.address;
    } catch (error) {
      console.error('Check exit approval error:', error);
      return false;
    }
  };

  // Get transaction history
  const getTransactionHistory = async () => {
    if (!safeAddress || !provider || !signer) {
      throw new Error('Wallet not connected');
    }

    try {
      // Create EthersAdapter instance
      const ethAdapter = new EthersAdapter({
        ethers,
        signerOrProvider: signer || provider
      });

      // Initialize Safe API Kit
      const safeService = new SafeApiKit({
        txServiceUrl: 'https://safe-transaction-base.safe.global',
        chainId: BigInt(baseChain.id)
      });

      // Get transaction history
      const history = await safeService.getMultisigTransactions(safeAddress);

      // Get additional transaction details
      const transactions = await Promise.all(
        history.results.map(async (tx) => {
          try {
            // Get transaction receipt
            const receipt = await provider.getTransactionReceipt(tx.transactionHash);

            // Get block information
            const block = await provider.getBlock(receipt.blockNumber);

            return {
              hash: tx.transactionHash,
              to: tx.to,
              value: utils.formatEther(tx.value),
              timestamp: block.timestamp,
              status: receipt.status === 1 ? 'Success' : 'Failed',
              gasUsed: receipt.gasUsed.toString()
            };
          } catch (error) {
            return {
              hash: tx.transactionHash,
              to: tx.to,
              value: utils.formatEther(tx.value),
              timestamp: null,
              status: 'Unknown',
              gasUsed: '0'
            };
          }
        })
      );

      return transactions;
    } catch (error) {
      console.error('Get transaction history error:', error);
      return [];
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
    <WalletContext.Provider value={{
      isConnected,
      isLoading,
      account,
      chainId,
      safeAddress,
      balance,
      connect,
      createSafeAccount,
      disconnect,
      fetchBalance,
      sendTransaction,
      approveERC20,
      approveERC721,
      depositETH,
      getTransactionHistory,
      startStrategy,
      exitStrategy,
      getUserPosition,
      isApprovedForFeeHook,
      isApprovedForExit,
    }}>
      {children}
    </WalletContext.Provider>
  );
};

// Custom hook to use the wallet context
export const useWallet = () => useContext(WalletContext);

export default WalletProvider;
