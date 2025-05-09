export const LeveragedLPManagerABI = [
  // Contract events
  {
    type: 'event',
    name: 'StrategyStarted',
    inputs: [
      { type: 'address', name: 'safe', indexed: true },
      { type: 'uint256', name: 'ethAmount', indexed: false },
      { type: 'uint256', name: 'usdcAmount', indexed: false },
      { type: 'uint256', name: 'lpTokenId', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'FeesProcessed',
    inputs: [
      { type: 'address', name: 'safe', indexed: true },
      { type: 'uint256', name: 'usdcRepaid', indexed: false },
      { type: 'uint256', name: 'ethAdded', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'StrategyExited',
    inputs: [
      { type: 'address', name: 'safe', indexed: true },
      { type: 'uint256', name: 'ethReturned', indexed: false },
      { type: 'uint256', name: 'usdcReturned', indexed: false },
    ],
  },
  // View functions
  {
    type: 'function',
    name: 'userPositions',
    inputs: [{ type: 'address', name: 'safe' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { type: 'address', name: 'safe' },
          { type: 'uint256', name: 'lpTokenId' },
          { type: 'uint256', name: 'ethSupplied' },
          { type: 'uint256', name: 'usdcBorrowed' },
          { type: 'bool', name: 'isActive' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'lpTokenToSafe',
    inputs: [{ type: 'uint256', name: 'lpTokenId' }],
    outputs: [{ type: 'address' }],
    stateMutability: 'view',
  },
  // State-changing functions
  {
    type: 'function',
    name: 'startStrategy',
    inputs: [
      { type: 'address', name: 'safe' },
      { type: 'uint256', name: 'ethAmount' },
      { type: 'uint256', name: 'ltv' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'processFees',
    inputs: [
      { type: 'address', name: 'safe' },
      { type: 'uint256', name: 'usdcAmount' },
      { type: 'uint256', name: 'ethAmount' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'exitStrategy',
    inputs: [{ type: 'address', name: 'safe' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  // ERC721 receiver
  {
    type: 'function',
    name: 'onERC721Received',
    inputs: [
      { type: 'address', name: 'operator' },
      { type: 'address', name: 'from' },
      { type: 'uint256', name: 'tokenId' },
      { type: 'bytes', name: 'data' },
    ],
    outputs: [{ type: 'bytes4' }],
    stateMutability: 'pure',
  },
] as const;
