const engine = require('./trade_engine.js');
const riskManager = require('./risk_manager.js');

async function runTestOrder() {
  console.log('=== KHỞI ĐỘNG KIỂM TRA LỆNH THỬ NGHIỆM TRÊN EXNESS DEMO ===');
  
  // 1. Quét và đồng bộ 2 tab
  const tabs = await engine.discoverTabs();
  console.log('1. Đã kết nối 2 tab:');
  console.log('   - TradingView:', tabs.tradingView?.title);
  console.log('   - Exness:', tabs.exness?.title);

  // 2. Đọc trạng thái tài khoản
  const state = await engine.getExnessState();
  console.log('\n2. Trạng thái Exness hiện tại:');
  console.log(`   - Số dư (Equity): $${state.equity}`);
  console.log(`   - Giá Bán (Bid): ${state.sellPrice}`);
  console.log(`   - Giá Mua (Ask): ${state.buyPrice}`);
  console.log(`   - Chênh lệch (Spread): ${state.spread} USD`);

  // 3. Tính toán thông số cho lệnh test an toàn
  const testLot = '0.01';
  const entry = state.buyPrice;
  const sl = +(entry - 5.00).toFixed(2);   // SL 5 giá dưới Entry
  const tp = +(entry + 7.50).toFixed(2);   // TP 7.5 giá trên Entry (R:R = 1.5)

  console.log('\n3. Kế hoạch Lệnh Test:');
  console.log(`   - Hành động: BUY MARKET`);
  console.log(`   - Khối lượng: ${testLot} lot (Lô nhỏ nhất, rủi ro ~ $5.00 trên tài khoản $10,000)`);
  console.log(`   - Giá vào dự kiến: ${entry}`);
  console.log(`   - Cắt lỗ (SL): ${sl}`);
  console.log(`   - Chốt lời (TP): ${tp}`);
  console.log(`   - Tỷ lệ R:R: 1 : 1.5`);

  // 4. Thực thi điền thông số và click Buy
  console.log('\n4. Đang gửi lệnh qua CDP...');
  const result = await engine.executeMarketOrder({
    action: 'BUY',
    volume: testLot,
    stopLoss: sl.toString(),
    takeProfit: tp.toString()
  });

  console.log('Kết quả thực thi:', result);
  return result;
}

if (require.main === module) {
  runTestOrder().catch(console.error);
}

module.exports = runTestOrder;
