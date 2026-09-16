const config = require('./config.json');

/**
 * Risk Management Engine for Survival Trading Across Multiple Assets
 */
class RiskManager {
  constructor(cfg = config) {
    this.config = cfg;
    this.dailyLoss = 0;
    this.circuitBreakerTriggered = false;
  }

  getContractSize(symbol) {
    const s = (symbol || '').toUpperCase();
    if (s.includes('GBP') || s.includes('EUR') || s.includes('JPY')) return 100000;
    if (s.includes('XAU') || s.includes('GOLD')) return 100;
    if (s.includes('BTC')) return 1;
    if (s.includes('OIL')) return 1000;
    if (s.includes('US500') || s.includes('SPX')) return 1;
    return 100; // default
  }

  getMaxSpread(symbol) {
    const s = (symbol || '').toUpperCase();
    if (s.includes('GBP') || s.includes('EUR')) return 0.0003;
    if (s.includes('JPY')) return 0.03;
    if (s.includes('US500') || s.includes('SPX')) return 1.0;
    if (s.includes('XAU') || s.includes('GOLD')) return 0.60;
    if (s.includes('BTC')) return 40.0;
    if (s.includes('OIL')) return 0.15;
    return 1.0;
  }

  /**
   * Tính toán khối lượng vào lệnh (Lot size) chuẩn xác theo rủi ro 1%
   */
  calculatePosition({ symbol = 'XAU/USD', strategy = null, equity, entryPrice, stopLossPrice, takeProfitPrice, currentSpread = 0, riskAmount = null, riskPercent = null }) {
    if (this.circuitBreakerTriggered) {
      return { approved: false, reason: 'Circuit Breaker đã kích hoạt do chạm ngưỡng lỗ ngày (3%)!' };
    }

    const contractSize = this.getContractSize(symbol);
    const maxSpread = this.getMaxSpread(symbol);
    const s = (symbol || '').toUpperCase();

    // 1. Kiểm tra Spread
    if (currentSpread > maxSpread) {
      return { 
        approved: false, 
        reason: `Spread quá cao (${currentSpread} > ngưỡng cho phép ${maxSpread})` 
      };
    }

    // 2. Tính khoảng cách Rủi ro (Risk Distance) và Lợi nhuận (Reward Distance)
    const riskDist = Math.abs(entryPrice - stopLossPrice);
    const isForex = s.includes('GBP') || s.includes('EUR') || s.includes('JPY');
    const minRiskDist = isForex ? 0.0001 : 0.01;
    if (riskDist <= minRiskDist) {
      return { approved: false, reason: 'Khoảng cách Stop-Loss quá nhỏ hoặc không hợp lệ!' };
    }

    const rewardDist = Math.abs(takeProfitPrice - entryPrice);
    const rr = +(rewardDist / riskDist).toFixed(2);
    if (rr < this.config.risk.minRiskRewardRatio) {
      return { 
        approved: false, 
        reason: `Tỷ lệ R:R (${rr}) không đạt chuẩn tối thiểu ${this.config.risk.minRiskRewardRatio}!` 
      };
    }

    // 3. Tính số tiền rủi ro tối đa (Tiered Risk 2.0% cho Top 1-3, hoặc 1.0% cơ sở, hoặc riskAmount truyền vào)
    let effectiveRiskPercent = (typeof riskPercent === 'number' && riskPercent > 0) ? riskPercent : null;
    if (!effectiveRiskPercent && (typeof riskAmount === 'number' && riskAmount > 0) && (typeof equity === 'number' && equity > 0)) {
      effectiveRiskPercent = +((riskAmount / equity) * 100).toFixed(2);
    }
    if (!effectiveRiskPercent && strategy && this.config.risk?.tieredRisk?.enabled) {
      const tiered = this.config.risk.tieredRisk;
      const sUpper = strategy.toUpperCase();
      const rank1Key = (tiered.rank1Strategy || 'ENGINE_DELTA').toUpperCase();
      const rank23List = (tiered.rank2And3Strategies || ['ENGINE_BETA', 'ENGINE_THETA']).map(k => k.toUpperCase());

      if (sUpper.includes(rank1Key) || sUpper.includes(rank1Key.replace('ENGINE_', ''))) {
        const whitelist = tiered.rank1AssetWhitelist || ['BTCUSD', 'BTC'];
        const isWhitelistedAsset = whitelist.some(w => s.includes(w.toUpperCase()));
        effectiveRiskPercent = isWhitelistedAsset ? (tiered.rank1RiskPercent || 5.0) : (tiered.rank1SecondaryCapPercent || 2.0);
      } else if (rank23List.some(k => sUpper.includes(k) || sUpper.includes(k.replace('ENGINE_', '')))) {
        effectiveRiskPercent = tiered.rank2And3RiskPercent || 2.0;
      }
    }
    if (!effectiveRiskPercent && strategy) {
      const sUpper = strategy.toUpperCase();
      if (sUpper.includes('LAMBDA') || sUpper.includes('OMEGA') || sUpper.includes('COUNTER')) {
        effectiveRiskPercent = this.config.counterTrend?.riskPercent || 0.5;
      }
    }
    if (!effectiveRiskPercent) {
      effectiveRiskPercent = this.config.risk?.tieredRisk?.baseRiskPercent || this.config.risk?.riskPerTradePercent || 1.0;
    }

    const maxRiskAmount = (typeof riskAmount === 'number' && riskAmount > 0) 
      ? riskAmount 
      : equity * (effectiveRiskPercent / 100);

    // 4. Tính toán Lot Size: Loss per 1 lot = riskDist * contractSize
    // Đối với cặp tiền có đồng định giá JPY (ví dụ USD/JPY), rủi ro tính theo JPY cần quy đổi về USD bằng cách chia cho entryPrice
    const isJpyQuote = s.includes('JPY');
    const lossPerLot = isJpyQuote ? (riskDist * contractSize) / entryPrice : (riskDist * contractSize);
    const rawLot = maxRiskAmount / lossPerLot;

    // Làm tròn theo lotStep (0.01)
    const step = this.config.risk.lotStep || 0.01;
    let lotSize = Math.floor(rawLot / step) * step;

    // Giới hạn an toàn (min 0.01, max 2.00 cho Forex/Crypto/Vàng, max 20.00 cho US500)
    const configuredMaxLot = this.config.risk.maxLotSize || 2.00;
    const maxLot = (s.includes('US500') || s.includes('SPX')) ? Math.max(20.00, configuredMaxLot) : configuredMaxLot;
    lotSize = Math.max(this.config.risk.minLotSize || 0.01, Math.min(maxLot, lotSize));
    lotSize = +lotSize.toFixed(2);

    const actualRiskAmount = +(lotSize * lossPerLot).toFixed(2);
    const potentialReward = isJpyQuote
      ? +(lotSize * rewardDist * contractSize / entryPrice).toFixed(2)
      : +(lotSize * rewardDist * contractSize).toFixed(2);
    const decimals = (s.includes('GBP') || s.includes('EUR')) ? 5 : (s.includes('JPY') ? 3 : 2);

    return {
      approved: true,
      symbol,
      contractSize,
      lotSize,
      actualRiskAmount,
      potentialReward,
      riskRewardRatio: rr,
      riskDist: +riskDist.toFixed(decimals),
      rewardDist: +rewardDist.toFixed(decimals),
      riskPercent: effectiveRiskPercent
    };
  }

  recordTradeResult(pnl, currentEquity) {
    if (pnl < 0) {
      this.dailyLoss += Math.abs(pnl);
      const maxDailyLoss = currentEquity * (this.config.risk.maxDailyLossPercent / 100);
      if (this.dailyLoss >= maxDailyLoss) {
        this.circuitBreakerTriggered = true;
        console.error(`[CIRCUIT BREAKER] Đã kích hoạt! Tổng lỗ trong ngày: $${this.dailyLoss} >= ngưỡng cho phép $${maxDailyLoss}`);
      }
    }
  }
}

const instance = new RiskManager();
instance.RiskManager = RiskManager;
module.exports = instance;
