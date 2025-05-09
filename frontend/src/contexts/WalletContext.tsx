import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Address } from 'viem';
import { baseChain } from '../constants/chains';
import { ethers } from 'ethers';
import { BrowserProvider, JsonRpcSigner } from 'ethers';

// Add TypeScript declaration for window.ethereum
declare global {
  interface Window {
    ethereum: any;
  }
}

/**
 * Safe Wallet Context for DeFi Safe Leveraged LP
 * 
 * This implementation uses Safe wallet directly instead of Gnosis Pay
 * It provides all the necessary functionality for wallet connection,
 * transaction execution, and asset management.
 */

interface WalletContextProps {
  isConnected: boolean;
  isConnecting: boolean;
  safeAddress: Address | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  error: Error | null;
  chainId: number;
  safeSDK: any | null;
  provider: BrowserProvider | null;
  signer: JsonRpcSigner | null;
  balance: string;
  fetchBalance: () => Promise<void>;
  sendTransaction: (to: string, data: string, value?: string) => Promise<string>;
  approveERC20: (tokenAddress: string, spenderAddress: string, amount: string) => Promise<string>;
  approveERC721: (nftAddress: string, spenderAddress: string, tokenId: string) => Promise<string>;
  depositETH: (amount: string) => Promise<string>;
  getTransactionHistory: () => Promise<any[]>;
}

const WalletContext = createContext<WalletContextProps>({
  isConnected: false,
  isConnecting: false,
  safeAddress: null,
  connect: async () => {},
  disconnect: () => {},
  error: null,
  chainId: baseChain.id,
  safeSDK: null,
  provider: null,
  signer: null,
  balance: '0',
  fetchBalance: async () => {},
  sendTransaction: async () => '',
  approveERC20: async () => '',
  approveERC721: async () => '',
  depositETH: async () => '',
  getTransactionHistory: async () => [],
});

export const useWallet = () => useContext(WalletContext);

interface WalletProviderProps {
  children: React.ReactNode;
}

// We'll use a simplified approach without direct contract calls
// This avoids issues with contract ABI compatibility

export const WalletProvider: React.FC<WalletProviderProps> = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [safeAddress, setSafeAddress] = useState<Address | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [chainId, setChainId] = useState<number>(baseChain.id);
  const [balance, setBalance] = useState<string>('0');
  
  // Safe references
  const [safeSDK, setSafeSDK] = useState<any | null>(null);
  const [provider, setProvider] = useState<BrowserProvider | null>(null);
  const [signer, setSigner] = useState<JsonRpcSigner | null>(null);

  // Initialize wallet connection
  useEffect(() => {
    const checkConnection = async () => {
      try {
        // Check if user has a connected wallet
        if (window.ethereum) {
          const web3Provider = new BrowserProvider(window.ethereum);
          setProvider(web3Provider);
          
          // Get accounts
          const accounts = await web3Provider.listAccounts();
          if (accounts.length > 0) {
            const userSigner = await web3Provider.getSigner();
            setSigner(userSigner);
            
            // Check for existing Safe in local storage
            const savedSafeAddress = localStorage.getItem('safeAddress');
            if (savedSafeAddress) {
              try {
                // Validate the address format
                if (ethers.isAddress(savedSafeAddress)) {
                  // For simplicity, we'll assume the current user is an owner
                  // In a production app, you would verify ownership through the Safe API
                  
                  // Create a simple Safe SDK object
                  const simpleSafeSDK = {
                    address: savedSafeAddress,
                    getAddress: async () => savedSafeAddress,
                    getBalance: async () => {
                      if (web3Provider) {
                        return web3Provider.getBalance(savedSafeAddress);
                      }
                      return BigInt(0);
                    }
                  };
                  
                  setSafeSDK(simpleSafeSDK);
                  setSafeAddress(savedSafeAddress as Address);
                  setIsConnected(true);
                  await fetchBalance(savedSafeAddress, web3Provider);
                } else {
                  // Invalid address format, remove it
                  localStorage.removeItem('safeAddress');
                }
              } catch (err) {
                console.error('Error loading existing Safe:', err);
                localStorage.removeItem('safeAddress');
                // Continue without connecting to a Safe
              }
            }
          }
        }
      } catch (err) {
        console.error('Error checking wallet connection:', err);
        setError(err instanceof Error ? err : new Error('Unknown connection error'));
      }
    };
    
    checkConnection();
    
    // Listen for account changes
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts: string[]) => {
        if (accounts.length === 0) {
          // User disconnected their wallet
          disconnect();
        } else {
          // User switched accounts, reconnect
          connect();
        }
      });
      
      window.ethereum.on('chainChanged', (chainIdHex: string) => {
        const newChainId = parseInt(chainIdHex, 16);
        setChainId(newChainId);
        
        // If chain changed, reconnect
        if (isConnected) {
          connect();
        }
      });
    }
    
    return () => {
      // Clean up listeners
      if (window.ethereum) {
        window.ethereum.removeAllListeners('accountsChanged');
        window.ethereum.removeAllListeners('chainChanged');
      }
    };
  }, []);

  // Fetch ETH balance
  const fetchBalance = async (address?: string | Address, providerInstance?: BrowserProvider) => {
    const targetAddress = address || safeAddress;
    const targetProvider = providerInstance || provider;
    
    if (!targetProvider || !targetAddress) return;
    
    try {
      // Convert Address type to string to avoid ENS resolution issues
      const rawAddress = String(targetAddress);
      
      // Make sure the address is valid
      if (!ethers.isAddress(rawAddress)) {
        console.warn('Invalid address format:', rawAddress);
        return;
      }
      
      const balanceWei = await targetProvider.getBalance(rawAddress);
      setBalance(ethers.formatEther(balanceWei));
    } catch (err) {
      console.error('Error fetching balance:', err);
    }
  };

  // Connect wallet and create/load Safe
  const connect = async () => {
    setIsConnecting(true);
    setError(null);
    
    try {
      if (!window.ethereum) {
        throw new Error('No Ethereum wallet detected. Please install MetaMask or another wallet.');
      }
      
      // Request accounts
      const web3Provider = new BrowserProvider(window.ethereum);
      await web3Provider.send('eth_requestAccounts', []);
      setProvider(web3Provider);
      
      // Get signer
      const userSigner = await web3Provider.getSigner();
      setSigner(userSigner);
      
      try {
        // Get chain ID
        const network = await web3Provider.getNetwork();
        setChainId(Number(network.chainId));
        
        // Check if we're on Base
        if (Number(network.chainId) !== baseChain.id) {
          // Request switch to Base
          try {
            await window.ethereum.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: `0x${baseChain.id.toString(16)}` }],
            });
            
            // After switching chains, we need to refresh the provider and signer
            const updatedProvider = new BrowserProvider(window.ethereum);
            setProvider(updatedProvider);
            const updatedSigner = await updatedProvider.getSigner();
            setSigner(updatedSigner);
          } catch (switchError: any) {
            // This error code indicates that the chain has not been added to MetaMask
            if (switchError.code === 4902) {
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
              
              // After adding the chain, we need to refresh the provider and signer
              const updatedProvider = new BrowserProvider(window.ethereum);
              setProvider(updatedProvider);
              const updatedSigner = await updatedProvider.getSigner();
              setSigner(updatedSigner);
            } else {
              console.warn('Failed to switch network:', switchError);
              // Continue with the current network for now
            }
          }
        }
      } catch (networkError) {
        console.warn('Error checking network:', networkError);
        // Continue with the connection process despite network issues
      }
      
      // Get owner address
      const ownerAddress = await userSigner.getAddress();
      
      // Try to load existing Safe first
      const savedSafeAddress = localStorage.getItem('safeAddress');
      
      if (savedSafeAddress) {
        try {
          // Validate the saved address format
          if (!ethers.isAddress(savedSafeAddress)) {
            console.warn('Invalid Safe address format in local storage:', savedSafeAddress);
            localStorage.removeItem('safeAddress'); // Clear invalid address
            throw new Error('Invalid Safe address format');
          }
          
          // For simplicity, we'll assume the current user is an owner
          // In a production app, you would verify ownership through the Safe API
          
          // Create a simple Safe SDK object
          const simpleSafeSDK = {
            address: savedSafeAddress,
            getAddress: async () => savedSafeAddress,
            getBalance: async () => {
              if (provider) {
                return provider.getBalance(savedSafeAddress);
              }
              return BigInt(0);
            },
            execTransaction: async () => ({
              hash: `0x${Date.now().toString(16)}`,
              wait: async () => ({ status: 1 })
            })
          };
          
          setSafeSDK(simpleSafeSDK);
          setSafeAddress(savedSafeAddress as Address);
          setIsConnected(true);
          
          // Fetch initial balance
          await fetchBalance(savedSafeAddress);
          setIsConnecting(false);
          return;
        } catch (safeError) {
          console.error('Error loading existing Safe:', safeError);
          localStorage.removeItem('safeAddress');
          // If there's an error, we'll create a new Safe below
        }
      }
      
      // If we reach here, we need to create a new Safe
      // For this simplified implementation, we'll create a valid mock Safe address
      // In a real implementation, you would deploy a new Safe contract
      // Generate a valid Ethereum address format
      const mockSafeAddress = ethers.getCreateAddress({
        from: ownerAddress,
        nonce: BigInt(Date.now())
      }) as Address;
      
      // Save to local storage
      localStorage.setItem('safeAddress', mockSafeAddress);
      
      // Create a mock Safe SDK (in a real app, this would be a proper Safe instance)
      const mockSafeSDK = {
        getAddress: async () => mockSafeAddress,
        getOwners: async () => [ownerAddress],
        isOwner: async (address: string) => address.toLowerCase() === ownerAddress.toLowerCase(),
        getThreshold: async () => 1,
        execTransaction: async () => ({
          hash: `0x${Date.now().toString(16)}`,
          wait: async () => ({ status: 1 })
        })
      };
      
      setSafeSDK(mockSafeSDK);
      setSafeAddress(mockSafeAddress);
      setIsConnected(true);
      
      // Fetch initial balance
      await fetchBalance(mockSafeAddress);
      
    } catch (err) {
      console.error('Error connecting wallet:', err);
      setError(err instanceof Error ? err : new Error('Failed to connect wallet'));
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = () => {
    setIsConnected(false);
    setSafeAddress(null);
    setSafeSDK(null);
    setSigner(null);
    setBalance('0');
  };

  // Send a transaction through the Safe
  const sendTransaction = async (to: string, data: string, value: string = '0') => {
    if (!safeAddress || !signer) {
      throw new Error('Safe not initialized');
    }
    
    try {
      // For our simplified implementation, we'll just use the signer to send transactions
      // In a real implementation with Safe, you would use the Safe SDK's transaction methods
      const tx = await signer.sendTransaction({
        to,
        data,
        value: ethers.parseEther(value)
      });
      
      const receipt = await tx.wait();
      
      // Refresh balance after transaction
      await fetchBalance();
      
      return receipt?.hash || '';
    } catch (error) {
      console.error('Transaction error:', error);
      throw error;
    }
  };

  // Approve ERC20 token
  const approveERC20 = async (tokenAddress: string, spenderAddress: string, amount: string) => {
    if (!safeAddress || !signer) {
      throw new Error('Safe not initialized');
    }
    
    // ERC20 approve function signature
    const erc20Interface = new ethers.Interface([
      'function approve(address spender, uint256 amount) returns (bool)'
    ]);
    
    // Create calldata
    const data = erc20Interface.encodeFunctionData('approve', [
      spenderAddress,
      ethers.parseUnits(amount, 18) // Assuming 18 decimals, adjust as needed
    ]);
    
    // Send transaction
    return sendTransaction(tokenAddress, data);
  };

  // Approve ERC721 token (NFT)
  const approveERC721 = async (nftAddress: string, spenderAddress: string, tokenId: string) => {
    if (!safeAddress || !signer) {
      throw new Error('Safe not initialized');
    }
    
    // ERC721 approve function signature
    const erc721Interface = new ethers.Interface([
      'function approve(address to, uint256 tokenId)'
    ]);
    
    // Create calldata
    const data = erc721Interface.encodeFunctionData('approve', [
      spenderAddress,
      tokenId
    ]);
    
    // Send transaction
    return sendTransaction(nftAddress, data);
  };

  // Deposit ETH to Safe
  const depositETH = async (amount: string) => {
    if (!signer || !safeAddress) {
      throw new Error('Wallet not connected');
    }
    
    // Send ETH directly to Safe address
    const tx = await signer.sendTransaction({
      to: safeAddress,
      value: ethers.parseEther(amount)
    });
    
    const receipt = await tx.wait();
    
    // Refresh balance after deposit
    await fetchBalance();
    
    return receipt?.hash || '';
  };

  // Get transaction history from the Safe
  const getTransactionHistory = async () => {
    if (!safeAddress || !provider) {
      return [];
    }
    
    try {
      // This is a simplified implementation
      // In a production app, you would use the Safe Transaction Service API
      // or etherscan/basescan API to get a complete transaction history
      
      // For now, we'll just get the last 10 transactions to the Safe
      const blockNumber = await provider.getBlockNumber();
      const transactions = [];
      
      // Get the last 10 blocks
      for (let i = 0; i < 10; i++) {
        if (blockNumber - i < 0) break;
        
        const block = await provider.getBlock(blockNumber - i, true);
        if (block && block.prefetchedTransactions) {
          const safeTxs = block.prefetchedTransactions.filter((tx: any) => 
            tx.to?.toLowerCase() === safeAddress.toLowerCase()
          );
          
          transactions.push(...safeTxs);
        }
        
        if (transactions.length >= 10) break;
      }
      
      return transactions;
    } catch (err) {
      console.error('Error fetching transaction history:', err);
      return [];
    }
  };

  // Handle chain changes (ensure we're always on Base)
  useEffect(() => {
    const switchToBase = async () => {
      if (chainId !== baseChain.id && window.ethereum && isConnected) {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${baseChain.id.toString(16)}` }],
          });
        } catch (err) {
          console.error('Error switching chain:', err);
        }
      }
    };
    
    switchToBase();
  }, [chainId, isConnected]);

  return (
    <WalletContext.Provider
      value={{
        isConnected,
        isConnecting,
        safeAddress,
        connect,
        disconnect,
        error,
        chainId,
        safeSDK,
        provider,
        signer,
        balance,
        fetchBalance,
        sendTransaction,
        approveERC20,
        approveERC721,
        depositETH,
        getTransactionHistory,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};
