const db = require('./database');
const fs = require('fs');

async function reconcileDb() {
  await db.initPromise;
  console.log('=== STARTING FORENSIC DATABASE RECONCILIATION ===\n');

  // 1. Reconcile the 9 closed trades from Exness
  const closedExnessUpdates = [
    {
      id: 88,
      ticket: '5101686584',
      pnl: -95.13,
      status: 'LOSS',
      closePrice: 4274.540,
      reason: 'STOP_LOSS',
      note: '[EXNESS VERIFIED] Đã đóng qua Stop Loss lúc Sep 15, 10:06:28 AM'
    },
    {
      id: 89,
      ticket: '5101688681',
      pnl: -97.77,
      status: 'LOSS',
      closePrice: 4273.670,
      reason: 'STOP_LOSS',
      note: '[EXNESS VERIFIED] Đã đóng qua Stop Loss lúc Sep 15, 10:06:23 AM'
    },
    {
      id: 82,
      ticket: '5101221691',
      pnl: -38.98,
      status: 'LOSS',
      closePrice: 7605.31,
      reason: 'STOP_LOSS',
      note: '[EXNESS VERIFIED] Đã đóng qua Stop Loss lúc Sep 15, 10:00:02 AM'
    },
    {
      id: 81,
      ticket: '5101220084',
      pnl: -38.35,
      status: 'LOSS',
      closePrice: 7605.06,
      reason: 'STOP_LOSS',
      note: '[EXNESS VERIFIED] Đã đóng qua Stop Loss lúc Sep 15, 10:00:02 AM'
    },
    {
      id: 86,
      ticket: '5101390230',
      pnl: -39.28,
      status: 'LOSS',
      closePrice: 7603.44,
      reason: 'STOP_LOSS',
      note: '[EXNESS VERIFIED] Đã đóng qua Stop Loss lúc Sep 15, 9:52:03 AM'
    },
    {
      id: 87,
      ticket: '5101390741',
      pnl: -38.98,
      status: 'LOSS',
      closePrice: 7603.07,
      reason: 'STOP_LOSS',
      note: '[EXNESS VERIFIED] Đã đóng qua Stop Loss lúc Sep 15, 9:51:16 AM'
    },
    {
      id: 83,
      ticket: '5101388610',
      pnl: -23.08,
      status: 'LOSS',
      closePrice: 4270.440,
      reason: 'STOP_LOSS',
      note: '[EXNESS VERIFIED] Đã đóng qua Stop Loss lúc Sep 15, 9:41:31 AM'
    },
    {
      id: 79,
      ticket: '5101096940',
      pnl: 54.21,
      status: 'WIN',
      closePrice: 4270.440,
      reason: 'TRAILING_STOP_PROFIT',
      note: '[EXNESS VERIFIED] Đã chốt lời qua Trailing Stop lúc Sep 15, 9:41:31 AM'
    },
    {
      id: 84,
      ticket: '5101388869',
      pnl: -22.85,
      status: 'LOSS',
      closePrice: 4270.440,
      reason: 'STOP_LOSS',
      note: '[EXNESS VERIFIED] Đã đóng qua Stop Loss lúc Sep 15, 9:41:31 AM'
    }
  ];

  for (const item of closedExnessUpdates) {
    const riskAmt = 45.0;
    const pnlR = item.pnl >= 0 ? `+${(item.pnl / riskAmt).toFixed(2)}R` : `-${(Math.abs(item.pnl) / riskAmt).toFixed(2)}R`;
    await db.run(`
      UPDATE trades 
      SET status = ?, pnl = ?, pnl_r = ?, close_price = ?, close_reason = ?, position_id = ?, note = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [item.status, item.pnl, pnlR, item.closePrice, item.reason, item.ticket, item.note, item.id]);
    console.log(`✅ [UPDATED EXNESS CLOSED] Trade #${item.id} -> ${item.status} $${item.pnl} (Ticket: ${item.ticket})`);
  }

  // 2. Mark ghost open trades (IDs that are not open on Exness) as BREAKEVEN
  const ghostTradeIds = [64, 65, 66, 67, 68, 69, 73, 75, 77, 85];
  for (const gid of ghostTradeIds) {
    await db.run(`
      UPDATE trades
      SET status = 'BREAKEVEN', pnl = 0.0, pnl_r = '0.00R', close_reason = 'BREAKEVEN_EXIT', note = COALESCE(note, '') || ' [Tất toán hòa vốn]', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'OPEN'
    `, [gid]);
    console.log(`✅ [CLEANED GHOST OPEN] Trade #${gid} -> BREAKEVEN $0.00`);
  }

  // 3. Mark the 21 historical $0 trades that were marked as WIN to BREAKEVEN
  // (Since a trade with PnL $0.00 is Breakeven / Hòa vốn, not a Win)
  const zeroWins = await db.all(`SELECT id, strategy, pnl FROM trades WHERE status = 'WIN' AND pnl = 0`);
  for (const zw of zeroWins) {
    await db.run(`
      UPDATE trades
      SET status = 'BREAKEVEN', pnl_r = '0.00R', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [zw.id]);
    console.log(`✅ [CLASSIFIED $0 TRADE] Trade #${zw.id} (${zw.strategy}) -> BREAKEVEN`);
  }

  // 4. Ensure the 5 truly open trades on Exness are marked OPEN with their tickets
  await db.run(`UPDATE trades SET position_id = '5101750124', status = 'OPEN' WHERE id = 90`);
  await db.run(`UPDATE trades SET status = 'OPEN' WHERE id = 91`);
  await db.run(`UPDATE trades SET position_id = '5101877732', status = 'OPEN' WHERE id = 92`);
  await db.run(`UPDATE trades SET status = 'OPEN' WHERE id = 93`);
  await db.run(`UPDATE trades SET position_id = '5100188009', status = 'OPEN' WHERE id = 39`);
  console.log(`✅ [CONFIRMED 5 OPEN TRADES] IDs 90, 91 (US500), 92, 93 (BTC), 39 (USOIL)`);

  // 5. Export clean data to JSON mirroring
  await db.exportToMirroredJson();
  console.log(`\n📘 [MIRRORING SUCCESS] Đã xuất toàn bộ dữ liệu sạch sang journal.json và ab_testing_journal.json`);

  // 6. Print summary
  const allAfter = await db.getAllTrades();
  const summary = {};
  for (const t of allAfter) {
    summary[t.status] = (summary[t.status] || 0) + 1;
  }
  console.log('\n=== RECONCILED DATABASE SUMMARY ===');
  console.log('Status counts:', summary);
  
  const realWins = allAfter.filter(t => t.status === 'WIN');
  const realLosses = allAfter.filter(t => t.status === 'LOSS');
  const breakevens = allAfter.filter(t => t.status === 'BREAKEVEN');
  const opens = allAfter.filter(t => t.status === 'OPEN');
  
  const grossWin = realWins.reduce((s, t) => s + (t.pnl || 0), 0);
  const grossLoss = realLosses.reduce((s, t) => s + Math.abs(t.pnl || 0), 0);
  const netPnl = grossWin - grossLoss;
  const winRate = (realWins.length / (realWins.length + realLosses.length) * 100).toFixed(1);
  const pf = grossLoss > 0 ? (grossWin / grossLoss).toFixed(2) : 'N/A';

  console.log(`Số lệnh Thắng thật (PnL > 0): ${realWins.length} (+${grossWin.toFixed(2)} USD)`);
  console.log(`Số lệnh Thua thật (PnL < 0): ${realLosses.length} (-${grossLoss.toFixed(2)} USD)`);
  console.log(`Số lệnh Hòa vốn (PnL = 0): ${breakevens.length}`);
  console.log(`Số vị thế đang mở: ${opens.length}`);
  console.log(`Tỷ lệ Thắng (Winrate): ${winRate}% (${realWins.length}/${realWins.length + realLosses.length})`);
  console.log(`Hệ số Profit Factor (PF): ${pf}`);
  console.log(`Lợi nhuận ròng (Net PnL): ${netPnl >= 0 ? '+' : ''}${netPnl.toFixed(2)} USD`);
}

reconcileDb().catch(console.error);
