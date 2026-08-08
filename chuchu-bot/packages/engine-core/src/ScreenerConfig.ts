/**
 * ScreenerConfig
 * Centralized, dynamic settings for CHUCHU BOT v2.0 hunting, scoring, and modifiers.
 */
export const ScreenerConfig = {
  // Hunter Engine (Stage 1 Momentum Filter)
  hunter: {
    threshold: 60, // Minimum hunter score to enter dynamic watchlist & deep analysis
    timeframeWeights: {
      tf5m: 40,   // Highest priority
      tf15m: 30,  // High priority
      tf1h: 20,   // Medium
      tf4h: 10    // Confirmation only
    },
    extremeRsi: {
      overbought: 70,
      oversold: 30,
      neutral: 50
    },
    extremeWmr: {
      overbought: 80,
      oversold: 20,
      neutral: 50
    }
  },

  // Trend Modifiers (Dynamic Penalties & Bonuses)
  trendModifiers: {
    adxTiers: [
      { min: 20, max: 25, penalty: -5 },
      { min: 25, max: 30, penalty: -10 },
      { min: 30, max: 35, penalty: -20 },
      { min: 35, penalty: -30 }
    ],
    emaAlignmentPenalty: -10, // Penalty when trend alignment opposes trade direction
    orderbookImbalanceMaxBonus: 15, // Max bonus from orderbook buyer/seller imbalance
    cvdBonus: 10, // CVD alignment bonus
    oiIncreaseBonus: 5, // Open interest increase alignment bonus
    fundingRateBonus: 5 // Funding rate alignment bonus
  },

  // Polling Intervals in Milliseconds (Safe 15s REST polling to prevent Binance IP rate-limit Code -1003)
  intervals: {
    discoveryScan: 15000,    // 15 seconds
    preFilterRefresh: 15000, // 15 seconds
    derivativesPoll: 15000   // 15 seconds
  },

  // Auto-Trading Settings
  autoTrade: {
    enabled: true,         // Enable/Disable auto-trading execution
    initialBalance: 100,    // $100 starting balance
    marginPerTrade: 10,     // $10 margin per position
    leverage: 10            // 10x leverage
  }
};
