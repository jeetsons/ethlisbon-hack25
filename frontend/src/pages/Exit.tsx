import React, { useState, useEffect } from 'react';
import { useWallet } from '../contexts/WalletContext';
import { formatEthBalance, formatUsdcBalance } from '../utils/address';

interface StrategyStatus {
  isActive: boolean;
  ethSupplied: bigint;
  usdcBorrowed: bigint;
  lpTokenId: string;
  managerApproved: boolean;
}

const Exit: React.FC = () => {
  const { isConnected, gnosisSafeAddress } = useWallet();
  const [isLoading, setIsLoading] = useState(true);
  const [isExiting, setIsExiting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Mock strategy status - in a real app, you would fetch this from the blockchain
  const [strategyStatus, setStrategyStatus] = useState<StrategyStatus>({
    isActive: false,
    ethSupplied: BigInt(0),
    usdcBorrowed: BigInt(0),
    lpTokenId: '',
    managerApproved: false,
  });

  // Mock function to fetch strategy status
  const fetchStrategyStatus = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // In a real implementation, you would fetch the strategy status from the blockchain
      // Example:
      // const status = await leveragedLPManagerContract.userPositions(gnosisSafeAddress);

      // For demo purposes, we'll simulate a strategy status
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Mock data
      setStrategyStatus({
        isActive: true,
        ethSupplied: BigInt(1000000000000000000), // 1 ETH
        usdcBorrowed: BigInt(1500000), // 1.5 USDC
        lpTokenId: '12345',
        managerApproved: true,
      });
    } catch (err) {
      console.error('Error fetching strategy status:', err);
      setError('Failed to fetch strategy status. Please try again.');
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

  const handleApproveManager = async () => {
    try {
      setIsExiting(true);
      setError(null);

      // In a real implementation, you would use the Gnosis Pay SDK to approve the manager
      // Example:
      // await gnosisPay.approveERC721(
      //   positionManagerAddress,
      //   leveragedLPManagerAddress,
      //   strategyStatus.lpTokenId
      // );

      // For demo purposes, we'll simulate a successful approval
      await new Promise(resolve => setTimeout(resolve, 2000));

      setStrategyStatus(prev => ({ ...prev, managerApproved: true }));
      setSuccess('LP Manager approved successfully!');

      // Reset success message after 3 seconds
      setTimeout(() => {
        setSuccess(null);
      }, 3000);
    } catch (err) {
      console.error('Error approving LP Manager:', err);
      setError('Failed to approve LP Manager. Please try again.');
    } finally {
      setIsExiting(false);
    }
  };

  const handleExitStrategy = async () => {
    try {
      setIsExiting(true);
      setError(null);

      if (!strategyStatus.managerApproved) {
        setError('Please approve the LP Manager before exiting the strategy');
        setIsExiting(false);
        return;
      }

      // In a real implementation, you would use the Gnosis Pay SDK to exit the strategy
      // Example:
      // await gnosisPay.executeTransaction(
      //   leveragedLPManagerAddress,
      //   'exitStrategy',
      //   [gnosisSafeAddress]
      // );

      // For demo purposes, we'll simulate a successful exit
      await new Promise(resolve => setTimeout(resolve, 3000));

      setStrategyStatus(prev => ({ ...prev, isActive: false }));
      setSuccess(
        'Strategy exited successfully! Assets have been returned to your Gnosis Pay wallet.'
      );

      // Reset success message after 5 seconds
      setTimeout(() => {
        setSuccess(null);
      }, 5000);
    } catch (err) {
      console.error('Error exiting strategy:', err);
      setError('Failed to exit strategy. Please try again.');
    } finally {
      setIsExiting(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-yellow-50 p-4 rounded-md border border-yellow-200 mb-6">
          <p className="text-yellow-700">
            Please connect your Gnosis Pay wallet to exit your strategy.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Exit Strategy</h1>

      {error && (
        <div className="bg-red-50 p-4 rounded-md border border-red-200 mb-6">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-green-50 p-4 rounded-md border border-green-200 mb-6">
          <p className="text-green-700">{success}</p>
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
            You don't have an active leveraged LP strategy to exit.
          </p>
        </div>
      ) : (
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Exit Your Leveraged LP Strategy</h2>

          <div className="bg-yellow-50 p-4 rounded-md border border-yellow-200 mb-6">
            <p className="text-yellow-700 font-medium">Important: Exiting the strategy will:</p>
            <ol className="list-decimal pl-5 mt-2 space-y-1 text-yellow-700">
              <li>Withdraw your LP position from Uniswap V4</li>
              <li>Repay your USDC debt on Aave</li>
              <li>Return your ETH collateral to your Gnosis Pay wallet</li>
            </ol>
          </div>

          <div className="mb-6">
            <h3 className="text-md font-medium mb-3">Strategy Summary</h3>
            <div className="bg-gray-50 p-4 rounded-md border border-gray-200">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-gray-500 text-sm">ETH Supplied:</span>
                  <p className="font-medium">{formatEthBalance(strategyStatus.ethSupplied)} ETH</p>
                </div>
                <div>
                  <span className="text-gray-500 text-sm">USDC Borrowed:</span>
                  <p className="font-medium">
                    {formatUsdcBalance(strategyStatus.usdcBorrowed)} USDC
                  </p>
                </div>
                <div>
                  <span className="text-gray-500 text-sm">LP Token ID:</span>
                  <p className="font-mono">{strategyStatus.lpTokenId}</p>
                </div>
                <div>
                  <span className="text-gray-500 text-sm">LP Manager Approved:</span>
                  <p className={strategyStatus.managerApproved ? 'text-green-600' : 'text-red-600'}>
                    {strategyStatus.managerApproved ? 'Yes' : 'No'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {!strategyStatus.managerApproved && (
            <div className="mb-6">
              <h3 className="text-md font-medium mb-3">Required Approval</h3>
              <div className="bg-gray-50 p-4 rounded-md border border-gray-200">
                <p className="mb-3 text-gray-700">
                  Before exiting, you need to approve the LeveragedLPManager contract to use your LP
                  NFT.
                </p>
                <button
                  onClick={handleApproveManager}
                  disabled={isExiting}
                  className="w-full px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-blue-300"
                >
                  {isExiting ? 'Processing...' : 'Approve LP Manager'}
                </button>
              </div>
            </div>
          )}

          <button
            onClick={handleExitStrategy}
            disabled={isExiting || !strategyStatus.managerApproved}
            className="w-full px-4 py-3 text-white bg-red-600 rounded-md hover:bg-red-700 disabled:bg-red-300"
          >
            {isExiting ? 'Processing Exit...' : 'Exit Strategy'}
          </button>

          <p className="mt-4 text-sm text-gray-500 text-center">
            Make sure you have approved the LP Manager before exiting the strategy.
          </p>
        </div>
      )}
    </div>
  );
};

export default Exit;
