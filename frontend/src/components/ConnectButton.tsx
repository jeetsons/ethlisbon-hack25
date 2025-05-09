import React from 'react';
import { useWallet } from '../contexts/WalletContext';
import { shortenAddress } from '../utils/address';

const ConnectButton: React.FC = () => {
  const { isConnected, isConnecting, safeAddress, connect, disconnect } = useWallet();

  return (
    <div className="flex items-center">
      {isConnected && safeAddress ? (
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 text-sm bg-green-100 text-green-800 rounded-full">
            {shortenAddress(safeAddress)}
          </span>
          <button
            onClick={disconnect}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <button
          onClick={connect}
          disabled={isConnecting}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-blue-300"
        >
          {isConnecting ? 'Connecting...' : 'Connect Safe Wallet'}
        </button>
      )}
    </div>
  );
};

export default ConnectButton;
