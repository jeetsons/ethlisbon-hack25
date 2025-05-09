import React, { useState, useEffect } from 'react';
import { useWallet } from '../contexts/WalletContext';
import { formatUsdcBalance } from '../utils/address';
import { ethers } from 'ethers';

// Contract addresses - in a real app, these would be imported from a config file
const LEVERAGED_LP_MANAGER_ADDRESS = "0x1234567890123456789012345678901234567890";
const FEE_COLLECT_HOOK_ADDRESS = "0x0987654321098765432109876543210987654321";
const USDC_ADDRESS = "0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA"; // Base USDC
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006"; // Base WETH
const UNISWAP_POSITION_MANAGER_ADDRESS = "0x8e2badc74a4560f7670d79fc67a5bf5b0d802a48"; // Example address

interface StrategyStatus {
  isActive: boolean;
  ethSupplied: string;
  usdcBorrowed: string;
  lpTokenId: string;
  feeHookApproved: boolean;
  managerApproved: boolean;
  totalFees: {
    eth: string;
    usdc: string;
  };
  tradeCount: number;
  lastFeeCollection: number;
}

const Dashboard: React.FC = () => {
  const { 
    isConnected, 
    gnosisSafeAddress, 
    balance: ethBalance,
    provider,
    safeSDK
  } = useWallet();
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eventListenerActive, setEventListenerActive] = useState(false);
  
  // Initialize strategy status
  const [strategyStatus, setStrategyStatus] = useState<StrategyStatus>({
    isActive: false,
    ethSupplied: "0",
    usdcBorrowed: "0",
    lpTokenId: '',
    feeHookApproved: false,
    managerApproved: false,
    totalFees: {
      eth: "0",
      usdc: "0",
    },
    tradeCount: 0,
    lastFeeCollection: 0,
  });

  // Function to fetch strategy status from the blockchain
  const fetchStrategyStatus = async () => {
    if (!isConnected || !gnosisSafeAddress || !provider) {
      return;
    }
    
    try {
      setIsLoading(true);
      setError(null);
      
      // Create contract interface for LeveragedLPManager
      const lpManagerInterface = new ethers.Interface([
        'function userPositions(address) view returns (address safe, uint256 lpTokenId, uint256 ethSupplied, uint256 usdcBorrowed, bool isActive)',
        'function getFeeStatus(address) view returns (uint256 tradeCount, uint256 lastCollection, uint256 ethCollected, uint256 usdcCollected)'
      ]);
      
      // Create contract instance
      const lpManagerContract = new ethers.Contract(
        LEVERAGED_LP_MANAGER_ADDRESS,
        lpManagerInterface,
        provider
      );
      
      // Fetch user position
      const position = await lpManagerContract.userPositions(gnosisSafeAddress);
      
      // Check if position is active
      if (!position.isActive) {
        setStrategyStatus(prev => ({ ...prev, isActive: false }));
        setIsLoading(false);
        return;
      }
      
      // Fetch fee status
      const feeStatus = await lpManagerContract.getFeeStatus(gnosisSafeAddress);
      
      // Check approvals
      const erc721Interface = new ethers.Interface([
        'function getApproved(uint256) view returns (address)'
      ]);
      
      const positionManagerContract = new ethers.Contract(
        UNISWAP_POSITION_MANAGER_ADDRESS,
        erc721Interface,
        provider
      );
      
      const approvedForFeeHook = await positionManagerContract.getApproved(position.lpTokenId);
      const approvedForManager = await positionManagerContract.getApproved(position.lpTokenId);
      
      const feeHookApproved = approvedForFeeHook.toLowerCase() === FEE_COLLECT_HOOK_ADDRESS.toLowerCase();
      const managerApproved = approvedForManager.toLowerCase() === LEVERAGED_LP_MANAGER_ADDRESS.toLowerCase();
      
      // Update strategy status
      setStrategyStatus({
        isActive: position.isActive,
        ethSupplied: ethers.formatEther(position.ethSupplied),
        usdcBorrowed: formatUsdcBalance(position.usdcBorrowed),
        lpTokenId: position.lpTokenId.toString(),
        feeHookApproved,
        managerApproved,
        totalFees: {
          eth: ethers.formatEther(feeStatus.ethCollected),
          usdc: formatUsdcBalance(feeStatus.usdcCollected),
        },
        tradeCount: feeStatus.tradeCount.toNumber(),
        lastFeeCollection: feeStatus.lastCollection.toNumber() * 1000, // Convert to milliseconds
      });
    } catch (err) {
      console.error('Error fetching strategy status:', err);
      setError('Failed to fetch strategy status. Please try again.');
      
      // For demo purposes, set mock data if there's an error
      setStrategyStatus({
        isActive: true,
        ethSupplied: "1.0",
        usdcBorrowed: "1.5",
        lpTokenId: '12345',
        feeHookApproved: true,
        managerApproved: true,
        totalFees: {
          eth: "0.05",
          usdc: "0.075",
        },
        tradeCount: 7,
        lastFeeCollection: Date.now() - 3600000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch strategy status on component mount
  useEffect(() => {
    if (isConnected && gnosisSafeAddress) {
      fetchStrategyStatus();
    }
  }, [isConnected, gnosisSafeAddress]);

  // Refresh status every 30 seconds
  useEffect(() => {
    if (!isConnected || !gnosisSafeAddress) return;
    
    const interval = setInterval(() => {
      fetchStrategyStatus();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [isConnected, gnosisSafeAddress]);
  
  // Set up event listeners for real-time updates
  useEffect(() => {
    if (!isConnected || !gnosisSafeAddress || !provider || eventListenerActive) return;
    
    try {
      // Create contract interface for events
      const lpManagerInterface = new ethers.Interface([
        'event StrategyStarted(address indexed safe, uint256 ethAmount, uint256 usdcAmount, uint256 lpTokenId)',
        'event FeesProcessed(address indexed safe, uint256 usdcRepaid, uint256 ethAdded)',
        'event StrategyExited(address indexed safe, uint256 ethReturned, uint256 usdcReturned)'
      ]);
      
      // Create contract instance
      const lpManagerContract = new ethers.Contract(
        LEVERAGED_LP_MANAGER_ADDRESS,
        lpManagerInterface,
        provider
      );
      
      // Set up event listeners
      const handleStrategyStarted = (safe, ethAmount, usdcAmount, lpTokenId) => {
        if (safe.toLowerCase() === gnosisSafeAddress?.toLowerCase()) {
          console.log('Strategy started event detected');
          fetchStrategyStatus();
        }
      };
      
      const handleFeesProcessed = (safe, usdcRepaid, ethAdded) => {
        if (safe.toLowerCase() === gnosisSafeAddress?.toLowerCase()) {
          console.log('Fees processed event detected');
          fetchStrategyStatus();
        }
      };
      
      const handleStrategyExited = (safe, ethReturned, usdcReturned) => {
        if (safe.toLowerCase() === gnosisSafeAddress?.toLowerCase()) {
          console.log('Strategy exited event detected');
          fetchStrategyStatus();
        }
      };
      
      // Register event listeners
      lpManagerContract.on('StrategyStarted', handleStrategyStarted);
      lpManagerContract.on('FeesProcessed', handleFeesProcessed);
      lpManagerContract.on('StrategyExited', handleStrategyExited);
      
      setEventListenerActive(true);
      
      // Clean up event listeners
      return () => {
        lpManagerContract.off('StrategyStarted', handleStrategyStarted);
        lpManagerContract.off('FeesProcessed', handleFeesProcessed);
        lpManagerContract.off('StrategyExited', handleStrategyExited);
        setEventListenerActive(false);
      };
    } catch (err) {
      console.error('Error setting up event listeners:', err);
    }
  }, [isConnected, gnosisSafeAddress, provider, eventListenerActive]);

  if (!isConnected) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="bg-yellow-50 p-4 rounded-md border border-yellow-200 mb-6">
          <p className="text-yellow-700">
            Please connect your Gnosis Pay wallet to view your strategy dashboard.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Strategy Dashboard</h1>
      
      {error && (
        <div className="bg-red-50 p-4 rounded-md border border-red-200 mb-6">
          <p className="text-red-700">{error}</p>
          <button 
            onClick={fetchStrategyStatus}
            className="mt-2 text-sm text-red-600 hover:text-red-800"
          >
            Try Again
          </button>
        </div>
      )}
      
      {isLoading ? (
        <div className="bg-white p-8 rounded-lg shadow text-center">
          <p className="text-gray-600">Loading strategy data...</p>
        </div>
      ) : !strategyStatus.isActive ? (
        <div className="bg-white p-8 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">No Active Strategy</h2>
          <p className="text-gray-600 mb-4">
            You don't have an active leveraged LP strategy. Start one from the Strategy page.
          </p>
        </div>
      ) : (
        <>
          <div className="bg-white p-6 rounded-lg shadow mb-6">
            <h2 className="text-lg font-semibold mb-4">Strategy Overview</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 p-4 rounded-md">
                <h3 className="text-sm font-medium text-gray-500 mb-1">Status</h3>
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
                  <span className="font-medium">Active</span>
                </div>
              </div>
              <div className="bg-gray-50 p-4 rounded-md">
                <h3 className="text-sm font-medium text-gray-500 mb-1">LP Token ID</h3>
                <span className="font-mono">{strategyStatus.lpTokenId}</span>
              </div>
              <div className="bg-gray-50 p-4 rounded-md">
                <h3 className="text-sm font-medium text-gray-500 mb-1">ETH Supplied</h3>
                <span className="font-medium">{strategyStatus.ethSupplied} ETH</span>
              </div>
              <div className="bg-gray-50 p-4 rounded-md">
                <h3 className="text-sm font-medium text-gray-500 mb-1">USDC Borrowed</h3>
                <span className="font-medium">{strategyStatus.usdcBorrowed} USDC</span>
              </div>
            </div>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow mb-6">
            <h2 className="text-lg font-semibold mb-4">Approval Status</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium">FeeCollectHook</span>
                  <p className="text-sm text-gray-500">For automated fee collection</p>
                </div>
                <div className={`px-3 py-1 rounded-full ${
                  strategyStatus.feeHookApproved 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-red-100 text-red-800'
                }`}>
                  {strategyStatus.feeHookApproved ? 'Approved' : 'Not Approved'}
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium">LeveragedLPManager</span>
                  <p className="text-sm text-gray-500">For strategy exit/unwind</p>
                </div>
                <div className={`px-3 py-1 rounded-full ${
                  strategyStatus.managerApproved 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-red-100 text-red-800'
                }`}>
                  {strategyStatus.managerApproved ? 'Approved' : 'Not Approved'}
                </div>
              </div>
            </div>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow mb-6">
            <h2 className="text-lg font-semibold mb-4">Fee Collection</h2>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-gray-50 p-4 rounded-md">
                <h3 className="text-sm font-medium text-gray-500 mb-1">Total ETH Fees</h3>
                <span className="font-medium">{strategyStatus.totalFees.eth} ETH</span>
              </div>
              <div className="bg-gray-50 p-4 rounded-md">
                <h3 className="text-sm font-medium text-gray-500 mb-1">Total USDC Fees</h3>
                <span className="font-medium">{strategyStatus.totalFees.usdc} USDC</span>
              </div>
            </div>
            
            <div className="bg-blue-50 p-4 rounded-md">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-blue-800">Trade Count</span>
                <span className="font-medium">{strategyStatus.tradeCount} / 10</span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2.5">
                <div 
                  className="bg-blue-600 h-2.5 rounded-full" 
                  style={{ width: `${(strategyStatus.tradeCount / 10) * 100}%` }}
                ></div>
              </div>
              <p className="mt-2 text-sm text-blue-600">
                Next fee collection at 10 trades. Currently at {strategyStatus.tradeCount} trades.
              </p>
            </div>
          </div>
          
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-lg font-semibold mb-4">Recent Events</h2>
            <div className="space-y-3">
              <div className="p-3 border-l-4 border-green-500">
                <div className="flex justify-between">
                  <span className="font-medium">Fee Collection</span>
                  <span className="text-sm text-gray-500">
                    {new Date(strategyStatus.lastFeeCollection).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-gray-600">
                  Collected 0.02 ETH and 0.03 USDC in fees. Repaid USDC debt and added ETH collateral.
                </p>
              </div>
              
              <div className="p-3 border-l-4 border-blue-500">
                <div className="flex justify-between">
                  <span className="font-medium">Strategy Started</span>
                  <span className="text-sm text-gray-500">
                    {new Date(strategyStatus.lastFeeCollection - 86400000).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-gray-600">
                  Deposited 1 ETH, borrowed 1.5 USDC, and created LP position with ID {strategyStatus.lpTokenId}.
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;
