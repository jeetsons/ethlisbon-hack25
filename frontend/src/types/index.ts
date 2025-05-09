import { Address } from 'viem';

// User position type matching the contract struct
export interface UserPosition {
  safe: Address;
  lpTokenId: bigint;
  ethSupplied: bigint;
  usdcBorrowed: bigint;
  isActive: boolean;
}

// Fee collection event data
export interface FeeCollectionEvent {
  lpTokenId: bigint;
  usdcAmount: bigint;
  ethAmount: bigint;
  tradeCount: bigint;
  timestamp: Date;
}

// Strategy status for UI display
export interface StrategyStatus {
  isActive: boolean;
  ethSupplied: bigint;
  usdcBorrowed: bigint;
  lpTokenId: bigint | null;
  tradesSinceLastCollection: number;
  healthFactor?: number;
  approvals: {
    managerApprovedForTokens: boolean;
    hookApprovedForNFT: boolean;
    managerApprovedForNFT: boolean;
  };
}

// Strategy parameters for starting a new strategy
export interface StrategyParams {
  ethAmount: bigint;
  ltv: number; // Loan-to-Value ratio (50-75% as recommended)
}

// Common notification type for UI feedback
export interface Notification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message: string;
  timestamp: Date;
  duration?: number; // In milliseconds, how long to display
}
