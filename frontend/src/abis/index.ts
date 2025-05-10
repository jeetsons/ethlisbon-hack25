export const ABIs = {
  // LeveragedLPManager ABI - our main contract
  LeveragedLPManager: [
    'function startStrategy(address safe, uint256 ethAmount, uint256 ltv, uint16 slippageBps) external',
    'function getUserPosition(address safe) external view returns (address safe, uint256 lpTokenId)',
    'function owner() external view returns (address)',
    'function protocolFeeBps() external view returns (uint8)',
    'function feeHook() external view returns (address)',
  ],

  // WETH token ABI
  WETH: [
    'function deposit() external payable',
    'function balanceOf(address owner) external view returns (uint256)',
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function allowance(address owner, address spender) external view returns (uint256)',
    'function transfer(address to, uint amount) external returns (bool)',
    'function name() external view returns (string)',
    'function symbol() external view returns (string)',
    'function decimals() external view returns (uint8)',
    'function totalSupply() external view returns (uint256)',
  ],

  // ERC20 standard ABI (for USDC)
  ERC20: [
    'function balanceOf(address owner) external view returns (uint256)',
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function allowance(address owner, address spender) external view returns (uint256)',
    'function decimals() external view returns (uint8)',
  ],

  // Aave V3 Data Provider ABI
  AaveDataProvider: [
    'function getReserveTokensAddresses(address asset) external view returns (address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress)',
  ],

  // Aave V3 Debt Token ABI
  AaveDebtToken: ['function approveDelegation(address delegatee, uint256 amount) external'],
};
