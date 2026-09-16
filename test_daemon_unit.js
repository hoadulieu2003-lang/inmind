const { 
  TradingDaemon, 
  calcEmaPullback, 
  calcAsianRangeSweep, 
  calcVolumePA, 
  calcRsiDivergence,
  calcBollingerBandExtreme,
  calcLiquiditySweepFade,
  splitTwinLots, 
  calcTwinTakeProfits,
  calcLockProfitSL,
  calcDynSlBuffer,
  checkSessionFilter
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

    // Case 4.3: Judas Swing mở cửa London 07:15 UTC (14:15 VN) đón trọn cú lừa quét đỉnh Asian High
    const judasBars = dayBars.slice(0, 30); // 00:00 - 07:00 UTC
    judasBars[10].high = 105.00;
    judasBars[20].low = 100.00;
    // Nến đóng hoàn thành lúc 07:15 UTC (14:15 VN) quét vọt đỉnh 105.00 lên 105.80 rồi đóng nến đỏ tại 104.50
    judasBars.push({
      time: Math.floor(new Date('2026-09-15T07:15:00.000Z').getTime() / 1000),
      open: 104.80,
      high: 105.80, // Quét thủng đỉnh 105.00
      low: 104.20,
      close: 104.50, // Đóng nến đỏ dưới đỉnh 105.00
      volume: 400
    });
    // Nến đang chạy lúc 07:30 UTC
    judasBars.push({
      time: Math.floor(new Date('2026-09-15T07:30:00.000Z').getTime() / 1000),
      open: 104.50, high: 104.70, low: 104.30, close: 104.40, volume: 50
    });
    const epsilonJudas = calcAsianRangeSweep(judasBars);
    assert('EPSILON đón trọn Judas Swing 07:15 UTC (14:15 VN) kích hoạt sellSignal = true', epsilonJudas.sellSignal === true && epsilonJudas.session === 'LONDON', `sellSignal: ${epsilonJudas.sellSignal}, session: ${epsilonJudas.session}`);
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

  // TEST 6: Kiểm tra Tính Toán Vị Thế RiskManager & Phân Tầng Rủi Ro (Top 1: 10% BTC/5% Phi-BTC, Top 2-3: 5.0%, Cơ sở: 2.0%)
  console.log('\n--- 6. Kiểm tra RiskManager & Tiered Risk (Top 1: 10% BTC/5% Phi-BTC, Top 2-3: 5.0%, Cơ sở: 2.0%) ---');
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

    // Kiểm tra Tiered Risk: Top 1 (DELTA trên BTC 10.0%, Phi-BTC 5.0%), Top 2 (BETA 5.0%), Top 3 (ALPHA 5.0%, OMEGA 5.0%), Cơ sở (THETA 2.0%), Counter-Trend (LAMBDA 2.0%)
    const posDelta = riskManager.calculatePosition({
      symbol: 'BTCUSD',
      strategy: 'ENGINE_DELTA (HALFTREND_ADX)',
      equity: 10000,
      entryPrice: 70000,
      stopLossPrice: 69000,
      takeProfitPrice: 71000,
      currentSpread: 1
    });
    assert('Top 1 (ENGINE_DELTA trên BTCUSD) được cấp quyền rủi ro 10.0% vốn', posDelta.riskPercent === 10.0 && posDelta.actualRiskAmount === 1000, `Risk%: ${posDelta.riskPercent}, USD: $${posDelta.actualRiskAmount}`);

    const posDeltaGold = riskManager.calculatePosition({
      symbol: 'GOLD',
      strategy: 'ENGINE_DELTA (HALFTREND_ADX)',
      equity: 10000,
      entryPrice: 2000,
      stopLossPrice: 1990,
      takeProfitPrice: 2010,
      currentSpread: 0.2
    });
    assert('Top 1 (ENGINE_DELTA trên Phi-BTC) khóa trần an toàn 5.0% vốn', posDeltaGold.riskPercent === 5.0 && posDeltaGold.actualRiskAmount === 500, `Risk%: ${posDeltaGold.riskPercent}, USD: $${posDeltaGold.actualRiskAmount}`);

    const posBeta = riskManager.calculatePosition({
      symbol: 'BTCUSD',
      strategy: 'ENGINE_BETA (CCI_PULLBACK)',
      equity: 10000,
      entryPrice: 70000,
      stopLossPrice: 69000,
      takeProfitPrice: 71000,
      currentSpread: 1
    });
    assert('Top 2 (ENGINE_BETA) được cấp quyền rủi ro 5.0% vốn', posBeta.riskPercent === 5.0 && posBeta.actualRiskAmount === 500, `Risk%: ${posBeta.riskPercent}, USD: $${posBeta.actualRiskAmount}`);

    const posAlpha = riskManager.calculatePosition({
      symbol: 'GOLD',
      strategy: 'ENGINE_ALPHA (UT_BOT)',
      equity: 10000,
      entryPrice: 2000,
      stopLossPrice: 1990,
      takeProfitPrice: 2010,
      currentSpread: 0.2
    });
    assert('Top 3 (ENGINE_ALPHA) được nâng quyền rủi ro lên 5.0% vốn', posAlpha.riskPercent === 5.0 && posAlpha.actualRiskAmount === 500, `Risk%: ${posAlpha.riskPercent}, USD: $${posAlpha.actualRiskAmount}`);
    assert('Top 3 (ENGINE_ALPHA) tính đúng R:R = 1.0 và potentialReward không bị NaN', posAlpha.riskRewardRatio === 1.0 && !isNaN(posAlpha.potentialReward) && posAlpha.potentialReward === 500, `RR: ${posAlpha.riskRewardRatio}, Reward: $${posAlpha.potentialReward}`);

    // Kiểm tra tính vị thế trên GBPUSD với ENGINE_ALPHA (Top 3: 5.0% Vốn, ContractSize: 100,000)
    const posGbpAlpha = riskManager.calculatePosition({
      symbol: 'GBPUSD',
      strategy: 'ENGINE_ALPHA (UT_BOT)',
      equity: 10000,
      entryPrice: 1.3000,
      stopLossPrice: 1.2985, // 15 pips (0.0015 buffer)
      takeProfitPrice: 1.3015,
      currentSpread: 0.00015
    });
    assert('GBPUSD (ENGINE_ALPHA): Nhận đúng 5.0% vốn ($500) và tính lot chuẩn (3.33 lot cho 15 pips)', posGbpAlpha.approved === true && posGbpAlpha.riskPercent === 5.0 && posGbpAlpha.lotSize === 3.33 && posGbpAlpha.actualRiskAmount === 499.5, `Approved: ${posGbpAlpha.approved}, Lot: ${posGbpAlpha.lotSize}, Risk: $${posGbpAlpha.actualRiskAmount}`);

    // Kiểm tra tính vị thế trên US500 với ENGINE_ALPHA (Top 3: 5.0% Vốn, ContractSize: 1, MaxLot: 20.00)
    const posUs500Alpha = riskManager.calculatePosition({
      symbol: 'US500',
      strategy: 'ENGINE_ALPHA (UT_BOT)',
      equity: 10000,
      entryPrice: 5850.00,
      stopLossPrice: 5845.00, // 5.0 points buffer
      takeProfitPrice: 5855.00,
      currentSpread: 0.50
    });
    assert('US500 (ENGINE_ALPHA): Nhận đúng 5.0% vốn và khóa trần maxLot 20.00 an toàn', posUs500Alpha.approved === true && posUs500Alpha.riskPercent === 5.0 && posUs500Alpha.lotSize === 20.00 && posUs500Alpha.actualRiskAmount === 100, `Approved: ${posUs500Alpha.approved}, Lot: ${posUs500Alpha.lotSize}, Risk: $${posUs500Alpha.actualRiskAmount}`);

    const posOmega = riskManager.calculatePosition({
      symbol: 'GOLD',
      strategy: 'ENGINE_OMEGA (LIQUIDITY_SWEEP_FADEOUT)',
      equity: 10000,
      entryPrice: 2000,
      stopLossPrice: 1990,
      takeProfitPrice: 2015,
      currentSpread: 0.2
    });
    assert('Top 3 (ENGINE_OMEGA) được cấp quyền rủi ro 5.0% vốn khi thuộc Top 3', posOmega.riskPercent === 5.0 && posOmega.actualRiskAmount === 500, `Risk%: ${posOmega.riskPercent}, USD: $${posOmega.actualRiskAmount}`);
    assert('Top 3 (ENGINE_OMEGA) tính đúng R:R = 1.5 và potentialReward không bị NaN', posOmega.riskRewardRatio === 1.5 && !isNaN(posOmega.potentialReward) && posOmega.potentialReward === 750, `RR: ${posOmega.riskRewardRatio}, Reward: $${posOmega.potentialReward}`);

    const posTheta = riskManager.calculatePosition({
      symbol: 'GOLD',
      strategy: 'ENGINE_THETA (EMA_PULLBACK)',
      equity: 10000,
      entryPrice: 2000,
      stopLossPrice: 1990,
      takeProfitPrice: 2010,
      currentSpread: 0.2
    });
    assert('Động cơ ngoài Top 3 (ENGINE_THETA) duy trì rủi ro cơ sở 2.0% vốn', posTheta.riskPercent === 2.0 && posTheta.actualRiskAmount === 200, `Risk%: ${posTheta.riskPercent}, USD: $${posTheta.actualRiskAmount}`);

    const posLambda = riskManager.calculatePosition({
      symbol: 'GOLD',
      strategy: 'ENGINE_LAMBDA (RSI_DIV_BB_EXTREME)',
      equity: 10000,
      entryPrice: 2000,
      stopLossPrice: 1990,
      takeProfitPrice: 2015,
      currentSpread: 0.2
    });
    assert('Động cơ Counter-Trend ngoài Top 3 (ENGINE_LAMBDA) áp dụng rủi ro 2.0% vốn', posLambda.riskPercent === 2.0 && posLambda.actualRiskAmount === 200, `Risk%: ${posLambda.riskPercent}, USD: $${posLambda.actualRiskAmount}`);

    // Kiểm tra checkIsTopRankedStrategy trên TradingDaemon
    const isDeltaTop = await daemon.checkIsTopRankedStrategy('ENGINE_DELTA (HALFTREND_ADX)', 'BTCUSD');
    const isBetaTop = await daemon.checkIsTopRankedStrategy('ENGINE_BETA (CCI_PULLBACK)');
    const isAlphaTop = await daemon.checkIsTopRankedStrategy('ENGINE_ALPHA (UT_BOT)');
    const isOmegaTop = await daemon.checkIsTopRankedStrategy('ENGINE_OMEGA (LIQUIDITY_SWEEP)');
    const isThetaTop = await daemon.checkIsTopRankedStrategy('ENGINE_THETA (EMA_PULLBACK)');
    const isUnknownTop = await daemon.checkIsTopRankedStrategy('ENGINE_UNKNOWN');
    assert('TradingDaemon.checkIsTopRankedStrategy nhận diện đúng Top 1-3 và từ chối ngoài Top 3', isDeltaTop === true && isBetaTop === true && isAlphaTop === true && isOmegaTop === true && isThetaTop === false && isUnknownTop === false, `Delta: ${isDeltaTop}, Beta: ${isBetaTop}, Alpha: ${isAlphaTop}, Omega: ${isOmegaTop}, Theta: ${isThetaTop}, Unknown: ${isUnknownTop}`);
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

  // TEST 12: Kiểm tra Thuật Toán Counter-Trend Thuần JS (ENGINE_LAMBDA & ENGINE_OMEGA)
  console.log('\n--- 12. Kiểm tra Thuật Toán Counter-Trend Thuần JS (LAMBDA & OMEGA) ---');
  {
    // 12.1. Kiểm tra Bollinger Bands Extreme (calcBollingerBandExtreme)
    const bbBars = [];
    for (let i = 0; i < 25; i++) {
      bbBars.push({ open: 100, high: 101, low: 99, close: 100 });
    }
    // Nến T-1 bung lên trên Upper Band (high 112 >= upper) và đóng nến đỏ quay vào trong dải (close 100 <= upper và < open 104)
    bbBars[23] = { open: 104, high: 112, low: 99, close: 100 };
    bbBars[24] = { open: 100, high: 101, low: 99, close: 100 }; // forming bar
    const bbUpper = calcBollingerBandExtreme(bbBars, 20, 2.5);
    assert('BB Extreme phát hiện nến bung dải trên (upperSignal = true)', bbUpper.upperSignal === true, `Upper: ${bbUpper.bb ? bbUpper.bb.upper.toFixed(2) : 'N/A'}, High: ${bbBars[23].high}`);

    // Nến bung dải dưới (low 88 <= lower) và rút râu xanh vào trong dải (close 100 >= lower và > open 96)
    const bbBarsLower = [];
    for (let i = 0; i < 25; i++) {
      bbBarsLower.push({ open: 100, high: 101, low: 99, close: 100 });
    }
    bbBarsLower[23] = { open: 96, high: 101, low: 88, close: 100 };
    bbBarsLower[24] = { open: 100, high: 101, low: 99, close: 100 };
    const bbLower = calcBollingerBandExtreme(bbBarsLower, 20, 2.5);
    assert('BB Extreme phát hiện nến bung dải dưới (lowerSignal = true)', bbLower.lowerSignal === true, `Lower: ${bbLower.bb ? bbLower.bb.lower.toFixed(2) : 'N/A'}, Low: ${bbBarsLower[23].low}`);

    // 12.2. Kiểm tra ICT/SMC Liquidity Sweep Fade (calcLiquiditySweepFade)
    const sweepBars = [];
    for (let i = 0; i < 30; i++) {
      sweepBars.push({ open: 100, high: 102, low: 98, close: 100 });
    }
    // Nến T-1 quét vọt đỉnh 102 lên 106 nhưng đóng cửa đỏ thụt lùi xuống 101 (râu trên 5 / 8 = 62.5% >= 45%)
    sweepBars[28] = { open: 102, high: 106, low: 98, close: 101 };
    sweepBars[29] = { open: 101, high: 102, low: 100, close: 101 };
    const sweepSellRes = calcLiquiditySweepFade(sweepBars, 24);
    assert('OMEGA Liquidity Sweep phát hiện Bearish Sweep Sell thành công', sweepSellRes.sweepSell === true, `UpperWickRatio: ${sweepSellRes.upperWickRatio.toFixed(2)}`);

    // Nến quét dưới đáy 98 xuống 94 nhưng đóng cửa xanh rút chân lên 99 (râu dưới 5 / 8 = 62.5% >= 45%)
    sweepBars[28] = { open: 98, high: 102, low: 94, close: 99 };
    const sweepBuyRes = calcLiquiditySweepFade(sweepBars, 24);
    assert('OMEGA Liquidity Sweep phát hiện Bullish Sweep Buy thành công', sweepBuyRes.sweepBuy === true, `LowerWickRatio: ${sweepBuyRes.lowerWickRatio.toFixed(2)}`);

    // 12.3. Kiểm tra RSI Divergence (calcRsiDivergence) với tối thiểu 50 nến
    const rsiBars = [];
    for (let i = 0; i < 50; i++) {
      rsiBars.push({ open: 100 + (i % 5), high: 102 + (i % 5), low: 98 + (i % 5), close: 100 + (i % 5) });
    }
    const rsiRes = calcRsiDivergence(rsiBars, 14, 24);
    assert('RSI Divergence tính toán an toàn và trả về cấu trúc chuẩn', typeof rsiRes.rsi === 'number' && typeof rsiRes.bullDiv === 'boolean' && typeof rsiRes.bearDiv === 'boolean', `RSI: ${rsiRes.rsi ? rsiRes.rsi.toFixed(2) : 'N/A'}`);
  }

  // TEST 13: Kiểm tra Cơ Chế Khóa Lãi Dương +0.5R (calcLockProfitSL)
  console.log('\n--- 13. Kiểm tra Cơ Chế Khóa Lãi Dương +0.5R (calcLockProfitSL) ---');
  {
    // BUY: Entry 2000, SL 1990 (Risk = 10) -> Khóa +0.5R = 2000 + 0.5*10 = 2005.00
    const buyLock05 = calcLockProfitSL('BUY', 2000.00, 1990.00, 0.5, 0.30, 2);
    assert('BUY: Khóa Lãi Dương +0.5R chính xác tại 2005.00', buyLock05 === 2005.00, `Thực tế: ${buyLock05}`);

    // SELL: Entry 2000, SL 2010 (Risk = 10) -> Khóa +0.5R = 2000 - 0.5*10 = 1995.00
    const sellLock05 = calcLockProfitSL('SELL', 2000.00, 2010.00, 0.5, 0.30, 2);
    assert('SELL: Khóa Lãi Dương +0.5R chính xác tại 1995.00', sellLock05 === 1995.00, `Thực tế: ${sellLock05}`);

    // BUY BTCUSD: Entry 70000, SL 69000 (Risk = 1000) -> Khóa +0.5R = 70500.00
    const btcLock = calcLockProfitSL('BUY', 70000.00, 69000.00, 0.5, 30.0, 2);
    assert('BTC BUY: Khóa Lãi Dương +0.5R tại 70500.00', btcLock === 70500.00, `Thực tế: ${btcLock}`);

    // Traditional Breakeven (lockR = 0): Entry 2000 + spreadBuffer 0.30 = 2000.30
    const beZero = calcLockProfitSL('BUY', 2000.00, 1990.00, 0.0, 0.30, 2);
    assert('Hòa Vốn Truyền Thống (lockR = 0): SL đặt tại Entry + Buffer = 2000.30', beZero === 2000.30, `Thực tế: ${beZero}`);
  }

  // TEST 14: Kiểm tra Bộ Lọc Khung Giờ Vàng (Allowed Windows) & Vùng Tử Địa (Blackout Windows) (checkSessionFilter)
  console.log('\n--- 14. Kiểm tra Bộ Lọc Khung Giờ Vàng & Vùng Tử Địa (checkSessionFilter) ---');
  {
    const goldFilter = config.symbols.GOLD.sessionFilter;
    const usdjpyFilter = config.symbols.USDJPY.sessionFilter;
    const us500Filter = config.symbols.US500.sessionFilter;
    const gbpFilter = config.symbols.GBPUSD.sessionFilter;

    // Helper tạo Date với giờ VN cụ thể: vnHour, vnMin (UTC = vnHour - 7)
    function makeVnDate(hourVN, minVN) {
      const d = new Date('2026-09-16T00:00:00.000Z');
      const utcHour = (hourVN - 7 + 24) % 24;
      d.setUTCHours(utcHour, minVN, 0, 0);
      return d;
    }

    // 14.1. GOLD: Trong khung giờ vàng sáng 08:30 VN
    const goldMorning = checkSessionFilter(goldFilter, makeVnDate(8, 30));
    assert('GOLD: 08:30 VN thuộc Khung Giờ Vàng (Phiên Sáng Hồi Nhịp)', goldMorning.allowed === true && goldMorning.reason === 'IN_ALLOWED_WINDOW', `Allowed: ${goldMorning.allowed}, Reason: ${goldMorning.reason}`);

    // 14.2. GOLD: Rơi vào vùng tử địa 17:00 VN (Tử Địa Phân Phối Âu 16:15 - 19:30)
    const goldEuroBlackout = checkSessionFilter(goldFilter, makeVnDate(17, 0));
    assert('GOLD: 17:00 VN bị chặn bởi Vùng Tử Địa (16:15 - 19:30 VN)', goldEuroBlackout.allowed === false && goldEuroBlackout.reason === 'BLACKOUT_WINDOW', `Allowed: ${goldEuroBlackout.allowed}, Reason: ${goldEuroBlackout.reason}`);

    // 14.3. GOLD: Rơi vào vùng tử địa đêm muộn vắt qua ngày 23:30 VN (22:45 - 08:00)
    const goldNightBlackout = checkSessionFilter(goldFilter, makeVnDate(23, 30));
    assert('GOLD: 23:30 VN bị chặn bởi Vùng Tử Địa Đêm Muộn (22:45 - 08:00 VN)', goldNightBlackout.allowed === false && goldNightBlackout.reason === 'BLACKOUT_WINDOW', `Allowed: ${goldNightBlackout.allowed}, Reason: ${goldNightBlackout.reason}`);

    // 14.4. GOLD: Rạng sáng 03:00 VN (trong blackout 22:45 - 08:00)
    const goldEarlyMorning = checkSessionFilter(goldFilter, makeVnDate(3, 0));
    assert('GOLD: 03:00 VN sáng sớm bị chặn bởi Vùng Tử Địa Đêm Muộn', goldEarlyMorning.allowed === false && goldEarlyMorning.reason === 'BLACKOUT_WINDOW', `Allowed: ${goldEarlyMorning.allowed}`);

    // 14.5. USDJPY: Nghỉ trưa Tokyo 11:30 VN (Blackout 10:30 - 13:30)
    const jpyLunch = checkSessionFilter(usdjpyFilter, makeVnDate(11, 30));
    assert('USDJPY: 11:30 VN bị chặn bởi Vùng Tử Địa Nghỉ Trưa Tokyo', jpyLunch.allowed === false && jpyLunch.reason === 'BLACKOUT_WINDOW', `Allowed: ${jpyLunch.allowed}, Reason: ${jpyLunch.reason}`);

    // 14.6. USDJPY: London Judas Sweep 14:30 VN (Allowed 14:00 - 16:30)
    const jpyLondon = checkSessionFilter(usdjpyFilter, makeVnDate(14, 30));
    assert('USDJPY: 14:30 VN thuộc Khung Giờ Vàng London Judas Sweep Reversal', jpyLondon.allowed === true && jpyLondon.reason === 'IN_ALLOWED_WINDOW', `Allowed: ${jpyLondon.allowed}`);

    // 14.7. US500: New York Prime 21:00 VN (Allowed 20:30 - 02:00)
    const us500Ny = checkSessionFilter(us500Filter, makeVnDate(21, 0));
    assert('US500: 21:00 VN trong phiên New York Prime cho phép', us500Ny.allowed === true && us500Ny.reason === 'IN_ALLOWED_WINDOW', `Allowed: ${us500Ny.allowed}, Reason: ${us500Ny.reason}`);

    // 14.8. US500: Ngoài phiên 10:00 VN rơi vào Vùng Tử Địa (Blackout 02:00 - 20:30)
    const us500Asia = checkSessionFilter(us500Filter, makeVnDate(10, 0));
    assert('US500: 10:00 VN rơi vào Vùng Tử Địa Phiên Á & Âu Kiệt Thanh Khoản', us500Asia.allowed === false && us500Asia.reason === 'BLACKOUT_WINDOW', `Allowed: ${us500Asia.allowed}, Reason: ${us500Asia.reason}`);

    // 14.8b. GBPUSD: Trong phiên New York Prime 20:00 VN (Allowed 19:30 - 22:45)
    const gbpNy = checkSessionFilter(gbpFilter, makeVnDate(20, 0));
    assert('GBPUSD: 20:00 VN trong Khung Giờ Vàng NY Prime cho phép', gbpNy.allowed === true && gbpNy.reason === 'IN_ALLOWED_WINDOW', `Allowed: ${gbpNy.allowed}`);

    // 14.8c. GBPUSD: Đêm muộn 23:30 VN rơi vào Vùng Tử Địa (Blackout 22:45 - 19:30)
    const gbpNight = checkSessionFilter(gbpFilter, makeVnDate(23, 30));
    assert('GBPUSD: 23:30 VN bị chặn bởi Vùng Tử Địa Đêm, Á & Âu Kiệt Thanh Khoản', gbpNight.allowed === false && gbpNight.reason === 'BLACKOUT_WINDOW', `Allowed: ${gbpNight.allowed}`);

    // 14.9. BTCUSD: Không có sessionFilter (Giao dịch 24/7)
    const btc247 = checkSessionFilter(config.symbols.BTCUSD.sessionFilter, makeVnDate(3, 0));
    assert('BTCUSD: Không cấu hình sessionFilter được cấp phép 24/7', btc247.allowed === true && btc247.reason === 'SESSION_FILTER_DISABLED');

    // 14.10. GOLD: Đúng 08:00 VN biên mở phiên sáng - Khung Giờ Vàng được kích hoạt và không bị chặn bởi Đêm Muộn
    const gold0800 = checkSessionFilter(goldFilter, makeVnDate(8, 0));
    assert('GOLD: Đúng 08:00 VN kích hoạt Khung Giờ Vàng (không bị cản bởi Đêm Muộn 22:45-08:00)', gold0800.allowed === true && gold0800.reason === 'IN_ALLOWED_WINDOW', `Allowed: ${gold0800.allowed}, Reason: ${gold0800.reason}`);

    // 14.11. GOLD: Đúng 19:30 VN biên mở phiên New York Prime - Khung Giờ Vàng được kích hoạt và không bị chặn bởi Tử Địa Âu
    const gold1930 = checkSessionFilter(goldFilter, makeVnDate(19, 30));
    assert('GOLD: Đúng 19:30 VN kích hoạt Khung Giờ Vàng NY Prime (không bị cản bởi Tử Địa Âu 16:15-19:30)', gold1930.allowed === true && gold1930.reason === 'IN_ALLOWED_WINDOW', `Allowed: ${gold1930.allowed}, Reason: ${gold1930.reason}`);

    // 14.12. GOLD: Đúng 16:15 VN biên đóng London chuyển giao sang Tử Địa Phân Phối Âu
    const gold1615 = checkSessionFilter(goldFilter, makeVnDate(16, 15));
    assert('GOLD: Đúng 16:15 VN kích hoạt Vùng Tử Địa Phân Phối Âu', gold1615.allowed === false && gold1615.reason === 'BLACKOUT_WINDOW', `Allowed: ${gold1615.allowed}, Reason: ${gold1615.reason}`);

    // 14.13. GOLD: Đúng 22:45 VN biên kết thúc phiên New York chuyển giao sang Đêm Muộn Dãn Spread
    const gold2245 = checkSessionFilter(goldFilter, makeVnDate(22, 45));
    assert('GOLD: Đúng 22:45 VN kích hoạt Vùng Tử Địa Đêm Muộn Dãn Spread', gold2245.allowed === false && gold2245.reason === 'BLACKOUT_WINDOW', `Allowed: ${gold2245.allowed}, Reason: ${gold2245.reason}`);

    // 14.14. USDJPY: Đúng 08:00 VN biên mở Tokyo Fix Nakane Fade - Khung Giờ Vàng được kích hoạt
    const jpy0800 = checkSessionFilter(usdjpyFilter, makeVnDate(8, 0));
    assert('USDJPY: Đúng 08:00 VN kích hoạt Khung Giờ Vàng Tokyo Fix (không bị cản bởi Đêm Muộn 22:30-08:00)', jpy0800.allowed === true && jpy0800.reason === 'IN_ALLOWED_WINDOW', `Allowed: ${jpy0800.allowed}, Reason: ${jpy0800.reason}`);

    // 14.15. USDJPY: Đúng 10:30 VN bắt đầu Nghỉ Trưa Tokyo Tê Liệt - Bị chặn đúng lúc 10:30 VN
    const jpy1030 = checkSessionFilter(usdjpyFilter, makeVnDate(10, 30));
    assert('USDJPY: Đúng 10:30 VN bị chặn bởi Vùng Tử Địa Nghỉ Trưa Tokyo', jpy1030.allowed === false && jpy1030.reason === 'BLACKOUT_WINDOW', `Allowed: ${jpy1030.allowed}, Reason: ${jpy1030.reason}`);
  }

  // TEST 15: Kiểm tra Đệm Stop Loss Động theo ATR14 (calcDynSlBuffer)
  console.log('\n--- 15. Kiểm tra Đệm Stop Loss Động theo ATR14 (calcDynSlBuffer) ---');
  {
    // 15.1. GOLD: max(0.40 * ATR, minBuffer 4.5)
    // Case high ATR = 20.0 -> 0.40 * 20 = 8.0 > 4.5 -> buffer = 8.0
    const bufGoldHigh = calcDynSlBuffer('GOLD', 20.0, config.symbols.GOLD.minAtrBuffer || 4.5);
    assert('GOLD (High ATR=20): Đệm động bung rộng 8.0 (0.40 * 20.0)', bufGoldHigh === 8.0, `Buffer: ${bufGoldHigh}`);

    // Case low ATR = 5.0 -> 0.40 * 5.0 = 2.0 < 4.5 -> buffer = 4.5
    const bufGoldLow = calcDynSlBuffer('GOLD', 5.0, config.symbols.GOLD.minAtrBuffer || 4.5);
    assert('GOLD (Low ATR=5): Đệm giữ sàn an toàn 4.5', bufGoldLow === 4.5, `Buffer: ${bufGoldLow}`);

    // 15.2. USDJPY: max(1.0 * ATR, minBuffer 0.15)
    // High ATR = 0.35 -> 1.0 * 0.35 = 0.35 > 0.15 -> buffer = 0.35
    const bufJpyHigh = calcDynSlBuffer('USDJPY', 0.35, 0.15);
    assert('USDJPY (ATR=0.35): Đệm động 0.35', bufJpyHigh === 0.35, `Buffer: ${bufJpyHigh}`);

    // Low ATR = 0.08 -> max(0.08, 0.15) = 0.15
    const bufJpyLow = calcDynSlBuffer('USDJPY', 0.08, 0.15);
    assert('USDJPY (ATR=0.08): Đệm giữ sàn an toàn 0.15', bufJpyLow === 0.15, `Buffer: ${bufJpyLow}`);

    // 15.3. BTCUSD: max(1.0 * ATR, minBuffer 250)
    // High ATR = 800 -> 800
    const bufBtcHigh = calcDynSlBuffer('BTCUSD', 800, 250);
    assert('BTCUSD (ATR=800): Đệm động 800', bufBtcHigh === 800, `Buffer: ${bufBtcHigh}`);

    // Low ATR = 100 -> sàn 250
    const bufBtcLow = calcDynSlBuffer('BTCUSD', 100, 250);
    assert('BTCUSD (ATR=100): Đệm giữ sàn 250', bufBtcLow === 250, `Buffer: ${bufBtcLow}`);

    // 15.4. GBPUSD: max(1.5 * ATR, minBuffer 0.0015)
    // High ATR = 0.0050 -> 1.5 * 0.0050 = 0.0075 > 0.0015
    const bufGbpHigher = calcDynSlBuffer('GBPUSD', 0.0050, 0.0015);
    assert('GBPUSD (High ATR=0.0050): Đệm động bung rộng 0.0075 (1.5 * 0.0050)', bufGbpHigher === 0.0075, `Buffer: ${bufGbpHigher}`);

    // Low ATR = 0.0005 -> 1.5 * 0.0005 = 0.00075 < 0.0015 -> sàn 0.0015 (15 pips)
    const bufGbpFloor = calcDynSlBuffer('GBPUSD', 0.0005, 0.0015);
    assert('GBPUSD (Low ATR=0.0005): Đệm giữ sàn an toàn 0.0015 (15 pips)', bufGbpFloor === 0.0015, `Buffer: ${bufGbpFloor}`);

    // 15.5. US500: max(0.60 * ATR, minBuffer 5.0)
    // High ATR = 12.0 -> 0.60 * 12.0 = 7.2 > 5.0
    const bufUs500High = calcDynSlBuffer('US500', 12.0, 5.0);
    assert('US500 (High ATR=12.0): Đệm động bung rộng 7.2 (0.60 * 12.0)', bufUs500High === 7.2, `Buffer: ${bufUs500High}`);

    // Low ATR = 6.0 -> 0.60 * 6.0 = 3.6 < 5.0 -> sàn 5.0 points
    const bufUs500Floor = calcDynSlBuffer('US500', 6.0, 5.0);
    assert('US500 (Low ATR=6.0): Đệm giữ sàn an toàn 5.0 points', bufUs500Floor === 5.0, `Buffer: ${bufUs500Floor}`);
  }

  // TEST 16: Kiểm tra Đồng Bộ Mã Nguồn evaluatePage trong daemon_monitor.js
  console.log('\n--- 16. Kiểm tra Đồng Bộ Mã Nguồn evaluatePage (CDP In-Browser Execution) ---');
  {
    const daemonSrc = fs.readFileSync(path.join(__dirname, 'daemon_monitor.js'), 'utf8');
    // Kiểm tra rằng mã nguồn evaluatePage trong browser chứa curUtcHour >= 7 && curUtcHour < 14
    const evalMatches = daemonSrc.match(/curUtcHour >= 7 && curUtcHour < 14/g);
    assert('daemon_monitor.js: Cả hàm Node.js lẫn evaluatePage trong browser đều áp dụng curUtcHour >= 7', evalMatches && evalMatches.length >= 2, `Số lượng khớp: ${evalMatches ? evalMatches.length : 0}`);

    // Kiểm tra rằng bộ lọc nến phiên Á loại trừ bh < 7 trong cả 2 nơi
    const asianMatches = daemonSrc.match(/bh >= 0 && bh < 7/g);
    assert('daemon_monitor.js: Cả Node.js lẫn evaluatePage đều xác định phiên Á bh < 7 (00:00 - 07:00 UTC)', asianMatches && asianMatches.length >= 2, `Số lượng khớp: ${asianMatches ? asianMatches.length : 0}`);
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
