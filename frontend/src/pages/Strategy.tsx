import React, { useState, useEffect } from 'react';
import { useWallet } from '../contexts/WalletContext';
import { ethers } from 'ethers';

// Import ABIs from the abis directory
import ERC20ABI from '../abis/ERC20.json';
import ERC721ABI from '../abis/ERC721.json';
import LeveragedLPManagerABI from '../abis/LeveragedLPManager.json';
import FeeCollectHookABI from '../abis/FeeCollectHook.json';

// Contract addresses - in a real app, these would be imported from a config file
const LEVERAGED_LP_MANAGER_ADDRESS = '0x1234567890123456789012345678901234567890';
const FEE_COLLECT_HOOK_ADDRESS = '0x0987654321098765432109876543210987654321';
const USDC_ADDRESS = '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA'; // Base USDC
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006'; // Base WETH
const UNISWAP_POSITION_MANAGER_ADDRESS = '0x8e2badc74a4560f7670d79fc67a5bf5b0d802a48'; // Example address

interface ApprovalStatus {
  ethApproved: boolean;
  usdcApproved: boolean;
  lpNftMinted: boolean;
  feeHookApproved: boolean;
  managerApproved: boolean;
}

const Strategy: React.FC = () => {
  const {
    isConnected,
    safeAddress,
    balance: ethBalance,
    fetchBalance,
    approveERC20,
    approveERC721,
    sendTransaction,
  } = useWallet();

  // State for USDC balance
  const [usdcBalance, setUsdcBalance] = useState<string>('0');
  const [isLoadingBalances, setIsLoadingBalances] = useState<boolean>(false);

  const [amount, setAmount] = useState('');
  const [ltv, setLtv] = useState('50'); // Default to 50% LTV
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Approval statuses
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>({
    ethApproved: false,
    usdcApproved: false,
    lpNftMinted: false,
    feeHookApproved: false,
    managerApproved: false,
  });

  // Fetch balances and approval statuses when component mounts
  useEffect(() => {
    if (isConnected && safeAddress) {
      fetchBalance();
      fetchUsdcBalance();
      checkApprovalStatuses();
    }
  }, [isConnected, safeAddress, fetchBalance]);

  // Function to fetch USDC balance
  const fetchUsdcBalance = async () => {
    if (!isConnected || !safeAddress) return;
    
    try {
      setIsLoadingBalances(true);
      
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20ABI, provider);      
      const balance = await usdcContract.balanceOf(safeAddress);
      
      const formattedBalance = ethers.utils.formatUnits(balance, 6);
      setUsdcBalance(formattedBalance);
    } catch (error) {
      console.error('Error fetching USDC balance:', error);
    } finally {
      setIsLoadingBalances(false);
    }
  };

  // Function to check approval statuses
  const checkApprovalStatuses = async () => {
    if (!isConnected || !safeAddress) return;
    
    try {
      // Create a provider and contract instances
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const usdcContract = new ethers.Contract(USDC_ADDRESS, ERC20ABI, provider);
      const wethContract = new ethers.Contract(WETH_ADDRESS, ERC20ABI, provider);
      
      // Check USDC allowance
      const usdcAllowance = await usdcContract.allowance(safeAddress, LEVERAGED_LP_MANAGER_ADDRESS);
      const usdcApproved = !usdcAllowance.isZero();
      
      // Check ETH/WETH allowance
      const wethAllowance = await wethContract.allowance(safeAddress, LEVERAGED_LP_MANAGER_ADDRESS);
      const ethApproved = !wethAllowance.isZero();
      
      // Check if LP NFT exists and approvals for it
      // In a real implementation, we would query the LeveragedLPManager contract
      // to see if the user has an active position
      const lpManagerContract = new ethers.Contract(LEVERAGED_LP_MANAGER_ADDRESS, LeveragedLPManagerABI, provider);
      
      try {
        // Check if user has an active position
        // This would be a call to a function like getUserPosition or hasActivePosition
        const hasPosition = await lpManagerContract.hasActivePosition?.(safeAddress) || false;
        
        if (hasPosition) {
          // Get the LP NFT ID
          const positionId = await lpManagerContract.getUserPositionId?.(safeAddress) || '0';
          
          if (positionId && positionId !== '0') {
            // Check approvals for the NFT
            const positionManagerContract = new ethers.Contract(UNISWAP_POSITION_MANAGER_ADDRESS, ERC721ABI, provider);
            
            // Check if FeeCollectHook is approved for the NFT
            const feeHookApproved = await positionManagerContract.isApprovedForAll?.(safeAddress, FEE_COLLECT_HOOK_ADDRESS) || false;
            
            // Check if LeveragedLPManager is approved for the NFT
            const managerApproved = await positionManagerContract.isApprovedForAll?.(safeAddress, LEVERAGED_LP_MANAGER_ADDRESS) || false;
            
            setApprovalStatus(prev => ({
              ...prev,
              lpNftMinted: true,
              feeHookApproved,
              managerApproved
            }));
          }
        }
      } catch (positionError) {
        // If there's an error checking position, we assume there's no position yet
        console.log('No active position found or contract doesn\'t support position checking');
      }
      
      // Update token approval statuses
      setApprovalStatus(prev => ({
        ...prev,
        ethApproved,
        usdcApproved
      }));
    } catch (error) {
      console.error('Error checking approval statuses:', error);
    }
  };

  const handleApproveEth = async () => {
    try {
      setIsProcessing(true);
      setError(null);

      // Approve WETH for the LeveragedLPManager contract
      const txHash = await approveERC20(
        WETH_ADDRESS,
        LEVERAGED_LP_MANAGER_ADDRESS,
        '115792089237316195423570985008687907853269984665640564039457584007913129639935' // MaxUint256 value
      );

      setApprovalStatus(prev => ({ ...prev, ethApproved: true }));
      setSuccess(`ETH approved successfully! Transaction hash: ${txHash}`);

      // Reset success message after 5 seconds
      setTimeout(() => {
        setSuccess(null);
      }, 5000);
    } catch (err) {
      console.error('Error approving ETH:', err);
      setError(err instanceof Error ? err.message : 'Failed to approve ETH. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApproveUsdc = async () => {
    try {
      setIsProcessing(true);
      setError(null);

      // Approve USDC for the LeveragedLPManager contract
      const txHash = await approveERC20(
        USDC_ADDRESS,
        LEVERAGED_LP_MANAGER_ADDRESS,
        '115792089237316195423570985008687907853269984665640564039457584007913129639935' // MaxUint256 value
      );

      setApprovalStatus(prev => ({ ...prev, usdcApproved: true }));
      setSuccess(`USDC approved successfully! Transaction hash: ${txHash}`);

      // Reset success message after 5 seconds
      setTimeout(() => {
        setSuccess(null);
      }, 5000);
    } catch (err) {
      console.error('Error approving USDC:', err);
      setError(err instanceof Error ? err.message : 'Failed to approve USDC. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStartStrategy = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isConnected || !safeAddress) {
      setError('Please connect your Gnosis Pay wallet first');
      return;
    }

    if (!approvalStatus.ethApproved || !approvalStatus.usdcApproved) {
      setError('Please approve ETH and USDC before starting the strategy');
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid ETH amount');
      return;
    }

    try {
      setIsProcessing(true);
      setError(null);

      // Use the imported LeveragedLPManager ABI
      const lpManagerInterface = new ethers.utils.Interface(LeveragedLPManagerABI);

      // Create calldata for startStrategy function
      const data = lpManagerInterface.encodeFunctionData('startStrategy', [
        safeAddress,
        ethers.parseEther(amount),
        parseInt(ltv),
      ]);

      // Send transaction to start the strategy
      const txHash = await sendTransaction(LEVERAGED_LP_MANAGER_ADDRESS, data);

      // Get the LP NFT ID from the transaction receipt or events
      // In a real implementation, we would listen for events from the contract
      // to get the actual LP NFT ID that was minted
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      
      // Wait for transaction receipt
      const receipt = await provider.getTransactionReceipt(txHash);
      
      // Parse logs to find the LP NFT ID
      // This is a simplified example - in a real app, you would parse the event logs
      // to extract the actual token ID from the event emitted by the contract
      let lpNftId;
      try {
        // Create contract instance to parse logs
        const lpManagerContract = new ethers.Contract(LEVERAGED_LP_MANAGER_ADDRESS, LeveragedLPManagerABI, provider);
        
        // Look for PositionCreated event in the logs
        const positionCreatedEvent = receipt.logs
          .filter(log => log.address.toLowerCase() === LEVERAGED_LP_MANAGER_ADDRESS.toLowerCase())
          .map(log => {
            try {
              return lpManagerContract.interface.parseLog(log);
            } catch (e) {
              return null;
            }
          })
          .find(parsedLog => parsedLog && parsedLog.name === 'PositionCreated');
        
        if (positionCreatedEvent) {
          lpNftId = positionCreatedEvent.args.tokenId.toString();
          console.log('LP NFT ID from event:', lpNftId);
        } else {
          // Fallback if event not found
          lpNftId = '12345';
          console.log('LP NFT ID not found in logs, using fallback value');
        }
      } catch (err) {
        console.error('Error parsing logs:', err);
        lpNftId = '12345'; // Fallback value
      }

      setApprovalStatus(prev => ({ ...prev, lpNftMinted: true }));
      setSuccess(
        `Strategy started successfully! LP NFT has been minted. Transaction hash: ${txHash}`
      );

      // Reset form
      setAmount('');
      setLtv('50');

      // Refresh balances
      await fetchBalance();

      // Reset success message after 5 seconds
      setTimeout(() => {
        setSuccess(null);
      }, 5000);
    } catch (err) {
      console.error('Error starting strategy:', err);
      setError(err instanceof Error ? err.message : 'Failed to start strategy. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApproveFeeHook = async () => {
    try {
      setIsProcessing(true);
      setError(null);

      // Get the LP NFT ID from the LeveragedLPManager contract
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const lpManagerContract = new ethers.Contract(LEVERAGED_LP_MANAGER_ADDRESS, LeveragedLPManagerABI, provider);
      
      // In a real implementation, we would get the actual position ID
      let lpNftId;
      try {
        lpNftId = await lpManagerContract.getUserPositionId?.(safeAddress);
      } catch (err) {
        // If the function doesn't exist or fails, use a fallback value for demo
        console.log('Could not get position ID, using fallback value');
        lpNftId = '12345';
      }

      // Approve FeeCollectHook for all NFTs (safer and more gas-efficient for future operations)
      const txHash = await approveERC721(
        UNISWAP_POSITION_MANAGER_ADDRESS,
        FEE_COLLECT_HOOK_ADDRESS,
        '0' // Token ID is not needed for setApprovalForAll
      );

      setApprovalStatus(prev => ({ ...prev, feeHookApproved: true }));
      setSuccess(`FeeCollectHook approved successfully! Transaction hash: ${txHash}`);

      // Reset success message after 5 seconds
      setTimeout(() => {
        setSuccess(null);
      }, 5000);
    } catch (err) {
      console.error('Error approving FeeCollectHook:', err);
      setError(err instanceof Error ? err.message : 'Failed to approve FeeCollectHook. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApproveManager = async () => {
    try {
      setIsProcessing(true);
      setError(null);

      // Get the LP NFT ID from the LeveragedLPManager contract
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const lpManagerContract = new ethers.Contract(LEVERAGED_LP_MANAGER_ADDRESS, LeveragedLPManagerABI, provider);
      
      // In a real implementation, we would get the actual position ID
      let lpNftId;
      try {
        lpNftId = await lpManagerContract.getUserPositionId?.(safeAddress);
      } catch (err) {
        // If the function doesn't exist or fails, use a fallback value for demo
        console.log('Could not get position ID, using fallback value');
        lpNftId = '12345';
      }

      // Approve LeveragedLPManager for all NFTs (safer and more gas-efficient for future operations)
      const txHash = await approveERC721(
        UNISWAP_POSITION_MANAGER_ADDRESS,
        LEVERAGED_LP_MANAGER_ADDRESS,
        '0' // Token ID is not needed for setApprovalForAll
      );

      setApprovalStatus(prev => ({ ...prev, managerApproved: true }));
      setSuccess(`LeveragedLPManager approved successfully! Transaction hash: ${txHash}`);

      // Reset success message after 5 seconds
      setTimeout(() => {
        setSuccess(null);
      }, 5000);
    } catch (err) {
      console.error('Error approving LeveragedLPManager:', err);
      setError(err instanceof Error ? err.message : 'Failed to approve LeveragedLPManager. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white p-4 rounded-md border border-gray-200 mb-6">
          <p>
            Please connect your Gnosis Pay wallet to start the strategy.
          </p>
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
        <h2 className="text-lg font-semibold mb-4 text-black">1. Required Approvals</h2>

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

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-medium">Approve ETH</span>
              <p className="text-sm text-black">Allow LeveragedLPManager to use your ETH</p>
            </div>
            <button
              onClick={handleApproveEth}
              disabled={isProcessing || approvalStatus.ethApproved}
              className={`px-4 py-2 rounded-md ${
                approvalStatus.ethApproved
                  ? 'bg-green-100 text-green-800'
                  : 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300'
              }`}
            >
              {approvalStatus.ethApproved
                ? 'Approved ✓'
                : isProcessing
                  ? 'Processing...'
                  : 'Approve'}
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <span className="font-medium">Approve USDC</span>
              <p className="text-sm">Allow LeveragedLPManager to use your USDC</p>
            </div>
            <button
              onClick={handleApproveUsdc}
              disabled={isProcessing || approvalStatus.usdcApproved}
              className={`px-4 py-2 rounded-md ${
                approvalStatus.usdcApproved
                  ? 'bg-green-100 text-green-800'
                  : 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300'
              }`}
            >
              {approvalStatus.usdcApproved
                ? 'Approved ✓'
                : isProcessing
                  ? 'Processing...'
                  : 'Approve'}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-lg font-semibold mb-4">2. Start Strategy</h2>

        <form onSubmit={handleStartStrategy}>
          <div className="mb-4">
            <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-1">
              ETH Amount
            </label>
            <input
              id="amount"
              type="number"
              min="0.001"
              step="0.001"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0.0"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              disabled={!approvalStatus.ethApproved || !approvalStatus.usdcApproved}
            />
          </div>

          <div className="mb-6">
            <label htmlFor="ltv" className="block text-sm font-medium text-gray-700 mb-1">
              Leverage (LTV %)
            </label>
            <input
              id="ltv"
              type="range"
              min="10"
              max="75"
              value={ltv}
              onChange={e => setLtv(e.target.value)}
              className="w-full"
              disabled={!approvalStatus.ethApproved || !approvalStatus.usdcApproved}
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>10%</span>
              <span>Current: {ltv}%</span>
              <span>75%</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={
              isProcessing ||
              !amount ||
              !approvalStatus.ethApproved ||
              !approvalStatus.usdcApproved ||
              approvalStatus.lpNftMinted
            }
            className="w-full px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-blue-300"
          >
            {isProcessing ? 'Processing...' : 'Start Strategy'}
          </button>
        </form>
      </div>

      {approvalStatus.lpNftMinted && (
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">3. LP NFT Approvals</h2>
          <div className="bg-yellow-50 p-4 rounded-md border border-yellow-200 mb-4">
            <p className="text-yellow-700 font-medium">
              Important: After LP NFT mint, you need to approve:
            </p>
            <ol className="list-decimal pl-5 mt-2 space-y-1">
              <li>FeeCollectHook (for fee automation)</li>
              <li>LeveragedLPManager (for exit/unwind)</li>
            </ol>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium">Approve FeeCollectHook</span>
                <p className="text-sm text-gray-500">Allow automated fee collection</p>
              </div>
              <button
                onClick={handleApproveFeeHook}
                disabled={isProcessing || approvalStatus.feeHookApproved}
                className={`px-4 py-2 rounded-md ${
                  approvalStatus.feeHookApproved
                    ? 'bg-green-100 text-green-800'
                    : 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300'
                }`}
              >
                {approvalStatus.feeHookApproved
                  ? 'Approved ✓'
                  : isProcessing
                    ? 'Processing...'
                    : 'Approve'}
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium">Approve LeveragedLPManager</span>
                <p className="text-sm text-gray-500">Allow strategy exit/unwind</p>
              </div>
              <button
                onClick={handleApproveManager}
                disabled={isProcessing || approvalStatus.managerApproved}
                className={`px-4 py-2 rounded-md ${
                  approvalStatus.managerApproved
                    ? 'bg-green-100 text-green-800'
                    : 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300'
                }`}
              >
                {approvalStatus.managerApproved
                  ? 'Approved ✓'
                  : isProcessing
                    ? 'Processing...'
                    : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Strategy;
