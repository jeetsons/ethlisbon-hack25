import type { Address } from 'viem';
import { baseChain } from './chains';

// Contract addresses for Base chain (ID: 8453)
export interface ContractAddresses {
  leveragedLPManager: Address;
  feeCollectHook: Address;
  aavePool: Address;
  aaveDataProvider: Address;
  uniswapV4PositionManager: Address;
  usdc: Address;
  weth: Address;
}

export const contractAddresses: Record<number, ContractAddresses> = {
  // Base Chain
  [baseChain.id]: {
    leveragedLPManager: '0x4f9F66FE2Ca8B793F914709C45744402f3043940' as Address,
    feeCollectHook: '0xE94DFcAb03D61fD2D7bAC89753f11EccDb789d61' as Address,
    aavePool: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5' as Address,
    aaveDataProvider: '0x2d8A3C5677189723C4cB8873CfC9C8976FDF38Ac' as Address, // Aave V3 Protocol Data Provider
    uniswapV4PositionManager: '0x8e2badc74a4560f7670d79fc67a5bf5b0d802a48' as Address,
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Address, // Base USDC
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
