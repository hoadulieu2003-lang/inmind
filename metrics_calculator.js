/**
 * ============================================================================
 * METRICS CALCULATOR — Đồng bộ Tính toán Hiệu suất Hôm nay (Today) vs Toàn kỳ (All-Time)
 * ============================================================================
 */

function getVietnamDateStr(isoOrDate) {
  const d = isoOrDate ? new Date(isoOrDate) : new Date();
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

function calculateDailyMetrics(now, allTrades, exnessStatus, prevEndingBalance = null) {
  const vnDateToday = getVietnamDateStr(now);
  const [y, m, d] = vnDateToday.split('-');
  const vnFormat1 = `${parseInt(d)}/${parseInt(m)}/${y}`; // e.g. 16/9/2026
  const vnFormat2 = `${d}/${m}/${y}`; // e.g. 16/09/2026

  // 1. Filter trades that occurred today in Vietnam Time
  const todayTrades = (allTrades || []).filter(t => {
    const dStr = t.timestamp ? getVietnamDateStr(t.timestamp) : '';
    const vnStr = t.timeVietnam || t.time_vietnam || '';
    return dStr === vnDateToday || vnStr.includes(vnFormat1) || vnStr.includes(vnFormat2);
  });

  // 2. Closed trades today
  const todayClosed = todayTrades.filter(t => 
    t.status === 'WIN' || t.status === 'LOSS' || t.status === 'BREAKEVEN' || 
    (typeof t.pnl === 'number' && t.pnl !== null && t.status !== 'OPEN')
  );

  const todayOpen = todayTrades.filter(t => t.status === 'OPEN' || t.status === 'RUNNING');

  let todayWins = 0;
  let todayLosses = 0;
  let todayBreakevens = 0;
  let todayGrossWin = 0;
  let todayGrossLoss = 0;
  let todayNetPnL = 0;

  todayClosed.forEach(t => {
    const pnl = typeof t.pnl === 'number' ? t.pnl : 0;
    todayNetPnL += pnl;
    if (pnl > 0.05 || (t.status === 'WIN' && pnl > 0)) {
      todayWins++;
      todayGrossWin += pnl;
    } else if (pnl < -0.05 || t.status === 'LOSS') {
      todayLosses++;
      todayGrossLoss += Math.abs(pnl);
    } else {
      todayBreakevens++;
    }
  });

  todayNetPnL = +todayNetPnL.toFixed(2);
  todayGrossWin = +todayGrossWin.toFixed(2);
  todayGrossLoss = +todayGrossLoss.toFixed(2);

  const todayDecisive = todayWins + todayLosses;
  const todayWinRate = todayDecisive > 0 ? +((todayWins / todayDecisive) * 100).toFixed(1) : 0.0;
  const todayProfitFactor = todayGrossLoss > 0 ? +(todayGrossWin / todayGrossLoss).toFixed(2) : (todayGrossWin > 0 ? 999.0 : 0.0);

  // Baseline start balance for today
  const currentBalance = exnessStatus?.balance || exnessStatus?.equity || 11001.16;
  const todayStartBalance = prevEndingBalance ? prevEndingBalance : +(currentBalance - todayNetPnL).toFixed(2);
  const todayROI = todayStartBalance > 0 ? +((todayNetPnL / todayStartBalance) * 100).toFixed(2) : 0.0;

  // All-time calculation
  const allClosed = (allTrades || []).filter(t => 
    t.status === 'WIN' || t.status === 'LOSS' || t.status === 'BREAKEVEN' || 
    (typeof t.pnl === 'number' && t.pnl !== null && t.status !== 'OPEN')
  );
  let allWins = 0;
  let allLosses = 0;
  let allBreakevens = 0;
  let allGrossWin = 0;
  let allGrossLoss = 0;
  let allNetPnL = 0;

  allClosed.forEach(t => {
    const pnl = typeof t.pnl === 'number' ? t.pnl : 0;
    allNetPnL += pnl;
    if (pnl > 0.05 || (t.status === 'WIN' && pnl > 0)) {
      allWins++;
      allGrossWin += pnl;
    } else if (pnl < -0.05 || t.status === 'LOSS') {
      allLosses++;
      allGrossLoss += Math.abs(pnl);
    } else {
      allBreakevens++;
    }
  });

  const allDecisive = allWins + allLosses;
  const allWinRate = allDecisive > 0 ? +((allWins / allDecisive) * 100).toFixed(1) : 0.0;
  const allProfitFactor = allGrossLoss > 0 ? +(allGrossWin / allGrossLoss).toFixed(2) : 0.0;
  const initialBalance = 9388.75;
  const currentEquity = exnessStatus?.equity || currentBalance;
  const allROI = +(((currentEquity - initialBalance) / initialBalance) * 100).toFixed(2);

  return {
    today: {
      date: vnDateToday,
      dateLabel: `${d}/${m}/${y}`,
      startBalance: todayStartBalance,
      netPnL: todayNetPnL,
      roi: todayROI,
      winRate: todayWinRate,
      wins: todayWins,
      losses: todayLosses,
      breakevens: todayBreakevens,
      grossWin: todayGrossWin,
      grossLoss: todayGrossLoss,
      profitFactor: todayProfitFactor,
      closedTradesCount: todayClosed.length,
      openTradesCount: todayOpen.length,
      totalTradesToday: todayTrades.length
    },
    allTime: {
      initialBalance,
      equity: currentEquity,
      balance: currentBalance,
      netPnL: +(currentEquity - initialBalance).toFixed(2),
      roi: allROI,
      winRate: allWinRate,
      wins: allWins,
      losses: allLosses,
      breakevens: allBreakevens,
      grossWin: +allGrossWin.toFixed(2),
      grossLoss: +allGrossLoss.toFixed(2),
      profitFactor: allProfitFactor,
      closedTradesCount: allClosed.length,
      totalTradesCount: (allTrades || []).length
    }
  };
}

module.exports = {
  getVietnamDateStr,
  calculateDailyMetrics
};
