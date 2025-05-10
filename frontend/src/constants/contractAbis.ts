// Contract ABIs for the DeFi Safe Leveraged LP protocol

// LeveragedLPManager ABI - Main contract for strategy operations
export const LEVERAGED_LP_MANAGER_ABI = [
  // View functions
  'function userPositions(address safe) view returns (address safe, uint256 lpTokenId, uint256 ethSupplied, uint256 usdcBorrowed, bool isActive)',
  'function getFeeStatus(address safe) view returns (uint256 tradeCount, uint256 lastCollection, uint256 ethCollected, uint256 usdcCollected)',
  'function isApprovedForExit(address safe, uint256 lpTokenId) view returns (bool)',

  // Write functions
  'function startStrategy(address safe, uint256 ethAmount, uint256 ltv) payable',
  'function exitStrategy(address safe)',

  // Events
  'event StrategyStarted(address indexed safe, uint256 ethAmount, uint256 usdcAmount, uint256 lpTokenId)',
  'event FeesProcessed(address indexed safe, uint256 usdcRepaid, uint256 ethAdded)',
  'event FeesCollected(address indexed safe, uint256 ethAmount, uint256 usdcAmount)',
  'event StrategyExited(address indexed safe, uint256 ethReturned, uint256 usdcReturned)',
];

// FeeCollectHook ABI - Uniswap V4 hook for fee automation
export const FEE_COLLECT_HOOK_ABI = [
  'function isApprovedForFees(address safe, uint256 lpTokenId) view returns (bool)',
  'function collectFees(uint256 lpTokenId)',
  'event FeesCollected(address indexed safe, uint256 ethAmount, uint256 usdcAmount)',
];

// ERC20 ABI - For USDC and WETH token interactions
export const ERC20_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function transferFrom(address from, address to, uint256 amount) returns (bool)',
];

// ERC721 ABI - For Uniswap V4 Position Manager (LP NFT) interactions
export const ERC721_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function getApproved(uint256 tokenId) view returns (address)',
  'function isApprovedForAll(address owner, address operator) view returns (bool)',
  'function approve(address to, uint256 tokenId)',
  'function setApprovalForAll(address operator, bool approved)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
];

// Aave V3 Pool ABI - For lending operations
export const AAVE_POOL_ABI = [
  'function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
  'function getReserveData(address asset) view returns (tuple(uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))',
];

// Uniswap V4 Position Manager ABI - For LP position management
export const UNISWAP_POSITION_MANAGER_ABI = [
  'function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function getApproved(uint256 tokenId) view returns (address)',
  'function approve(address to, uint256 tokenId)',
  'function setApprovalForAll(address operator, bool approved)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
];
