/**
 * Centralized formatting utilities for CHUCHU BOT v2.0
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

/** Compact UTC date only, e.g. "2026-08-14". */
export const formatUtcDate = (timestamp: number): string => {
  return new Date(timestamp).toISOString().slice(0, 10);
};

/** Compact UTC clock time only, e.g. "05:47:07". */
export const formatUtcTime = (timestamp: number): string => {
  return new Date(timestamp).toISOString().slice(11, 19);
};

/** Compact hold duration, e.g. "3h 43m". */
export const formatHoldDuration = (ms: number): string => {
  if (!isFinite(ms) || ms < 0) return '';
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
};

/**
 * Formats a USD value in compact form with an explicit sign:
 *   >= $1M -> "+$3.2M"   <-$1M -> "-$3.2M"
 *   >= $1K -> "+$12.4K"  <-$1K -> "-$12.4K"
 *   else    -> "+$980"   or   "-$980"
 * Small non-zero values never collapse to "$0.0M" — they show real numbers.
 */
export const formatUsdCompact = (value: number): string => {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '+';
  if (abs >= 1_000_000) {
    return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  }
  return `${sign}$${abs.toFixed(0)}`;
};

/**
 * Formats a USD value with the color class for CVD delta (green positive, red negative).
 */
export const formatCvd = (value: number): { text: string; color: string } => {
  return {
    text: formatUsdCompact(value),
    color: value >= 0 ? 'text-emerald-400' : 'text-rose-400'
  };
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
