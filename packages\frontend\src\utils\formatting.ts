/**
 * Centralized formatting utilities for ATHENA AI v2.0
 */

export type TimezoneMode = 'LOCAL' | 'UTC';

/**
 * Dynamically formats a cryptocurrency price based on its magnitude.
 * Matches Binance style:
 * - >= $1.00 : 2 to 4 decimal places
 * - < $1.00  : 4 to 8 decimal places based on leading zeros
 */
export const formatPrice = (price: number): string => {
  if (price === 0) return '0.00';

  const absPrice = Math.abs(price);
  
  if (absPrice >= 1) {
    // 2 fraction digits standard, up to 4 if needed (e.g., 1.2345)
    return price.toLocaleString('en-US', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: price % 1 === 0 ? 2 : 4 
    });
  } else {
    // For values < 1, count leading zeroes
    const priceStr = absPrice.toString();
    
    // Handle scientific notation (e.g., 1e-7)
    if (priceStr.includes('e-')) {
      const parts = priceStr.split('e-');
      const leadingZeros = parseInt(parts[1], 10) - 1;
      return price.toLocaleString('en-US', {
        minimumFractionDigits: leadingZeros + 4,
        maximumFractionDigits: leadingZeros + 4
      });
    }

    // Standard decimal string (0.000...)
    const decimalStr = priceStr.split('.')[1] || '';
    let leadingZeros = 0;
    for (let i = 0; i < decimalStr.length; i++) {
      if (decimalStr[i] === '0') leadingZeros++;
      else break;
    }

    // Show at least 4 digits, but if it has lots of 0s, show 4 digits after the 0s
    const targetDecimals = Math.max(4, leadingZeros + 4);
    
    return price.toLocaleString('en-US', { 
      minimumFractionDigits: Math.min(8, targetDecimals), 
      maximumFractionDigits: Math.min(8, targetDecimals) 
    });
  }
};

/**
 * Formats a timestamp into a human-readable date string based on the selected timezone.
 */
export const formatTime = (timestamp: number, timezone: TimezoneMode): string => {
  const date = new Date(timestamp);
  
  if (timezone === 'UTC') {
    return date.toISOString().replace('T', ' ').split('.')[0] + ' UTC';
  } else {
    // Local timezone formatting
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  }
};

/**
 * Returns a human readable string for latency delay, e.g. "12ms delayed" or "1.5s delayed"
 */
export const formatLatencyDelay = (eventTimestamp: number): string => {
  const diff = Date.now() - eventTimestamp;
  if (diff < 0) return '0ms'; // Clock sync edge cases
  
  if (diff < 1000) {
    return `${diff}ms`;
  } else {
    return `${(diff / 1000).toFixed(1)}s`;
  }
};
