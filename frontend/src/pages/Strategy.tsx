import React, { useState, useEffect } from 'react';
import { useWallet } from '../contexts/WalletContext';
import { ethers } from 'ethers';
import config from '../config';
import * as ABIs from '../abis';

// Define types for our component state
interface StrategyStatusType {
  isApproved: boolean;
  isStarted: boolean;
  positionId: string | null;
}

const Strategy: React.FC = () => {
  const {
    isConnected,
    safeAddress,
    balance: ethBalance,
    fetchBalance,
    convertEthToWeth,
    startStrategy,
  } = useWallet();

  const [usdcBalance, setUsdcBalance] = useState<string>('0');
  const [isLoadingBalances, setIsLoadingBalances] = useState<boolean>(false);
  const [amount, setAmount] = useState('');
  const [ltv, setLtv] = useState('50'); // Default to 50% LTV
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // State for strategy status
  const [strategyStatus, setStrategyStatus] = useState<StrategyStatusType>({
    isApproved: false,
    isStarted: false,
    positionId: null,
  });

  // Fetch balances on component mount and when wallet connection changes
  useEffect(() => {
    if (isConnected && safeAddress) {
      fetchBalance();
      fetchUsdcBalance();
    }
  }, [isConnected, safeAddress, fetchBalance]);

  // Function to fetch USDC balance
  const fetchUsdcBalance = async () => {
    if (!isConnected || !safeAddress) return;

    try {
      setIsLoadingBalances(true);

      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const usdcContract = new ethers.Contract(config.addresses.usdc, ABIs.ERC20, provider);
      const balance = await usdcContract.balanceOf(safeAddress);

      const formattedBalance = ethers.utils.formatUnits(balance, 6);
      setUsdcBalance(formattedBalance);
    } catch (error) {
      console.error('Error fetching USDC balance:', error);
    } finally {
      setIsLoadingBalances(false);
    }
  };

  const handleCompleteApproval = async () => {
    if (!isConnected || !safeAddress) {
      setError('Please connect your Gnosis Pay wallet first');
      return;
    }

    try {
      setIsProcessing(true);
      setError(null);
      setSuccess('Starting approval process...');

      const ethAmount = '0.0001'; // 0.0001 ETH
      const ltvValue = 50; // 50% LTV

      setSuccess('Step 1/4: Converting ETH to WETH...');
      await convertEthToWeth(ethAmount);

      setSuccess('Steps 2-4: Completing approvals for WETH, USDC, and Aave delegation...');
      const approvalResult = await startStrategy(ethAmount, ltvValue);

      if (approvalResult) {
        setStrategyStatus(prev => ({ ...prev, isApproved: true }));
        setSuccess(`All approvals completed successfully!`);

        // Refresh balances
        await fetchBalance();
        await fetchUsdcBalance();

        // Reset success message after 5 seconds
        setTimeout(() => {
          setSuccess('All approvals completed! You can now start the strategy.');
        }, 5000);
      }
    } catch (err) {
      console.error('Error completing approvals:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to complete approvals. Please try again.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white p-4 rounded-md border border-gray-200 mb-6">
          <p>Please connect your Gnosis Pay wallet to start the strategy.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl text-black font-bold mb-6">Start Leveraged LP Strategy</h1>

      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-lg font-semibold mb-4 text-black">Current Balances</h2>
        <div className="bg-white p-4 rounded-md border border-gray-200">
          {isLoadingBalances ? (
            <div className="text-center py-2">
              <p>Loading balances...</p>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center mb-2">
                <span>ETH Balance:</span>
                <span className="font-mono font-medium text-black">{ethBalance} ETH</span>
              </div>
              <div className="flex justify-between items-center">
                <span>USDC Balance:</span>
                <span className="font-mono font-medium text-black">{usdcBalance} USDC</span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-lg font-semibold mb-4 text-black">1. Setup & Approvals</h2>

        {success && (
          <div className="bg-white p-4 rounded-md border border-gray-200 mb-4">
            <p className="text-black">{success}</p>
          </div>
        )}

        {error && (
          <div className="bg-white p-4 rounded-md border border-gray-200 mb-4">
            <p className="text-black">{error}</p>
          </div>
        )}

        <div className="bg-white p-4 rounded-md border border-gray-200 mb-4">
          <p className="text-black mb-2">
            This single button will perform all required setup steps:
          </p>
          <ol className="list-decimal pl-5 text-black space-y-1 mb-4">
            <li>Convert ETH to WETH</li>
            <li>Approve WETH for LeveragedLPManager</li>
            <li>Approve USDC for LeveragedLPManager</li>
          </ol>
        </div>

        <button
          onClick={handleCompleteApproval}
          disabled={isProcessing || strategyStatus.isApproved}
          className={`w-full px-4 py-3 rounded-md ${
            strategyStatus.isApproved
              ? 'bg-green-100 text-green-800'
              : 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300'
          }`}
        >
          {strategyStatus.isApproved
            ? 'All Approvals Complete ✓'
            : isProcessing
              ? 'Processing...'
              : 'Complete All Approvals'}
        </button>
      </div>

      {strategyStatus.isStarted && strategyStatus.positionId && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4 text-black">3. Strategy Active</h2>
          <div className="bg-white p-4 rounded-md border border-gray-200 mb-4">
            <p className="text-black font-medium mb-2">
              Your strategy is now active with position ID: {strategyStatus.positionId}
            </p>
            <p className="text-black">
              You can view your position details and performance on the Dashboard page.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default Strategy;
