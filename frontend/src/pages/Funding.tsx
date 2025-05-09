import React, { useState, useEffect } from 'react';
import { useWallet } from '../contexts/WalletContext';
import { formatEthBalance } from '../utils/address';
import { ethers } from 'ethers';

const Funding: React.FC = () => {
  const { 
    isConnected, 
    gnosisSafeAddress, 
    depositETH, 
    balance: safeBalance,
    fetchBalance
  } = useWallet();
  
  const [amount, setAmount] = useState('');
  const [isDepositing, setIsDepositing] = useState(false);
  const [depositSuccess, setDepositSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  // Fetch balance when component mounts and when connected state changes
  useEffect(() => {
    if (isConnected && gnosisSafeAddress) {
      fetchBalance();
    }
  }, [isConnected, gnosisSafeAddress, fetchBalance]);

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isConnected || !gnosisSafeAddress) {
      setError('Please connect your Gnosis Pay wallet first');
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    try {
      setIsDepositing(true);
      setError(null);
      setTxHash(null);
      
      // Use the depositETH function from WalletContext
      const hash = await depositETH(amount);
      
      setTxHash(hash);
      setDepositSuccess(true);
      setAmount('');
      
      // Refresh balance
      await fetchBalance();
      
      // Reset success message after 5 seconds
      setTimeout(() => {
        setDepositSuccess(false);
      }, 5000);
    } catch (err) {
      console.error('Error depositing ETH:', err);
      setError(err instanceof Error ? err.message : 'Failed to deposit ETH. Please try again.');
    } finally {
      setIsDepositing(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-yellow-50 p-4 rounded-md border border-yellow-200 mb-6">
          <p className="text-yellow-700">
            Please connect your Gnosis Pay wallet to fund it with ETH.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Fund Your Gnosis Pay Wallet</h1>
      
      <div className="bg-white p-6 rounded-lg shadow mb-6">
        <h2 className="text-lg font-semibold mb-4">Current Balance</h2>
        <div className="bg-gray-50 p-4 rounded-md border border-gray-200">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">ETH Balance:</span>
            <span className="font-mono font-medium text-lg">{safeBalance} ETH</span>
          </div>
        </div>
      </div>
      
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-4">Deposit ETH</h2>
        
        {depositSuccess && (
          <div className="bg-green-50 p-4 rounded-md border border-green-200 mb-4">
            <p className="text-green-700">
              ETH deposited successfully!
            </p>
            {txHash && (
              <p className="text-sm mt-2">
                Transaction hash: <a 
                  href={`https://basescan.org/tx/${txHash}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline font-mono break-all"
                >
                  {txHash}
                </a>
              </p>
            )}
          </div>
        )}
        
        {error && (
          <div className="bg-red-50 p-4 rounded-md border border-red-200 mb-4">
            <p className="text-red-700">{error}</p>
          </div>
        )}
        
        <form onSubmit={handleDeposit}>
          <div className="mb-4">
            <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-1">
              Amount (ETH)
            </label>
            <input
              id="amount"
              type="number"
              min="0.001"
              step="0.001"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          
          <button
            type="submit"
            disabled={isDepositing || !amount}
            className="w-full px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-blue-300"
          >
            {isDepositing ? 'Processing...' : 'Deposit ETH'}
          </button>
        </form>
        
        <div className="mt-6 bg-blue-50 p-4 rounded-md">
          <h3 className="font-medium text-blue-800 mb-2">How to fund your wallet:</h3>
          <ol className="list-decimal pl-5 text-blue-700 space-y-1">
            <li>Enter the amount of ETH you want to deposit</li>
            <li>Click "Deposit ETH" and confirm the transaction in your wallet</li>
            <li>Wait for the transaction to be confirmed on the blockchain</li>
            <li>Your balance will update automatically once the deposit is complete</li>
          </ol>
          <p className="mt-3 text-sm text-blue-600">
            Note: You'll need ETH in your connected wallet to complete this transaction.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Funding;
