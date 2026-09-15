const db = require('c:/Users/game/Documents/app/trade/database');
const fs = require('fs');
const path = require('path');

async function runEodArchival(targetDateStr = null) {
  const now = new Date();
  const dateStr = targetDateStr || now.toISOString().slice(0, 10);
  console.log(`[EOD ARCHIVER] 📦 Bắt đầu tiến trình chụp snapshot hiệu suất ngày: ${dateStr}...`);

  const tradeDir = 'c:/Users/game/Documents/app/trade';
  const historyDir = path.join(tradeDir, 'data', 'history');
  if (!fs.existsSync(historyDir)) fs.mkdirSync(historyDir, { recursive: true });

  const statusPath = path.join(tradeDir, 'data', 'status.json');
  let status = {};
  try {
    if (fs.existsSync(statusPath)) {
      status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    }
  } catch (e) {}

  const allTrades = await db.getAllTrades();
  const closedTrades = allTrades.filter(t => t.status !== 'OPEN');

  let grossProfit = 0;
  let grossLoss = 0;
  let totalPnL = 0;
  let wins = 0;
  let losses = 0;
  let breakevens = 0;

  const strategyBreakdown = {};
  const assetBreakdown = {};
  const ticketBreakdown = { SCALPER: { trades: 0, wins: 0, losses: 0, bes: 0, pnl: 0 }, RUNNER: { trades: 0, wins: 0, losses: 0, bes: 0, pnl: 0 } };

  closedTrades.forEach(t => {
    const pnl = Number(t.pnl) || 0;
    totalPnL += pnl;
    if (pnl > 0.5) {
      wins++;
      grossProfit += pnl;
    } else if (pnl < -0.5) {
      losses++;
      grossLoss += Math.abs(pnl);
    } else {
      breakevens++;
    }

    const strat = (t.strategy || 'UNKNOWN').split(' [')[0].trim();
    if (!strategyBreakdown[strat]) strategyBreakdown[strat] = { trades: 0, wins: 0, losses: 0, bes: 0, pnl: 0 };
    strategyBreakdown[strat].trades++;
    strategyBreakdown[strat].pnl = +(strategyBreakdown[strat].pnl + pnl).toFixed(2);
    if (pnl > 0.5) strategyBreakdown[strat].wins++;
    else if (pnl < -0.5) strategyBreakdown[strat].losses++;
    else strategyBreakdown[strat].bes++;

    const sym = t.symbol || t.asset || 'UNKNOWN';
    if (!assetBreakdown[sym]) assetBreakdown[sym] = { trades: 0, wins: 0, losses: 0, bes: 0, pnl: 0 };
    assetBreakdown[sym].trades++;
    assetBreakdown[sym].pnl = +(assetBreakdown[sym].pnl + pnl).toFixed(2);
    if (pnl > 0.5) assetBreakdown[sym].wins++;
    else if (pnl < -0.5) assetBreakdown[sym].losses++;
    else assetBreakdown[sym].bes++;

    let ticketType = null;
    if (t.strategy && t.strategy.includes('SCALPER')) ticketType = 'SCALPER';
    else if (t.strategy && t.strategy.includes('RUNNER')) ticketType = 'RUNNER';
    if (ticketType && ticketBreakdown[ticketType]) {
      const k = ticketBreakdown[ticketType];
      k.trades++;
      k.pnl = +(k.pnl + pnl).toFixed(2);
      if (pnl > 0.5) k.wins++;
      else if (pnl < -0.5) k.losses++;
      else k.bes++;
    }
  });

  const pf = grossLoss > 0 ? +(grossProfit / grossLoss).toFixed(2) : (grossProfit > 0 ? 999.0 : 0.0);
  const winRate = (wins + losses) > 0 ? +((wins / (wins + losses)) * 100).toFixed(1) : 0.0;

  const snapshot = {
    date: dateStr,
    generatedAt: new Date().toISOString(),
    initialBalance: status.initialBalance || 9388.75,
    endingBalance: status.balance || (status.initialBalance || 9388.75) + totalPnL,
    endingEquity: status.equity || status.balance,
    netPnL: status.netPnL || +totalPnL.toFixed(2),
    roiPercent: status.roi || +(((status.netPnL || totalPnL) / (status.initialBalance || 9388.75)) * 100).toFixed(2),
    performance: {
      totalClosedTrades: closedTrades.length,
      winTrades: wins,
      lossTrades: losses,
      breakevenTrades: breakevens,
      winRatePercent: winRate,
      profitFactor: pf,
      grossProfitUSD: +grossProfit.toFixed(2),
      grossLossUSD: +grossLoss.toFixed(2),
      averageWinUSD: wins > 0 ? +(grossProfit / wins).toFixed(2) : 0,
      averageLossUSD: losses > 0 ? +(grossLoss / losses).toFixed(2) : 0,
      evRatio: losses > 0 && wins > 0 ? +((grossProfit / wins) / (grossLoss / losses)).toFixed(2) : null
    },
    strategyBreakdown,
    assetBreakdown,
    ticketBreakdown,
    openPositionsAtClose: status.positionsList || []
  };

  const snapshotFile = path.join(historyDir, `daily_summary_${dateStr}.json`);
  fs.writeFileSync(snapshotFile, JSON.stringify(snapshot, null, 2));
  console.log(`✅ [EOD ARCHIVER] Đã lưu snapshot ngày vào: ${snapshotFile}`);

  const equityHistoryFile = path.join(historyDir, 'equity_history.json');
  let equityHistory = [];
  try {
    if (fs.existsSync(equityHistoryFile)) {
      equityHistory = JSON.parse(fs.readFileSync(equityHistoryFile, 'utf8'));
    }
  } catch (e) {}

  const existingIdx = equityHistory.findIndex(h => h.date === dateStr);
  const historyPoint = {
    date: dateStr,
    balance: snapshot.endingBalance,
    equity: snapshot.endingEquity,
    netPnL: snapshot.netPnL,
    roi: snapshot.roiPercent,
    trades: snapshot.performance.totalClosedTrades,
    winRate: snapshot.performance.winRatePercent,
    profitFactor: snapshot.performance.profitFactor
  };

  if (existingIdx >= 0) {
    equityHistory[existingIdx] = historyPoint;
  } else {
    equityHistory.push(historyPoint);
  }
  fs.writeFileSync(equityHistoryFile, JSON.stringify(equityHistory, null, 2));
  console.log(`✅ [EOD ARCHIVER] Đã cập nhật chuỗi tăng trưởng vốn (Equity History) với ${equityHistory.length} mốc dữ liệu!`);

  return snapshot;
}

if (require.main === module) {
  runEodArchival().then(() => {
    process.exit(0);
  }).catch(err => {
    console.error('❌ Lỗi EOD Archival:', err);
    process.exit(1);
  });
}

module.exports = { runEodArchival };
