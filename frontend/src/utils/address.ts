import type { Address } from 'viem';

/**
 * Shortens an Ethereum address for display purposes
 * @param address The full Ethereum address
 * @param chars Number of characters to show at start and end
 * @returns Shortened address string (e.g., 0x1234...5678)
 */
export function shortenAddress(address: Address | string | null | undefined, chars = 4): string {
  if (!address) return '';

  const parsed = address.toString();
  return `${parsed.substring(0, chars + 2)}...${parsed.substring(parsed.length - chars)}`;
}

/**
 * Formats ETH balance for display
 * @param balance Balance in wei
 * @param decimals Number of decimal places to display
 * @returns Formatted balance string
 */
export function formatEthBalance(balance: bigint | null | undefined, decimals = 4): string {
  if (balance === null || balance === undefined) return '0';

  const ethValue = Number(balance) / 1e18;
  return ethValue.toFixed(decimals);
}

/**
 * Formats USDC balance for display
 * @param balance Balance in smallest USDC units
 * @param decimals Number of decimal places to display
 * @returns Formatted balance string
 */
export function formatUsdcBalance(balance: bigint | null | undefined, decimals = 2): string {
  if (balance === null || balance === undefined) return '0';

  const usdcValue = Number(balance) / 1e6; // USDC has 6 decimals
  return usdcValue.toFixed(decimals);
}
