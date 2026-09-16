const assert = require('assert');

// Helper function to extract VN date (YYYY-MM-DD)
function getVietnamDateStr(isoOrDate) {
  const d = isoOrDate ? new Date(isoOrDate) : new Date();
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

// Function under test: calculateDailyMetrics
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
  const currentBalance = exnessStatus.balance || exnessStatus.equity || 11001.16;
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
  const allROI = +(((exnessStatus.equity - initialBalance) / initialBalance) * 100).toFixed(2);

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
      equity: exnessStatus.equity,
      balance: currentBalance,
      netPnL: +(exnessStatus.equity - initialBalance).toFixed(2),
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

// ==========================================
// TEST SUITE
// ==========================================
console.log('--- Running test_daily_reset.js ---');

// Test Case 1: Testing actual journal data on 2026-09-16
const fs = require('fs');
const path = require('path');
const journalPath = path.join(__dirname, 'data', 'journal.json');
const actualJournal = JSON.parse(fs.readFileSync(journalPath, 'utf8'));

const mockStatus = {
  equity: 10856.32,
  balance: 11001.16
};

const result = calculateDailyMetrics(new Date('2026-09-16T04:00:00Z'), actualJournal, mockStatus, 10838.81);

console.log('Today Metrics (2026-09-16):', JSON.stringify(result.today, null, 2));
console.log('All-Time Metrics:', JSON.stringify(result.allTime, null, 2));

assert.strictEqual(result.today.date, '2026-09-16', 'Date should be 2026-09-16');
assert.strictEqual(result.today.closedTradesCount, 4, 'Should have 4 closed trades today');
assert.strictEqual(result.today.wins, 2, 'Should have 2 wins today');
assert.strictEqual(result.today.losses, 2, 'Should have 2 losses today');
assert.strictEqual(result.today.winRate, 50.0, 'Winrate should be 50.0%');
assert.strictEqual(result.today.netPnL, 162.35, 'Net PnL should be +$162.35');
assert.strictEqual(result.today.roi, 1.50, 'Today ROI should be +1.50%');
assert.strictEqual(result.today.profitFactor, 2.53, 'Profit Factor should be 2.53');
assert.strictEqual(result.today.openTradesCount, 2, 'Should have 2 open trades today (BTC Sell Scalper + Runner)');

// Test Case 2: Edge Case — Brand New Day at 00:00:01 with 0 trades
const midnightDate = new Date('2026-09-17T00:00:01+07:00');
const midnightResult = calculateDailyMetrics(midnightDate, actualJournal, mockStatus, 11001.16);

console.log('Midnight New Day Metrics (2026-09-17):', JSON.stringify(midnightResult.today, null, 2));
assert.strictEqual(midnightResult.today.date, '2026-09-17', 'New day date should be 2026-09-17');
assert.strictEqual(midnightResult.today.closedTradesCount, 0, 'Should have 0 closed trades on new day');
assert.strictEqual(midnightResult.today.wins, 0, 'Wins should reset to 0');
assert.strictEqual(midnightResult.today.losses, 0, 'Losses should reset to 0');
assert.strictEqual(midnightResult.today.winRate, 0.0, 'Winrate should reset to 0.0%');
assert.strictEqual(midnightResult.today.netPnL, 0.0, 'Net PnL should reset to 0.00');
assert.strictEqual(midnightResult.today.roi, 0.0, 'ROI should reset to 0.0%');
assert.strictEqual(midnightResult.today.profitFactor, 0.0, 'Profit Factor should reset to 0.0');

console.log('✅ ALL TESTS PASSED SUCCESSFULLY!');
