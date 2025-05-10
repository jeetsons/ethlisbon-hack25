import type { Address } from 'viem';
import { baseChain } from './chains';

// Contract addresses for Base chain (ID: 8453)
export interface ContractAddresses {
  leveragedLPManager: Address;
  feeCollectHook: Address;
  aavePool: Address;
  uniswapV4PositionManager: Address;
  usdc: Address;
  weth: Address;
}

// These addresses should be updated with actual deployed contract addresses
// For production, consider using environment variables
export const contractAddresses: Record<number, ContractAddresses> = {
  // Base Chain
  [baseChain.id]: {
    leveragedLPManager: '0x7DD8fB835e39aeb631C1Be80dA0fcb6E0C17D979' as Address,
    feeCollectHook: '0xE94DFcAb03D61fD2D7bAc89753f11EccDb789d61' as Address,
    aavePool: '0x2345678901234567890123456789012345678901' as Address,
    uniswapV4PositionManager: '0x8e2badc74a4560f7670d79fc67a5bf5b0d802a48' as Address,
    usdc: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA' as Address, // Base USDC
    weth: '0x4200000000000000000000000000000000000006' as Address, // Base WETH
  },
};

export const getContractAddresses = (chainId: number): ContractAddresses => {
  const addresses = contractAddresses[chainId];
  if (!addresses) {
    throw new Error(`Contract addresses not configured for chain ID ${chainId}`);
  }
  return addresses;
};
