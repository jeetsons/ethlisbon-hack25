import { Address } from 'viem';
import { baseChain } from './chains';

// Note: These addresses need to be updated with actual deployed contract addresses
// during development or replaced with environment variables

export interface ContractAddresses {
  leveragedLPManager: Address;
  feeCollectHook: Address;
  aavePool: Address;
  uniswapV4PositionManager: Address;
  usdc: Address;
  weth: Address;
}

export const contractAddresses: Record<number, ContractAddresses> = {
  // Base Chain
  [baseChain.id]: {
    leveragedLPManager: '0x0000000000000000000000000000000000000000' as Address, // Replace with actual address
    feeCollectHook: '0x0000000000000000000000000000000000000000' as Address, // Replace with actual address
    aavePool: '0x0000000000000000000000000000000000000000' as Address, // Replace with actual address
    uniswapV4PositionManager: '0x0000000000000000000000000000000000000000' as Address, // Replace with actual address
    usdc: '0x0000000000000000000000000000000000000000' as Address, // Replace with actual address
    weth: '0x0000000000000000000000000000000000000000' as Address, // Replace with actual address
  },
};

export const getContractAddresses = (chainId: number): ContractAddresses => {
  const addresses = contractAddresses[chainId];
  if (!addresses) {
    throw new Error(`Contract addresses not configured for chain ID ${chainId}`);
  }
  return addresses;
};
