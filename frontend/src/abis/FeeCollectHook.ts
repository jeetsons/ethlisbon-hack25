export const FeeCollectHookABI = [
  // Contract events
  {
    type: 'event',
    name: 'FeesCollected',
    inputs: [
      { type: 'uint256', name: 'lpTokenId', indexed: true },
      { type: 'uint256', name: 'usdcAmount', indexed: false },
      { type: 'uint256', name: 'ethAmount', indexed: false },
      { type: 'uint256', name: 'tradeCount', indexed: false },
    ],
  },
  // View functions
  {
    type: 'function',
    name: 'tradeCounts',
    inputs: [{ type: 'uint256', name: 'lpTokenId' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'positionManager',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'leveragedLpManager',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'usdc',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'weth',
    inputs: [],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
  // State-changing functions
  {
    type: 'function',
    name: 'afterSwap',
    inputs: [{ type: 'uint256', name: 'lpTokenId' }],
    outputs: [{ type: 'bytes4' }],
    stateMutability: 'nonpayable',
  },
] as const;
