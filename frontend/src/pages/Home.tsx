import React from 'react';
import { Link } from 'react-router-dom';
import { useWallet } from '../contexts/WalletContext';
import { shortenAddress } from '../utils/address';

const Home: React.FC = () => {
  const { isConnected, isLoading, safeAddress, connect } = useWallet();

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">DeFi Safe Leveraged LP</h1>
      
      <div className="bg-white p-6 rounded-lg shadow mb-8">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Welcome to Leveraged LP with Gnosis Pay</h2>
        <p className="mb-4 text-gray-700">
          This application allows you to create a leveraged liquidity position using Aave V3 and Uniswap V4,
          all managed through your secure Gnosis Pay wallet.
        </p>
        
        <div className="bg-blue-50 p-4 rounded-md mb-6">
          <h3 className="font-medium text-blue-800 mb-2">How it works:</h3>
          <ol className="list-decimal pl-5 text-blue-700 space-y-1">
            <li>Connect your Gnosis Pay wallet</li>
            <li>Fund your wallet with ETH</li>
            <li>Set up approvals for the strategy contracts</li>
            <li>Start the strategy with your desired leverage</li>
            <li>Monitor your position in the dashboard</li>
            <li>Exit when you're ready</li>
          </ol>
        </div>

        {!isConnected ? (
          <div className="bg-gray-50 p-6 rounded-md border border-gray-200 text-center">
            <h3 className="text-lg font-medium mb-3">Connect Your Wallet</h3>
            <p className="mb-4 text-gray-600">
              To get started, connect your Gnosis Pay wallet. If you don't have one yet, 
              you'll be guided through the creation process.
            </p>
            <button
              onClick={connect}
              disabled={isLoading}
              className="w-full px-4 py-3 text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-blue-300"
            >
              {isLoading ? 'Connecting...' : 'Connect with Gnosis Pay'}
            </button>
          </div>
        ) : (
          <div className="bg-gray-50 p-6 rounded-md border border-gray-200">
            <h3 className="text-lg font-medium mb-3">Wallet Connected</h3>
            <p className="mb-2">
              <span className="font-medium">Gnosis Pay Address:</span>{' '}
              <span className="font-mono">{shortenAddress(safeAddress, 6)}</span>
            </p>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <Link 
                to="/funding" 
                className="px-4 py-2 bg-blue-600 text-white rounded-md text-center hover:bg-blue-700"
              >
                Fund Wallet
              </Link>
              <Link 
                to="/strategy" 
                className="px-4 py-2 bg-green-600 text-white rounded-md text-center hover:bg-green-700"
              >
                Start Strategy
              </Link>
            </div>
          </div>
        )}
      </div>
      
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold text-gray-800 mb-4">About This Project</h2>
        <p className="mb-4 text-gray-700">
          This DeFi application leverages several key technologies:
        </p>
        <ul className="list-disc pl-5 space-y-2 mb-4 text-gray-700">
          <li><span className="font-medium text-blue-700">Gnosis Pay:</span> Secure wallet management and transaction signing</li>
          <li><span className="font-medium text-purple-700">Aave V3:</span> Lending protocol for ETH collateral and USDC borrowing</li>
          <li><span className="font-medium text-pink-700">Uniswap V4:</span> Liquidity provision with automated fee collection</li>
          <li><span className="font-medium text-green-700">Base Chain:</span> Fast, low-cost Ethereum L2 for all transactions</li>
        </ul>
      </div>
    </div>
  );
};

export default Home;
