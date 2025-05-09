import React from 'react';
import { Link, Outlet } from 'react-router-dom';
import ConnectButton from './ConnectButton';
import { useWallet } from '../contexts/WalletContext';
import { shortenAddress } from '../utils/address';
import { baseChain } from '../constants/chains';

const Layout: React.FC = () => {
  const { isConnected, safeAddress, balance, chainId } = useWallet();
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center">
            <Link to="/" className="text-xl font-bold text-blue-600">
              DeFi Safe Leveraged LP
            </Link>
          </div>
          <ConnectButton />
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b">
        <div className="container mx-auto px-4">
          <div className="flex space-x-8">
            <Link
              to="/"
              className="px-3 py-4 text-sm font-medium text-gray-700 hover:text-blue-600 border-b-2 border-transparent hover:border-blue-600"
            >
              Home
            </Link>
            <Link
              to="/funding"
              className="px-3 py-4 text-sm font-medium text-gray-700 hover:text-blue-600 border-b-2 border-transparent hover:border-blue-600"
            >
              Fund Wallet
            </Link>
            <Link
              to="/strategy"
              className="px-3 py-4 text-sm font-medium text-gray-700 hover:text-blue-600 border-b-2 border-transparent hover:border-blue-600"
            >
              Start Strategy
            </Link>
            <Link
              to="/dashboard"
              className="px-3 py-4 text-sm font-medium text-gray-700 hover:text-blue-600 border-b-2 border-transparent hover:border-blue-600"
            >
              Dashboard
            </Link>
            <Link
              to="/exit"
              className="px-3 py-4 text-sm font-medium text-gray-700 hover:text-blue-600 border-b-2 border-transparent hover:border-blue-600"
            >
              Exit Strategy
            </Link>
          </div>
        </div>
      </nav>

      {/* Wallet Status Bar */}
      {isConnected && safeAddress && (
        <div className="bg-blue-50 border-b border-blue-100">
          <div className="container mx-auto px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center bg-white px-2 py-1 rounded-full shadow-sm">
                  <div className="h-3 w-3 rounded-full bg-green-500 mr-2"></div>
                  <span className="text-sm font-medium text-gray-800">Connected</span>
                </div>
                <div className="text-sm bg-white px-3 py-1 rounded-full shadow-sm border border-gray-200">
                  <span className="font-medium text-gray-800">Safe: </span>
                  <span className="text-blue-600">{shortenAddress(safeAddress)}</span>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="text-sm bg-white px-3 py-1 rounded-full shadow-sm border border-gray-200">
                  <span className="font-medium text-gray-800">Balance: </span>
                  <span className="font-mono text-green-600">{balance || '0'} ETH</span>
                </div>
                <div className="text-sm bg-white px-3 py-1 rounded-full shadow-sm border border-gray-200">
                  <span className="font-medium text-gray-800">Network: </span>
                  <span className={`font-medium ${chainId === baseChain.id ? 'text-green-600' : 'text-red-600'}`}>
                    {chainId === baseChain.id ? 'Base' : 'Wrong Network'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-white border-t mt-auto">
        <div className="container mx-auto px-4 py-6">
          <p className="text-center text-gray-500 text-sm">
            DeFi Safe Leveraged LP with Gnosis Pay, Aave V3, and Uniswap V4 on Base
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Layout;
