const db = require('./database');

async function analyzeStrategies() {
  await db.initPromise;
  const trades = await db.getAllTrades();
  
  // Group by base strategy
  const stratStats = {};
  
  for (const t of trades) {
    const rawName = t.strategy || 'UNKNOWN';
    let baseStrat = 'OTHER';
    if (rawName.includes('ENGINE_ALPHA')) baseStrat = 'ENGINE_ALPHA (UT_BOT)';
    else if (rawName.includes('ENGINE_BETA')) baseStrat = 'ENGINE_BETA (CCI_PULLBACK)';
    else if (rawName.includes('ENGINE_DELTA')) baseStrat = 'ENGINE_DELTA (HALFTREND_ADX)';
    else if (rawName.includes('ENGINE_THETA')) baseStrat = 'ENGINE_THETA (EMA_PULLBACK)';
    else if (rawName.includes('ENGINE_EPSILON')) baseStrat = 'ENGINE_EPSILON (ASIAN_SWEEP)';
    else if (rawName.includes('ENGINE_ZETA')) baseStrat = 'ENGINE_ZETA (SUPERTREND_RSI)';
    else if (rawName.includes('ENGINE_KAPPA')) baseStrat = 'ENGINE_KAPPA (VOLUME_PA)';
    
    if (!stratStats[baseStrat]) {
      stratStats[baseStrat] = {
        name: baseStrat,
        totalTrades: 0,
        openTrades: 0,
        closedTrades: 0,
        wins: 0,
        losses: 0,
        breakevens: 0,
        grossProfit: 0,
        grossLoss: 0,
        netPnl: 0,
        assets: new Set(),
        tradesList: []
      };
    }
    
    const s = stratStats[baseStrat];
    s.totalTrades++;
    s.assets.add(t.asset);
    
    if (t.status === 'OPEN') {
      s.openTrades++;
    } else {
      s.closedTrades++;
      const pnl = typeof t.pnl === 'number' ? t.pnl : 0;
      if (t.status === 'WIN' || pnl > 0) {
        s.wins++;
        s.grossProfit += pnl;
        s.netPnl += pnl;
      } else if (t.status === 'LOSS' || pnl < 0) {
        s.losses++;
        s.grossLoss += Math.abs(pnl);
        s.netPnl += pnl;
      } else {
        s.breakevens++;
      }
    }
    s.tradesList.push({
      id: t.id,
      asset: t.asset,
      action: t.action,
      status: t.status,
      pnl: t.pnl,
      lot: t.lotSize,
      time: t.timestamp
    });
  }
  
  console.log('=== STRATEGY PERFORMANCE BREAKDOWN (ALL DATA) ===\n');
  for (const [k, v] of Object.entries(stratStats)) {
    const decisive = v.wins + v.losses;
    const wr = decisive > 0 ? ((v.wins / decisive) * 100).toFixed(1) : 'N/A';
    const pf = v.grossLoss > 0 ? (v.grossProfit / v.grossLoss).toFixed(2) : (v.grossProfit > 0 ? 'Max Alpha' : '0.00');
    const avgWin = v.wins > 0 ? (v.grossProfit / v.wins).toFixed(2) : '0';
    const avgLoss = v.losses > 0 ? (v.grossLoss / v.losses).toFixed(2) : '0';
    
    console.log(`[${k}]`);
    console.log(`  Assets: ${Array.from(v.assets).join(', ')}`);
    console.log(`  Total Trades: ${v.totalTrades} (Open: ${v.openTrades}, Closed: ${v.closedTrades})`);
    console.log(`  Wins: ${v.wins} | Losses: ${v.losses} | Breakevens: ${v.breakevens}`);
    console.log(`  Winrate: ${wr}% (Decisive: ${decisive})`);
    console.log(`  Gross Profit: +$${v.grossProfit.toFixed(2)} | Gross Loss: -$${v.grossLoss.toFixed(2)} | Net PnL: ${v.netPnl >= 0 ? '+' : ''}$${v.netPnl.toFixed(2)}`);
    console.log(`  Profit Factor: ${pf} | Avg Win: $${avgWin} | Avg Loss: $${avgLoss}`);
    console.log('----------------------------------------------------');
  }

  // Also analyze by Asset
  const assetStats = {};
  for (const t of trades) {
    const a = t.asset || 'UNKNOWN';
    if (!assetStats[a]) {
      assetStats[a] = { total: 0, open: 0, wins: 0, losses: 0, breakevens: 0, netPnl: 0, grossWin: 0, grossLoss: 0 };
    }
    const as = assetStats[a];
    as.total++;
    if (t.status === 'OPEN') as.open++;
    else {
      const pnl = typeof t.pnl === 'number' ? t.pnl : 0;
      if (t.status === 'WIN' || pnl > 0) { as.wins++; as.grossWin += pnl; as.netPnl += pnl; }
      else if (t.status === 'LOSS' || pnl < 0) { as.losses++; as.grossLoss += Math.abs(pnl); as.netPnl += pnl; }
      else as.breakevens++;
    }
  }

  console.log('\n=== ASSET PERFORMANCE BREAKDOWN ===\n');
  for (const [k, v] of Object.entries(assetStats)) {
    const decisive = v.wins + v.losses;
    const wr = decisive > 0 ? ((v.wins / decisive) * 100).toFixed(1) : 'N/A';
    const pf = v.grossLoss > 0 ? (v.grossWin / v.grossLoss).toFixed(2) : (v.grossWin > 0 ? 'Max Alpha' : '0.00');
    console.log(`[${k}] Total: ${v.total} (Open: ${v.open}) | W: ${v.wins} / L: ${v.losses} / BE: ${v.breakevens} | WR: ${wr}% | Net: ${v.netPnl >= 0 ? '+' : ''}$${v.netPnl.toFixed(2)} | PF: ${pf}`);
  }
}

analyzeStrategies().catch(console.error);
