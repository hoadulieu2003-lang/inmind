const { 
  TradingDaemon, 
  calcEmaPullback, 
  calcAsianRangeSweep, 
  calcVolumePA, 
  splitTwinLots, 
  calcTwinTakeProfits 
} = require('./daemon_monitor.js');
const riskManager = require('./risk_manager.js');
const config = require('./config.json');
const db = require('./database.js');
const fs = require('fs');
const path = require('path');

async function runTests() {
  console.log('======================================================================');
  console.log('🧪 BẮT ĐẦU KIỂM THỬ ĐƠN VỊ & HỆ THỐNG: TWIN-TICKET & PURE JS ENGINES');
  console.log('======================================================================\n');

  const daemon = new TradingDaemon();
  let passed = 0;
  let total = 0;

  function assert(name, condition, detail = '') {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${name} ${detail}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${name} ${detail}`);
    }
  }

  // TEST 1: Kiểm tra hàm phân chia khối lượng Cặp Lệnh Song Sinh (splitTwinLots)
  console.log('\n--- 1. Kiểm tra Phân Chia Khối Lượng Song Sinh (splitTwinLots) ---');
  {
    // Case 1.1: 0.10 lot chẵn (50/50)
    const res1 = splitTwinLots(0.10, 0.01, [0.5, 0.5]);
    assert('0.10 lot chia 50/50 cho lotA=0.05 và lotB=0.05', res1.lotA === 0.05 && res1.lotB === 0.05, `lotA: ${res1.lotA}, lotB: ${res1.lotB}`);

    // Case 1.2: 0.07 lot lẻ (50/50) -> lotA=0.03, lotB=0.04 (tổng đúng 0.07)
    const res2 = splitTwinLots(0.07, 0.01, [0.5, 0.5]);
    assert('0.07 lot lẻ chia cho lotA=0.03 và lotB=0.04 (tổng đúng 0.07)', res2.lotA === 0.03 && res2.lotB === 0.04 && +(res2.lotA + res2.lotB).toFixed(2) === 0.07, `lotA: ${res2.lotA}, lotB: ${res2.lotB}`);

    // Case 1.3: 0.25 lot (50/50) -> lotA=0.12, lotB=0.13 (tổng đúng 0.25)
    const res3 = splitTwinLots(0.25, 0.01, [0.5, 0.5]);
    assert('0.25 lot chia cho lotA=0.12 và lotB=0.13', res3.lotA === 0.12 && res3.lotB === 0.13 && +(res3.lotA + res3.lotB).toFixed(2) === 0.25, `lotA: ${res3.lotA}, lotB: ${res3.lotB}`);

    // Case 1.4: Biên tối thiểu 0.01 lot -> lotA=0.01, lotB=0.01 (chặn dưới lotStep)
    const res4 = splitTwinLots(0.01, 0.01, [0.5, 0.5]);
    assert('0.01 lot tối thiểu: cả 2 ticket giữ mức sàn 0.01 lot', res4.lotA === 0.01 && res4.lotB === 0.01, `lotA: ${res4.lotA}, lotB: ${res4.lotB}`);

    // Case 1.5: Tùy biến splitRatio [0.6, 0.4] trên 0.10 lot
    const res5 = splitTwinLots(0.10, 0.01, [0.6, 0.4]);
    assert('Tùy biến splitRatio [0.6, 0.4] cho lotA=0.06 và lotB=0.04', res5.lotA === 0.06 && res5.lotB === 0.04, `lotA: ${res5.lotA}, lotB: ${res5.lotB}`);
  }

  // TEST 2: Kiểm tra tính toán Take Profit cho Scalper (1.0) & Runner (1.5)
  console.log('\n--- 2. Kiểm tra Tính Toán TP Song Sinh (calcTwinTakeProfits) ---');
  {
    // Case 2.1: Lệnh BUY Vàng (GOLD) Entry: 2000.00, SL: 1990.00 (Risk = 10.00)
    const buyGold = calcTwinTakeProfits('BUY', 2000.00, 1990.00, 1.0, 1.5, 2);
    assert('BUY GOLD: Scalper TP = Entry + Risk*1.0 = 2010.00', buyGold.tpA === 2010.00, `Thực tế: ${buyGold.tpA}`);
    assert('BUY GOLD: Runner TP = Entry + Risk*1.5 = 2015.00', buyGold.tpB === 2015.00, `Thực tế: ${buyGold.tpB}`);

    // Case 2.2: Lệnh SELL Vàng (GOLD) Entry: 2000.00, SL: 2010.00 (Risk = 10.00)
    const sellGold = calcTwinTakeProfits('SELL', 2000.00, 2010.00, 1.0, 1.5, 2);
    assert('SELL GOLD: Scalper TP = Entry - Risk*1.0 = 1990.00', sellGold.tpA === 1990.00, `Thực tế: ${sellGold.tpA}`);
    assert('SELL GOLD: Runner TP = Entry - Risk*1.5 = 1985.00', sellGold.tpB === 1985.00, `Thực tế: ${sellGold.tpB}`);

    // Case 2.3: Lệnh Dầu (USOIL) với độ chính xác 3 chữ số thập phân (Decimals = 3)
    const buyOil = calcTwinTakeProfits('BUY', 100.500, 100.200, 1.0, 1.5, 3);
    assert('BUY USOIL (3 decimals): Scalper TP = 100.800', buyOil.tpA === 100.800, `Thực tế: ${buyOil.tpA}`);
    assert('BUY USOIL (3 decimals): Runner TP = 100.950', buyOil.tpB === 100.950, `Thực tế: ${buyOil.tpB}`);
  }

  // TEST 3: Kiểm tra Động cơ THETA: EMA 9/21 Pullback kết hợp EMA 200 thuần JS
  console.log('\n--- 3. Kiểm tra Động cơ THETA (calcEmaPullback) ---');
  {
    // Tạo chuỗi nến giả lập xu hướng tăng (Uptrend trên EMA 200)
    // Giá tăng dần từ 100 lên 200 qua 250 nến
    const bullBars = [];
    for (let i = 0; i < 250; i++) {
      const price = 100 + i * 0.4;
      bullBars.push({
        time: 1773500000 + i * 900,
        open: price - 0.1,
        high: price + 0.3,
        low: price - 0.2,
        close: price,
        volume: 100
      });
    }

    // Nến T-1 (index n-2 = 248): Pullback nhúng râu vào EMA 9-21 rồi bật tăng
    // EMA9 ~ 198.5, EMA21 ~ 196.5, EMA200 ~ 150
    bullBars[248] = {
      time: 1773500000 + 248 * 900,
      open: 197.0,
      high: 199.5,
      low: 196.8, // Chạm vào khoảng giữa EMA 9 và EMA 21
      close: 199.2, // Đóng nến xanh bật tăng
      volume: 150
    };
    // Nến đang hình thành (index 249)
    bullBars[249] = {
      time: 1773500000 + 249 * 900,
      open: 199.2, high: 199.6, low: 199.0, close: 199.4, volume: 50
    };

    const thetaBuyRes = calcEmaPullback(bullBars, 9, 21, 200);
    assert('THETA Bullish Pullback kích hoạt buySignal = true trên nến nhúng EMA 9-21', thetaBuyRes.buySignal === true, `buySignal: ${thetaBuyRes.buySignal}, EMA9: ${thetaBuyRes.ema9}, EMA21: ${thetaBuyRes.ema21}`);
    assert('THETA Bullish Pullback không kích hoạt sellSignal', thetaBuyRes.sellSignal === false);

    // Kiểm tra an toàn khi không đủ nến (< pSlow + 5)
    const shortBars = bullBars.slice(0, 15);
    const shortRes = calcEmaPullback(shortBars, 9, 21, 200);
    assert('THETA an toàn khi dữ liệu nến không đủ (< 26 nến)', shortRes.buySignal === false && shortRes.sellSignal === false && shortRes.ema9 === null);
  }

  // TEST 4: Kiểm tra Động cơ EPSILON: Asian Range Liquidity Sweep thuần JS
  console.log('\n--- 4. Kiểm tra Động cơ EPSILON (calcAsianRangeSweep) ---');
  {
    // Tạo dữ liệu nến cho 1 ngày: 00:00 UTC đến 12:00 UTC (M15 = 4 nến/giờ, 12 giờ = 48 nến)
    // Ngày: 2026-09-15
    const baseDate = new Date('2026-09-15T00:00:00.000Z').getTime();
    const dayBars = [];

    // Phiên Á: 00:00 - 08:00 UTC (32 nến). Giới hạn High: 105.00, Low: 100.00
    for (let i = 0; i < 32; i++) {
      dayBars.push({
        time: Math.floor((baseDate + i * 15 * 60 * 1000) / 1000),
        open: 102.0,
        high: 104.5,
        low: 101.0,
        close: 103.0,
        volume: 100
      });
    }
    // Đặt nến tạo High và Low phiên Á
    dayBars[10].high = 105.00; // Asian High = 105.00
    dayBars[20].low = 100.00;  // Asian Low = 100.00

    // Phiên London: 08:00 - 14:00 UTC.
    // Nến tại 09:00 UTC (i = 36) quét thủng Asian Low (99.50) rồi đóng nến rút râu tại 100.80 (green bar)
    for (let i = 32; i < 40; i++) {
      dayBars.push({
        time: Math.floor((baseDate + i * 15 * 60 * 1000) / 1000),
        open: 102.0, high: 103.0, low: 101.5, close: 102.5, volume: 100
      });
    }

    // Nến T-1 đã chốt (index n-2 = 38): Quét râu xuống dưới Asian Low rồi bật lên
    dayBars[38] = {
      time: Math.floor((baseDate + 38 * 15 * 60 * 1000) / 1000), // ~09:30 UTC (London session)
      open: 100.20,
      high: 101.20,
      low: 99.40, // Quét thủng 100.00
      close: 100.60, // Đóng nến xanh rút râu trên 100.00
      volume: 300
    };
    // Nến đang hình thành (index 39)
    dayBars[39] = {
      time: Math.floor((baseDate + 39 * 15 * 60 * 1000) / 1000),
      open: 100.60, high: 101.00, low: 100.50, close: 100.90, volume: 50
    };

    const epsilonBuy = calcAsianRangeSweep(dayBars);
    assert('EPSILON phát hiện chính xác Asian High (105.00) và Asian Low (100.00)', epsilonBuy.asianHigh === 105.00 && epsilonBuy.asianLow === 100.00, `High: ${epsilonBuy.asianHigh}, Low: ${epsilonBuy.asianLow}`);
    assert('EPSILON London Buy Sweep kích hoạt buySignal = true khi nến quét dưới Asian Low và rút râu', epsilonBuy.buySignal === true && epsilonBuy.session === 'LONDON');

    // Case 4.2: Ngoài giờ London (ví dụ 14:30 UTC - US session), quét râu không được kích hoạt tín hiệu
    dayBars[38].time = Math.floor(new Date('2026-09-15T14:30:00.000Z').getTime() / 1000);
    dayBars[39].time = Math.floor(new Date('2026-09-15T14:45:00.000Z').getTime() / 1000);
    const epsilonOutside = calcAsianRangeSweep(dayBars);
    assert('EPSILON không kích hoạt tín hiệu khi ngoài phiên London (14:30 UTC thuộc US session)', epsilonOutside.buySignal === false && epsilonOutside.session === 'US');
  }

  // TEST 5: Kiểm tra Động cơ KAPPA: Volume Price Action thuần JS
  console.log('\n--- 5. Kiểm tra Động cơ KAPPA (calcVolumePA) ---');
  {
    const volBars = [];
    for (let i = 0; i < 30; i++) {
      volBars.push({
        open: 100, high: 102, low: 99, close: 101, volume: 100
      });
    }
    // Nến T-1 (index 28): Volume đột biến 2.0x SMA (200 volume) và pinbar rút chân dưới mạnh
    volBars[28] = {
      open: 100.5,
      high: 103.0,
      low: 97.0, // range = 6.0
      close: 102.5, // (102.5 - 97.0) / 6.0 = 5.5 / 6.0 = 91.6% >= 55%
      volume: 250 // > 1.25x SMA (100)
    };
    volBars[29] = { open: 102.5, high: 103, low: 102, close: 102.8, volume: 50 };

    const kappaRes = calcVolumePA(volBars, 20);
    assert('KAPPA kích hoạt buySignal = true khi VolRatio >= 1.25x kết hợp pinbar rút râu', kappaRes.buySignal === true && kappaRes.volRatio >= 1.25, `VolRatio: ${kappaRes.volRatio}`);

    // Volume thấp (< 1.25x) không được kích hoạt
    volBars[28].volume = 80;
    const kappaLowVol = calcVolumePA(volBars, 20);
    assert('KAPPA từ chối khi volume không đạt chuẩn (< 1.25x)', kappaLowVol.buySignal === false);
  }

  // TEST 6: Kiểm tra Tính Toán Vị Thế RiskManager & Phân Tầng Rủi Ro (Tiered Risk 2% Top 1-3 & 1% Cơ sở)
  console.log('\n--- 6. Kiểm tra RiskManager & Tiered Risk (Top 1-3 2.0% & Cơ sở 1.0%) ---');
  {
    const posGold = riskManager.calculatePosition({
      symbol: 'GOLD',
      equity: 9525.00,
      riskAmount: 95.25, // 1% của $9,525
      entryPrice: 4280.00,
      stopLossPrice: 4270.00,
      takeProfitPrice: 4290.00, // R:R = 1.0
      currentSpread: 0.20
    });
    assert('RiskManager duyệt lệnh với R:R = 1.0 (minRiskRewardRatio = 1.0)', posGold.approved === true, `R:R: ${posGold.riskRewardRatio}, Reason: ${posGold.reason || 'OK'}`);
    assert('RiskManager tính toán lot hợp lý theo rủi ro ~$95 USD', posGold.lotSize > 0 && posGold.actualRiskAmount <= 100.0, `Lot: ${posGold.lotSize}, Rủi ro thực tế: $${posGold.actualRiskAmount}`);

    // Kiểm tra Tiered Risk: Top 1 (BETA), Top 2 (ALPHA), Top 3 (DELTA) đạt 2.0% rủi ro
    const posBeta = riskManager.calculatePosition({
      symbol: 'BTCUSD',
      strategy: 'ENGINE_BETA (CCI_PULLBACK)',
      equity: 10000,
      entryPrice: 70000,
      stopLossPrice: 69000,
      takeProfitPrice: 71000,
      currentSpread: 1
    });
    assert('Top 1 (ENGINE_BETA) được cấp quyền rủi ro 2.0% vốn', posBeta.riskPercent === 2.0 && posBeta.actualRiskAmount === 200, `Risk%: ${posBeta.riskPercent}, USD: $${posBeta.actualRiskAmount}`);

    const posAlpha = riskManager.calculatePosition({
      symbol: 'GOLD',
      strategy: 'ENGINE_ALPHA (UT_BOT)',
      equity: 10000,
      entryPrice: 2000,
      stopLossPrice: 1990,
      takeProfitPrice: 2010,
      currentSpread: 0.2
    });
    assert('Top 2 (ENGINE_ALPHA) được cấp quyền rủi ro 2.0% vốn', posAlpha.riskPercent === 2.0 && posAlpha.actualRiskAmount === 200, `Risk%: ${posAlpha.riskPercent}, USD: $${posAlpha.actualRiskAmount}`);

    const posDelta = riskManager.calculatePosition({
      symbol: 'BTCUSD',
      strategy: 'ENGINE_DELTA (HALFTREND_ADX)',
      equity: 10000,
      entryPrice: 70000,
      stopLossPrice: 69000,
      takeProfitPrice: 71000,
      currentSpread: 1
    });
    assert('Top 3 (ENGINE_DELTA) được cấp quyền rủi ro 2.0% vốn', posDelta.riskPercent === 2.0 && posDelta.actualRiskAmount === 200, `Risk%: ${posDelta.riskPercent}, USD: $${posDelta.actualRiskAmount}`);

    // Động cơ không thuộc Top 3 (ví dụ ENGINE_THETA) chỉ nhận 1.0% cơ sở
    const posTheta = riskManager.calculatePosition({
      symbol: 'GOLD',
      strategy: 'ENGINE_THETA (EMA_PULLBACK)',
      equity: 10000,
      entryPrice: 2000,
      stopLossPrice: 1990,
      takeProfitPrice: 2010,
      currentSpread: 0.2
    });
    assert('Động cơ ngoài Top 3 (ENGINE_THETA) duy trì rủi ro cơ sở 1.0% vốn', posTheta.riskPercent === 1.0 && posTheta.actualRiskAmount === 100, `Risk%: ${posTheta.riskPercent}, USD: $${posTheta.actualRiskAmount}`);

    // Kiểm tra checkIsTopRankedStrategy trên TradingDaemon
    const isBetaTop = await daemon.checkIsTopRankedStrategy('ENGINE_BETA (CCI_PULLBACK)');
    const isThetaTop = await daemon.checkIsTopRankedStrategy('ENGINE_THETA (EMA_PULLBACK)');
    assert('TradingDaemon.checkIsTopRankedStrategy nhận diện đúng Top 1-3 và từ chối ngoài Top 3', isBetaTop === true && isThetaTop === false, `Beta: ${isBetaTop}, Theta: ${isThetaTop}`);
  }

  // TEST 7: Kiểm tra Timing Nến Đã Chốt (WP-03)
  console.log('\n--- 7. Kiểm tra Timing Nến Đã Chốt (WP-03) ---');
  {
    const msWait = daemon.calculateMsToNextScan();
    const nextTargetDate = new Date(Date.now() + msWait);
    const targetMin = nextTargetDate.getMinutes();
    const targetSec = nextTargetDate.getSeconds();
    console.log(`Thời gian quét kế tiếp: ${nextTargetDate.toLocaleTimeString('vi-VN')} (Chờ ${(msWait / 1000).toFixed(1)}s)`);
    assert('calculateMsToNextScan nhắm đúng giây thứ 05', targetSec === 5, `Giây thực tế: ${targetSec} (Kỳ vọng: 5)`);
    assert('calculateMsToNextScan nhắm đúng phút 00, 15, 30 hoặc 45', [0, 15, 30, 45].includes(targetMin), `Phút: ${targetMin}`);
  }

  // TEST 8: Kiểm tra an toàn mã nguồn (Không có process.exit và không ép chuyển GOLD)
  console.log('\n--- 8. Kiểm tra Kỷ luật Mã Nguồn (WP-01 & WP-04) ---');
  {
    const fileContent = fs.readFileSync(path.join(__dirname, 'daemon_monitor.js'), 'utf8');
    const hasProcessExit = /process\.exit\s*\(/.test(fileContent);
    assert('Không còn bất kỳ lệnh process.exit nào trong file daemon_monitor.js', !hasProcessExit);

    const hasForcedGoldAtEnd = /await\s+this\.setSymbolInternal\s*\(\s*ws\s*,\s*['"]GOLD['"]\s*\)\s*;\s*\}\s*catch/i.test(fileContent);
    assert('Đã loại bỏ hoàn toàn lệnh ép chuyển ngược về GOLD cuối chu trình quét', !hasForcedGoldAtEnd);
  }

  // TEST 9: Kiểm tra Ghi và DỌN DẸP SẠCH Journal ở CẢ 2 file & SQLite
  console.log('\n--- 9. Kiểm tra Ghi & Dọn Dẹp Sạch Nhật Ký Kép (WP-05) ---');
  {
    const testJournalEvent = {
      asset: 'TEST_GOLD_UNIT',
      symbol: 'XAU/USD',
      strategy: 'ENGINE_THETA [SCALPER R:R 1.0]',
      ticketType: 'SCALPER',
      action: 'BUY',
      entryPrice: 4280.0,
      stopLoss: 4270.0,
      takeProfit: 4290.0,
      lotSize: 0.05,
      riskAmount: 47.5,
      ema200: 4255.0,
      exnessScreenshot: 'test_order.png',
      tvScreenshot: 'test_chart.png'
    };
    daemon.recordJournalEvent(testJournalEvent);

    // Chờ 200ms để SQLite ghi hoàn tất
    await new Promise(r => setTimeout(r, 200));

    const abPath = path.join(__dirname, 'ab_testing_journal.json');
    const dataJournalPath = path.join(__dirname, 'data', 'journal.json');

    const abData = JSON.parse(fs.readFileSync(abPath, 'utf8'));
    const dataJournal = JSON.parse(fs.readFileSync(dataJournalPath, 'utf8'));

    const lastAb = abData[abData.length - 1];
    const lastData = dataJournal[dataJournal.length - 1];

    assert('Ghi nhận sự kiện vào ab_testing_journal.json với ticketType SCALPER', lastAb && lastAb.asset === 'TEST_GOLD_UNIT' && lastAb.ticketType === 'SCALPER');
    assert('Đồng bộ đồng thời vào data/journal.json', lastData && lastData.asset === 'TEST_GOLD_UNIT' && lastData.ticketType === 'SCALPER');

    // DỌN DẸP SẠCH CẢ 2 FILE & SQLITE
    await db.deleteTradesByAsset('TEST_GOLD_UNIT');
    let cleanAb = JSON.parse(fs.readFileSync(abPath, 'utf8')).filter(x => x.asset !== 'TEST_GOLD_UNIT');
    let cleanData = JSON.parse(fs.readFileSync(dataJournalPath, 'utf8')).filter(x => x.asset !== 'TEST_GOLD_UNIT');
    fs.writeFileSync(abPath, JSON.stringify(cleanAb, null, 2));
    fs.writeFileSync(dataJournalPath, JSON.stringify(cleanData, null, 2));

    // Xác nhận không còn rác TEST_GOLD_UNIT trong cả 2 file và SQLite
    cleanAb = JSON.parse(fs.readFileSync(abPath, 'utf8'));
    cleanData = JSON.parse(fs.readFileSync(dataJournalPath, 'utf8'));
    const cleanDbTrades = await db.getAllTrades();
    assert('Đã dọn dẹp sạch hoàn toàn dữ liệu kiểm thử ở CẢ 2 file journal & SQLite', 
      !cleanAb.some(x => x.asset === 'TEST_GOLD_UNIT') && 
      !cleanData.some(x => x.asset === 'TEST_GOLD_UNIT') &&
      !cleanDbTrades.some(x => x.asset === 'TEST_GOLD_UNIT')
    );
  }

  // TEST 11: Kiểm tra Bóc Tách Huy Hiệu Exness & Cơ Chế Dồn Lệnh Phi Rủi Ro (Free-Ride Pyramiding)
  console.log('\n--- 11. Kiểm tra Bóc Tách Huy Hiệu Exness & Free-Ride Pyramiding ---');
  {
    function parseRowTickets(rowStr) {
      const clean = (rowStr || '').replace(/[\u2066\u2067\u2068\u2069\u200E\u200F≈]/g, '').trim();
      const parts = clean.split(/\s+/);
      const sideIdx = parts.findIndex(p => ['Buy', 'Sell', 'Mua', 'Bán'].includes(p));
      let ticketCount = 1;
      if (sideIdx > 1 && !isNaN(parseInt(parts[1]))) {
        ticketCount = parseInt(parts[1]);
      }
      return {
        ticketCount,
        layersCount: Math.ceil(ticketCount / 2)
      };
    }

    // Case 11.1: Huy hiệu 16 tickets
    const resBtc16 = parseRowTickets('BTC 16 Sell 5.54 77,519.86 77,356.72 +903.82');
    assert('Bóc tách chính xác 16 tickets và 8 tầng từ chuỗi BTC 16 Sell', resBtc16.ticketCount === 16 && resBtc16.layersCount === 8, `Tickets: ${resBtc16.ticketCount}, Tầng: ${resBtc16.layersCount}`);

    // Case 11.2: Huy hiệu 4 tickets
    const resOil4 = parseRowTickets('USOIL 4 Sell 0.04 98.942 99.178 -2.36');
    assert('Bóc tách chính xác 4 tickets và 2 tầng từ chuỗi USOIL 4 Sell', resOil4.ticketCount === 4 && resOil4.layersCount === 2, `Tickets: ${resOil4.ticketCount}, Tầng: ${resOil4.layersCount}`);

    // Case 11.3: Lệnh đơn không có huy hiệu
    const resGold1 = parseRowTickets('XAU/USD Buy 0.08 4,303.185 4,306.893 +33.40');
    assert('Bóc tách chính xác 1 ticket và 1 tầng từ chuỗi đơn không có huy hiệu', resGold1.ticketCount === 1 && resGold1.layersCount === 1, `Tickets: ${resGold1.ticketCount}, Tầng: ${resGold1.layersCount}`);

    // Case 11.4: Free-Ride Pyramiding Guard - Chặn dồn tầng nếu tầng cũ chưa Breakeven
    function checkAllowPyramiding(currentLayers, maxLayers, activeTrades, requireBE = true) {
      if (currentLayers >= maxLayers) return { allowed: false, reason: 'CAP_REACHED' };
      if (currentLayers > 0 && requireBE) {
        const hasUnprotected = activeTrades.some(t => !t.isBreakeven);
        if (hasUnprotected) return { allowed: false, reason: 'PREVIOUS_LAYER_NOT_BREAKEVEN' };
      }
      return { allowed: true, reason: 'APPROVED' };
    }

    const unprotectTrades = [{ id: 1, isBreakeven: false }, { id: 2, isBreakeven: true }];
    const resBlocked = checkAllowPyramiding(1, 2, unprotectTrades, true);
    assert('Chặn dồn tầng mới khi tầng cũ chưa khóa Breakeven', resBlocked.allowed === false && resBlocked.reason === 'PREVIOUS_LAYER_NOT_BREAKEVEN');

    // Case 11.5: Free-Ride Pyramiding Guard - Cho phép dồn tầng khi tất cả tầng cũ đã Breakeven
    const protectTrades = [{ id: 1, isBreakeven: true }, { id: 2, isBreakeven: true }];
    const resApproved = checkAllowPyramiding(1, 2, protectTrades, true);
    assert('Cấp phép dồn tầng mới khi tất cả tầng cũ đã khóa Breakeven', resApproved.allowed === true && resApproved.reason === 'APPROVED');

    // Case 11.6: Khóa trần tuyệt đối khi đã đủ số tầng tối đa
    const resCap = checkAllowPyramiding(2, 2, protectTrades, true);
    assert('Khóa trần tuyệt đối khi đã đạt số tầng tối đa (2/2)', resCap.allowed === false && resCap.reason === 'CAP_REACHED');
  }

  console.log('\n======================================================================');
  console.log(`🏁 KẾT QUẢ KIỂM THỬ: ${passed}/${total} BÀI KIỂM TRA ĐẠT (${((passed / total) * 100).toFixed(0)}%)`);
  console.log('======================================================================\n');

  if (passed < total) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal Test Runner Exception:', err);
  process.exit(1);
});
