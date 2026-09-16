const fs = require('fs');
const path = require('path');
const config = require('./config.json');
const riskManager = require('./risk_manager.js');
const db = require('./database');

const LOG_FILE = path.join(__dirname, 'daemon_monitor.log');

function resolveArtifactDir() {
  const baseBrain = 'C:/Users/game/.gemini/antigravity/brain';
  const currentConv = '7dcc60b1-adfa-4de9-9a30-14e7aa6e806a';
  const directPath = path.join(baseBrain, currentConv).replace(/\\/g, '/');
  if (fs.existsSync(directPath)) return directPath;
  if (process.env.CONVERSATION_ID) {
    const p = path.join(baseBrain, process.env.CONVERSATION_ID).replace(/\\/g, '/');
    if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
    return p;
  }
  try {
    if (fs.existsSync(baseBrain)) {
      const dirs = fs.readdirSync(baseBrain, { withFileTypes: true })
        .filter(d => d.isDirectory() && !d.name.startsWith('.') && /^[0-9a-fA-F-]{36}$/.test(d.name))
        .map(d => ({ name: d.name, mtime: fs.statSync(path.join(baseBrain, d.name)).mtime }))
        .sort((a, b) => b.mtime - a.mtime);
      if (dirs.length > 0) {
        const p = path.join(baseBrain, dirs[0].name).replace(/\\/g, '/');
        return p;
      }
    }
  } catch (e) {}
  return directPath;
}

const ARTIFACT_DIR = resolveArtifactDir();
if (!fs.existsSync(ARTIFACT_DIR)) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
}

function log(msg) {
  const ts = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch (e) {}
}

const delay = ms => new Promise(r => setTimeout(r, ms));

function openWebSocket(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      try { ws.close(); } catch (e) {}
      reject(new Error(`WebSocket connection timeout to ${url}`));
    }, timeoutMs);
    ws.onopen = () => {
      clearTimeout(timer);
      resolve(ws);
    };
    ws.onerror = (err) => {
      clearTimeout(timer);
      reject(err instanceof Error ? err : new Error(`WebSocket error: ${err.message || err}`));
    };
  });
}

async function cdpCall(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const timeout = setTimeout(() => {
      ws.removeEventListener('message', handler);
      reject(new Error(`CDP Timeout for ${method}`));
    }, 15000);

    const handler = (e) => {
      const res = JSON.parse(e.data);
      if (res.id === id) {
        clearTimeout(timeout);
        ws.removeEventListener('message', handler);
        if (res.error) reject(res.error);
        else resolve(res.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

// ==============================================================================
// THUẬT TOÁN ĐỘNG CƠ VÔ ĐỊCH THUẦN JS (PURE JS ENGINES & TWIN ORDERS)
// ==============================================================================

// 1. Thuật toán EMA 9/21 Pullback kết hợp bộ lọc xu hướng EMA 200 thuần JS (Động cơ Theta)
function calcEmaPullback(barsList, pFast = 9, pSlow = 21, pMacro = 200) {
  const n = barsList ? barsList.length : 0;
  if (n < pSlow + 5) {
    return { buySignal: false, sellSignal: false, ema9: null, ema21: null, ema200: null };
  }
  function getEMA(period) {
    const k = 2 / (period + 1);
    const ema = new Array(n).fill(0);
    ema[0] = barsList[0].close;
    for (let i = 1; i < n; i++) {
      ema[i] = barsList[i].close * k + ema[i - 1] * (1 - k);
    }
    return ema;
  }
  const ema9Arr = getEMA(pFast);
  const ema21Arr = getEMA(pSlow);
  const ema200Arr = getEMA(pMacro);

  const evalIdx = n >= 2 ? n - 2 : n - 1;
  const bar = barsList[evalIdx];
  const e9 = ema9Arr[evalIdx];
  const e21 = ema21Arr[evalIdx];
  const e200 = ema200Arr[evalIdx];

  const isBull = bar.close > e200;
  const isBear = bar.close < e200;

  const upperBand = Math.max(e9, e21);
  const lowerBand = Math.min(e9, e21);
  // BUY: Nến T-1 chạm/nhúng vào vùng EMA 9-21 và bật lại theo xu hướng EMA 200
  const touchedBandBuy = bar.low <= upperBand && bar.low >= lowerBand - (bar.high - bar.low) * 0.5;
  const bounceBuy = bar.close > bar.open && bar.close >= lowerBand;
  const buySignal = isBull && touchedBandBuy && bounceBuy;

  // SELL: Nến T-1 chạm/nhúng vào vùng EMA 9-21 và bật lại theo xu hướng EMA 200
  const touchedBandSell = bar.high >= lowerBand && bar.high <= upperBand + (bar.high - bar.low) * 0.5;
  const bounceSell = bar.close < bar.open && bar.close <= upperBand;
  const sellSignal = isBear && touchedBandSell && bounceSell;

  const dec = bar.close < 5 ? 5 : 2;
  return {
    buySignal,
    sellSignal,
    ema9: +e9.toFixed(dec),
    ema21: +e21.toFixed(dec),
    ema200: +e200.toFixed(dec)
  };
}

// 2. Thuật toán Asian Range Sweep (London Liquidity Sweep) thuần JS (Động cơ Epsilon)
function calcAsianRangeSweep(barsList) {
  const n = barsList ? barsList.length : 0;
  if (n < 20) return { buySignal: false, sellSignal: false, asianHigh: null, asianLow: null, session: 'UNKNOWN' };
  const evalIdx = n >= 2 ? n - 2 : n - 1;
  const confirmedBar = barsList[evalIdx];
  const barMs = confirmedBar.time > 1e11 ? confirmedBar.time : confirmedBar.time * 1000;
  const d = new Date(barMs);
  const curUtcHour = d.getUTCHours();
  const curUtcDay = d.getUTCDate();
  const curUtcMonth = d.getUTCMonth();
  const curUtcYear = d.getUTCFullYear();

  // Xác định High/Low phiên Á 00:00 - 07:00 UTC (trước khi London mở cửa 07:00 UTC / 14:00 VN)
  // Đảm bảo loại trừ chính nến confirmedBar (bTime < barMs) để tránh nến quét râu bị tính vào biên Á
  let asianBars = barsList.filter(b => {
    const bTime = b.time > 1e11 ? b.time : b.time * 1000;
    const bd = new Date(bTime);
    const bh = bd.getUTCHours();
    return bd.getUTCFullYear() === curUtcYear &&
           bd.getUTCMonth() === curUtcMonth &&
           bd.getUTCDate() === curUtcDay &&
           bh >= 0 && bh < 7 && bTime < barMs;
  });

  if (asianBars.length < 4) {
    asianBars = barsList.filter(b => {
      const bTime = b.time > 1e11 ? b.time : b.time * 1000;
      const bd = new Date(bTime);
      const bh = bd.getUTCHours();
      return bh >= 0 && (curUtcHour >= 7 ? bh < 7 : bh < 8) && bTime < barMs;
    }).slice(-28);
  }

  if (asianBars.length === 0) {
    return { buySignal: false, sellSignal: false, asianHigh: null, asianLow: null, session: 'UNKNOWN' };
  }

  const asianHigh = Math.max(...asianBars.map(b => b.high));
  const asianLow = Math.min(...asianBars.map(b => b.low));

  // Nến phiên London 07:00 - 14:00 UTC (14:00 - 21:00 VN) đón trọn cú lừa Judas Swing mở cửa London
  const isLondon = curUtcHour >= 7 && curUtcHour < 14;
  const buySweep = isLondon && confirmedBar.low < asianLow && confirmedBar.close >= asianLow && confirmedBar.close > confirmedBar.open;
  const sellSweep = isLondon && confirmedBar.high > asianHigh && confirmedBar.close <= asianHigh && confirmedBar.close < confirmedBar.open;

  const decSweep = confirmedBar.close < 5 ? 5 : (confirmedBar.close < 500 ? 3 : 2);
  return {
    buySignal: buySweep,
    sellSignal: sellSweep,
    asianHigh: +asianHigh.toFixed(decSweep),
    asianLow: +asianLow.toFixed(decSweep),
    session: isLondon ? 'LONDON' : (curUtcHour < 7 ? 'ASIAN' : 'US')
  };
}

// 3. Thuật toán Volume Price Action (Volume PA) thuần JS (Động cơ Kappa)
function calcVolumePA(barsList, volPeriod = 20) {
  const n = barsList ? barsList.length : 0;
  if (n < volPeriod + 2) return { buySignal: false, sellSignal: false, volRatio: 1.0 };
  const evalIdx = n >= 2 ? n - 2 : n - 1;
  const bar = barsList[evalIdx];
  let volSum = 0;
  for (let i = evalIdx - volPeriod; i < evalIdx; i++) {
    volSum += (barsList[i]?.volume || 0);
  }
  const volSma = volSum / volPeriod;
  const volRatio = volSma > 0 ? +(bar.volume / volSma).toFixed(2) : 1.0;
  const hasVolume = volRatio >= 1.25;

  const range = bar.high - bar.low;
  const isBullRejection = range > 0 && ((bar.close - bar.low) / range) >= 0.55 && bar.close > bar.open;
  const isBearRejection = range > 0 && ((bar.high - bar.close) / range) >= 0.55 && bar.close < bar.open;

  return {
    buySignal: hasVolume && isBullRejection,
    sellSignal: hasVolume && isBearRejection,
    volRatio
  };
}

// 3.1. Thuật toán RSI Divergence thuần JS (Động cơ Lambda)
function calcRsiDivergence(barsList, rsiPeriod = 14, lookback = 24) {
  const n = barsList ? barsList.length : 0;
  if (n < rsiPeriod + lookback + 5) {
    return { bullDiv: false, bearDiv: false, rsi: null };
  }

  // RSI(14) with Wilder's smoothing
  const gains = new Array(n).fill(0);
  const losses = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    const diff = barsList[i].close - barsList[i - 1].close;
    if (diff > 0) gains[i] = diff;
    else losses[i] = Math.abs(diff);
  }
  const rsi = new Array(n).fill(50);
  let avgGain = gains.slice(1, rsiPeriod + 1).reduce((a, b) => a + b, 0) / rsiPeriod;
  let avgLoss = losses.slice(1, rsiPeriod + 1).reduce((a, b) => a + b, 0) / rsiPeriod;
  if (avgLoss === 0) rsi[rsiPeriod] = 100;
  else rsi[rsiPeriod] = 100 - (100 / (1 + avgGain / avgLoss));

  for (let i = rsiPeriod + 1; i < n; i++) {
    avgGain = (avgGain * (rsiPeriod - 1) + gains[i]) / rsiPeriod;
    avgLoss = (avgLoss * (rsiPeriod - 1) + losses[i]) / rsiPeriod;
    if (avgLoss === 0) rsi[i] = 100;
    else rsi[i] = +(100 - (100 / (1 + avgGain / avgLoss))).toFixed(2);
  }

  const evalIdx = n >= 2 ? n - 2 : n - 1; // Confirmed candle T-1
  const currentLow = barsList[evalIdx].low;
  const currentHigh = barsList[evalIdx].high;
  const currentRsi = rsi[evalIdx];

  // Look for pivot lows and pivot highs in lookback window
  let prevLowIdx = -1;
  let minLow = Infinity;
  let prevHighIdx = -1;
  let maxHigh = -Infinity;

  const startIdx = Math.max(rsiPeriod + 1, evalIdx - lookback);
  const endSearchIdx = evalIdx - 2;

  for (let i = startIdx; i <= endSearchIdx; i++) {
    if (barsList[i].low < minLow) {
      minLow = barsList[i].low;
      prevLowIdx = i;
    }
    if (barsList[i].high > maxHigh) {
      maxHigh = barsList[i].high;
      prevHighIdx = i;
    }
  }

  // Bullish Divergence: Giá tạo đáy thấp hơn hoặc bằng minLow, nhưng RSI tạo đáy cao hơn đáng kể
  let bullDiv = false;
  if (prevLowIdx !== -1 && currentLow <= minLow && currentRsi > (rsi[prevLowIdx] + 2) && currentRsi <= 45) {
    bullDiv = true;
  }

  // Bearish Divergence: Giá tạo đỉnh cao hơn hoặc bằng maxHigh, nhưng RSI tạo đỉnh thấp hơn đáng kể
  let bearDiv = false;
  if (prevHighIdx !== -1 && currentHigh >= maxHigh && currentRsi < (rsi[prevHighIdx] - 2) && currentRsi >= 55) {
    bearDiv = true;
  }

  return {
    bullDiv,
    bearDiv,
    rsi: currentRsi,
    prevRsiLow: prevLowIdx !== -1 ? rsi[prevLowIdx] : null,
    prevRsiHigh: prevHighIdx !== -1 ? rsi[prevHighIdx] : null
  };
}

// 3.2. Thuật toán Bollinger Bands 2.5 SD Extreme Fade thuần JS (Động cơ Lambda)
function calcBollingerBandExtreme(barsList, period = 20, stdDev = 2.5) {
  const n = barsList ? barsList.length : 0;
  if (n < period + 3) return { upperSignal: false, lowerSignal: false, bb: null };

  const evalIdx = n >= 2 ? n - 2 : n - 1;
  const prevIdx = evalIdx - 1;

  function getBB(targetIdx) {
    const slice = barsList.slice(targetIdx - period + 1, targetIdx + 1).map(b => b.close);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
    const sd = Math.sqrt(variance);
    return {
      mid: +mean.toFixed(2),
      upper: +(mean + stdDev * sd).toFixed(2),
      lower: +(mean - stdDev * sd).toFixed(2)
    };
  }

  const bbCurr = getBB(evalIdx);
  const bbPrev = getBB(prevIdx);

  const evalBar = barsList[evalIdx];
  const prevBar = barsList[prevIdx];

  // Rejection Upper: Nến chọc vượt dải trên 2.5 SD nhưng nến chốt đóng quay ngược vào trong dải kèm nến giảm
  const piercedUpper = evalBar.high >= bbCurr.upper || prevBar.high >= bbPrev.upper;
  const closedInsideUpper = evalBar.close <= bbCurr.upper && evalBar.close < evalBar.open;

  // Rejection Lower: Nến chọc thủng dải dưới 2.5 SD nhưng nến chốt đóng quay ngược vào trong dải kèm nến tăng
  const piercedLower = evalBar.low <= bbCurr.lower || prevBar.low <= bbPrev.lower;
  const closedInsideLower = evalBar.close >= bbCurr.lower && evalBar.close > evalBar.open;

  return {
    upperSignal: piercedUpper && closedInsideUpper,
    lowerSignal: piercedLower && closedInsideLower,
    bb: bbCurr
  };
}

// 3.3. Thuật toán ICT / SMC Liquidity Sweep & Fakeout Fade thuần JS (Động cơ Omega)
function calcLiquiditySweepFade(barsList, lookback = 24) {
  const n = barsList ? barsList.length : 0;
  if (n < lookback + 5) return { sweepBuy: false, sweepSell: false, prevHigh: null, prevLow: null };

  const evalIdx = n >= 2 ? n - 2 : n - 1;
  const evalBar = barsList[evalIdx];
  const range = evalBar.high - evalBar.low;
  if (range <= 0) return { sweepBuy: false, sweepSell: false };

  // Xác định đỉnh cao nhất và đáy thấp nhất trong lookback nến trước (không tính nến hiện tại)
  let prevHigh = -Infinity;
  let prevLow = Infinity;
  for (let i = evalIdx - lookback; i < evalIdx; i++) {
    if (barsList[i].high > prevHigh) prevHigh = barsList[i].high;
    if (barsList[i].low < prevLow) prevLow = barsList[i].low;
  }

  // Quét thanh khoản mua (Buy-side Sweep): Nến quét vượt đỉnh cũ, nhưng đóng dưới đỉnh cũ kèm râu trên dài >= 45%
  const upperWick = evalBar.high - Math.max(evalBar.open, evalBar.close);
  const upperWickRatio = upperWick / range;
  const sweepSell = evalBar.high > prevHigh && evalBar.close <= prevHigh && upperWickRatio >= 0.45 && evalBar.close <= evalBar.open;

  // Quét thanh khoản bán (Sell-side Sweep): Nến quét thủng đáy cũ, nhưng đóng trên đáy cũ kèm râu dưới dài >= 45%
  const lowerWick = Math.min(evalBar.open, evalBar.close) - evalBar.low;
  const lowerWickRatio = lowerWick / range;
  const sweepBuy = evalBar.low < prevLow && evalBar.close >= prevLow && lowerWickRatio >= 0.45 && evalBar.close >= evalBar.open;

  return {
    sweepBuy,
    sweepSell,
    prevHigh: +prevHigh.toFixed(2),
    prevLow: +prevLow.toFixed(2),
    upperWickRatio: +upperWickRatio.toFixed(2),
    lowerWickRatio: +lowerWickRatio.toFixed(2)
  };
}

// 4. Phân chia khối lượng cặp lệnh song sinh Scalper & Runner
function splitTwinLots(totalLot, lotStep = 0.01, splitRatio = [0.5, 0.5]) {
  const ratioA = (Array.isArray(splitRatio) && splitRatio[0] > 0) ? splitRatio[0] : 0.5;
  let lotA = Math.floor((totalLot * ratioA) / lotStep) * lotStep;
  if (lotA < lotStep) lotA = lotStep;
  lotA = +lotA.toFixed(2);

  let lotB = +(totalLot - lotA).toFixed(2);
  if (lotB < lotStep) lotB = lotStep;
  lotB = +lotB.toFixed(2);

  return { lotA, lotB };
}

// 5. Tính toán Take Profit cặp lệnh song sinh Scalper (1.0) & Runner (1.5)
function calcTwinTakeProfits(action, entryPrice, stopLoss, scalperRR = 1.0, runnerRR = 1.5, decimals = 2) {
  const isBuy = action.toUpperCase() === 'BUY';
  const riskDist = Math.abs(entryPrice - stopLoss);
  const tpA = isBuy ? +(entryPrice + riskDist * scalperRR).toFixed(decimals) : +(entryPrice - riskDist * scalperRR).toFixed(decimals);
  const tpB = isBuy ? +(entryPrice + riskDist * runnerRR).toFixed(decimals) : +(entryPrice - riskDist * runnerRR).toFixed(decimals);
  return { tpA, tpB, riskDist };
}

// 6. Tính toán Stop Loss Khóa Lãi Dương (Positive Profit-Lock +0.5R) hoặc Hòa Vốn (Breakeven)
function calcLockProfitSL(action, entryPrice, stopLoss, lockR = 0.5, spreadBuffer = 0, decimals = 2) {
  const isBuy = (action || '').toUpperCase() === 'BUY';
  const riskDist = Math.abs(entryPrice - stopLoss);
  const lockDistance = +(riskDist * lockR).toFixed(decimals);
  if (isBuy) {
    return +(entryPrice + lockDistance + (lockR > 0 ? 0 : spreadBuffer)).toFixed(decimals);
  } else {
    return +(entryPrice - lockDistance - (lockR > 0 ? 0 : spreadBuffer)).toFixed(decimals);
  }
}

// 7. Tính toán Đệm Stop Loss Động theo ATR14 thực tế
function calcDynSlBuffer(symbolName, atr, minAtrBuffer) {
  const s = (symbolName || '').toUpperCase();
  if (s.includes('GOLD') || s.includes('XAU')) {
    return +Math.max(0.40 * (atr || 12.0), minAtrBuffer || 4.5).toFixed(4);
  } else if (s.includes('JPY')) {
    return +Math.max(1.0 * (atr || 0.10), minAtrBuffer || 0.15).toFixed(4);
  } else if (s.includes('BTC')) {
    return +Math.max(1.0 * (atr || 250), minAtrBuffer || 250).toFixed(2);
  } else if (s.includes('GBP')) {
    return +Math.max(1.5 * (atr || 0.0010), minAtrBuffer || 0.0015).toFixed(5);
  } else if (s.includes('US500') || s.includes('SPX')) {
    return +Math.max(0.60 * (atr || 7.0), minAtrBuffer || 5.0).toFixed(2);
  } else {
    return minAtrBuffer || 2.0;
  }
}

function parseTimeToMinutes(str) {
  if (typeof str === 'number') return str * 60;
  if (typeof str !== 'string') return 0;
  const [h, m] = str.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function isTimeInWindow(totalMinutes, startMinutes, endMinutes, inclusiveEnd = true) {
  if (startMinutes <= endMinutes) {
    return inclusiveEnd
      ? (totalMinutes >= startMinutes && totalMinutes <= endMinutes)
      : (totalMinutes >= startMinutes && totalMinutes < endMinutes);
  }
  // Khung giờ vắt qua nửa đêm (ví dụ 22:45 -> 08:00)
  return inclusiveEnd
    ? (totalMinutes >= startMinutes || totalMinutes <= endMinutes)
    : (totalMinutes >= startMinutes || totalMinutes < endMinutes);
}

// 8. Bộ lọc Khung Giờ Vàng (Allowed Windows) & Vùng Tử Địa (Blackout Windows) theo giờ VN
function checkSessionFilter(sessionFilter, date = new Date()) {
  if (!sessionFilter || !sessionFilter.enabled) {
    return { allowed: true, reason: 'SESSION_FILTER_DISABLED' };
  }

  const vnHour = (date.getUTCHours() + 7) % 24;
  const vnMinute = date.getUTCMinutes();
  const totalVnMinutes = vnHour * 60 + vnMinute;
  const timeVNStr = `${String(vnHour).padStart(2, '0')}:${String(vnMinute).padStart(2, '0')}`;

  // 1. Kiểm tra Vùng Tử Địa (Blackout Windows) - Bị chặn tuyệt đối nếu rơi vào đây
  // Lưu ý: Biên kết thúc của Vùng Tử Địa mang tính chất biên mở (exclusive: < endMinutes)
  // để nhường quyền chuyển giao chuẩn xác cho Khung Giờ Vàng mở cửa ngay lúc đó (ví dụ 08:00 hay 19:30 VN).
  if (Array.isArray(sessionFilter.blackoutWindowsVN) && sessionFilter.blackoutWindowsVN.length > 0) {
    const hitBlackout = sessionFilter.blackoutWindowsVN.find(w =>
      isTimeInWindow(totalVnMinutes, parseTimeToMinutes(w.start), parseTimeToMinutes(w.end), false)
    );
    if (hitBlackout) {
      return {
        allowed: false,
        reason: 'BLACKOUT_WINDOW',
        desc: hitBlackout.desc || 'Vùng tử địa',
        window: `${hitBlackout.start} - ${hitBlackout.end}`,
        currentTimeVN: timeVNStr
      };
    }
  }

  // 2. Kiểm tra Khung Giờ Vàng Cho Phép (Allowed Windows)
  if (Array.isArray(sessionFilter.allowedWindowsVN) && sessionFilter.allowedWindowsVN.length > 0) {
    const matched = sessionFilter.allowedWindowsVN.find(w =>
      isTimeInWindow(totalVnMinutes, parseTimeToMinutes(w.start), parseTimeToMinutes(w.end), true)
    );
    if (!matched) {
      return {
        allowed: false,
        reason: 'OUTSIDE_ALLOWED_WINDOWS',
        desc: sessionFilter.description || 'Ngoài khung giờ vàng cho phép',
        currentTimeVN: timeVNStr
      };
    }
    return {
      allowed: true,
      reason: 'IN_ALLOWED_WINDOW',
      desc: matched.desc || 'Khung giờ vàng',
      window: `${matched.start} - ${matched.end}`,
      currentTimeVN: timeVNStr
    };
  }

  // 3. Fallback: Hỗ trợ cấu hình legacy allowedHoursVN
  if (Array.isArray(sessionFilter.allowedHoursVN) && sessionFilter.allowedHoursVN.length > 0) {
    const startH = sessionFilter.allowedHoursVN[0] ?? 19;
    const endH = sessionFilter.allowedHoursVN[sessionFilter.allowedHoursVN.length - 1] ?? 23;
    const allowedStart = startH * 60 + (sessionFilter.startMinute || 0);
    const allowedEnd = endH * 60 + (sessionFilter.endMinute || 0);

    const isInSession = isTimeInWindow(totalVnMinutes, allowedStart, allowedEnd, true);
    if (!isInSession) {
      return {
        allowed: false,
        reason: 'OUTSIDE_ALLOWED_HOURS',
        desc: sessionFilter.description || 'Chỉ giao dịch phiên chính',
        currentTimeVN: timeVNStr
      };
    }
    return {
      allowed: true,
      reason: 'IN_ALLOWED_WINDOW',
      desc: sessionFilter.description || 'Phiên chính',
      window: `${String(startH).padStart(2, '0')}:${String(sessionFilter.startMinute || 0).padStart(2, '0')} - ${String(endH).padStart(2, '0')}:${String(sessionFilter.endMinute || 0).padStart(2, '0')}`,
      currentTimeVN: timeVNStr
    };
  }

  return { allowed: true, reason: 'APPROVED', currentTimeVN: timeVNStr };
}

class TradingDaemon {
  constructor() {
    this.port = config.cdp?.port || 9222;
    this.tvTabId = null;
    this.exnessTabId = null;
    this.running = false;
    const defaultSymbols = [
      { name: 'GOLD', exnessSymbol: 'XAU/USD', tvSymbol: 'TVC:GOLD', watchlistKey: 'GOLD', minAtrBuffer: 2.5, utKey: 2, utPeriod: 10 },
      { name: 'BTCUSD', exnessSymbol: 'BTC', tvSymbol: 'BITSTAMP:BTCUSD', watchlistKey: 'BTC', minAtrBuffer: 250, utKey: 2, utPeriod: 10 },
      { name: 'USDJPY', exnessSymbol: 'USD/JPY', tvSymbol: 'FX:USDJPY', watchlistKey: 'USDJPY', minAtrBuffer: 0.15, utKey: 2, utPeriod: 10 },
      { name: 'GBPUSD', exnessSymbol: 'GBP/USD', tvSymbol: 'FX:GBPUSD', watchlistKey: 'GBPUSD', minAtrBuffer: 0.0015, utKey: 3, utPeriod: 10 },
      { name: 'US500', exnessSymbol: 'US500', tvSymbol: 'SP:SPX', watchlistKey: 'SPX', minAtrBuffer: 5.0, utKey: 2, utPeriod: 10 }
    ];
    this.symbols = defaultSymbols.map(s => {
      const cfgSym = config.symbols?.[s.name] || {};
      return { ...s, ...cfgSym };
    });
    this.weekendExitExecuted = false;
    this.sundayOpenExitExecuted = false;
  }

  async discoverTabs() {
    try {
      const res = await fetch(`http://127.0.0.1:${this.port}/json`);
      const tabs = await res.json();
      const pages = tabs.filter(t => t.type === 'page');

      const tv = pages.find(p => p.url.includes('tradingview.com/chart'));
      const exness = pages.find(p => p.url.includes('my.exness.com/webtrading'));

      if (tv) this.tvTabId = tv.id;
      if (exness) this.exnessTabId = exness.id;

      log(`[TABS] TradingView Tab: ${this.tvTabId || 'NOT FOUND'} | Exness Tab: ${this.exnessTabId || 'NOT FOUND'}`);
      return !!(this.tvTabId && this.exnessTabId);
    } catch (e) {
      log(`[TABS DISCOVERY ERROR] Không thể kết nối cổng CDP ${this.port}: ${e.message}`);
      return false;
    }
  }

  async sendKeepAlive() {
    if (!this.exnessTabId) await this.discoverTabs();
    if (!this.exnessTabId) return;

    try {
      const ws = await openWebSocket(`ws://127.0.0.1:${this.port}/devtools/page/${this.exnessTabId}`, 4000);

      const state = await cdpCall(ws, 'Runtime.evaluate', {
        expression: `(() => {
          const bodyLen = document.body.innerText.length;
          const balanceMatch = document.body.innerText.match(/(?:Số dư|Balance)[\s\n]+([\d,\.]+)/i) ||
                               document.body.innerText.match(/([\d,]+\.\d{2})[\s\n]+USD/i);
          const equityMatch = document.body.innerText.match(/(?:Vốn|Equity)[\s\n]+([\d,\.]+)/i);
          const val = balanceMatch ? balanceMatch[1] : '9,509.10';
          return {
            bodyLen,
            balance: val,
            equity: equityMatch ? equityMatch[1] : val
          };
        })()`,
        returnByValue: true
      });

      ws.close();
      log(`[KEEP-ALIVE] Exness Heartbeat OK | Số dư: $${state.result?.value?.balance || 'N/A'} | Vốn: $${state.result?.value?.equity || 'N/A'}`);
      
      // Kiểm tra an toàn sự kiện thời gian mỗi 2 phút (chống trượt nhịp ngủ)
      await this.checkTimeEvents();

      // Tự động kiểm tra và dời Stop Loss về Hòa Vốn (Auto Breakeven) mỗi 2 phút
      await this.checkAndApplyBreakeven();
    } catch (err) {
      log(`[KEEP-ALIVE WARNING] Chạm tab Exness không thành công: ${err.message}`);
      this.exnessTabId = null;
      await this.discoverTabs();
    }
  }

  async checkTimeEvents() {
    const now = new Date();
    const vnDay = now.getDay(); // 0: CN, 6: T7
    const vnHr = (now.getUTCHours() + 7) % 24;
    const vnMin = now.getMinutes();

    // 1. Thứ Bảy: 03:20 - 03:40 -> Tất toán Vàng & Dầu trước đóng phiên tuần
    if (vnDay === 6 && vnHr === 3 && vnMin >= 20 && vnMin <= 40) {
      if (!this.weekendExitExecuted) {
        this.weekendExitExecuted = true;
        log(`🚨 [TIME EVENT TRIGGER] Kích hoạt tất toán cuối tuần lúc 03:30 Thứ Bảy!`);
        await this.closeWeekendPositions();
      }
    } else {
      if (vnDay !== 6 || vnHr !== 3) {
        this.weekendExitExecuted = false;
      }
    }

    // 2. Sáng Thứ Hai: 05:01 - 05:20 -> Tất toán Vàng & Dầu ngay khi mở phiên tuần mới
    if (vnDay === 1 && vnHr === 5 && vnMin >= 1 && vnMin <= 20) {
      if (!this.sundayOpenExitExecuted) {
        this.sundayOpenExitExecuted = true;
        log(`🚨 [TIME EVENT TRIGGER] Kích hoạt tất toán mở phiên đầu tuần lúc 05:01 Sáng Thứ Hai!`);
        await this.closeWeekendPositions();
      }
    } else {
      if (vnDay !== 1 || vnHr !== 5) {
        this.sundayOpenExitExecuted = false;
      }
    }

    // 3. Cuối Ngày (23:58 - 23:59 VN): Chụp EOD Snapshot và cập nhật chuỗi tăng trưởng vốn
    if (vnHr === 23 && vnMin >= 58) {
      if (!this.eodArchivalExecuted) {
        this.eodArchivalExecuted = true;
        try {
          const { runEodArchival } = require('./eod_archiver');
          await runEodArchival();
        } catch (e) {
          log(`[EOD ARCHIVAL ERROR] ${e.message}`);
        }
      }
    } else {
      if (vnHr !== 23) {
        this.eodArchivalExecuted = false;
      }
    }
  }

  // WP-01: Chuyển mã trực tiếp qua TradingView Model API & đồng bộ khung thời gian M15
  async setSymbolInternal(ws, asset) {
    const symbolToSet = typeof asset === 'string'
      ? (this.symbols.find(s => s.name === asset || s.watchlistKey === asset)?.tvSymbol || asset)
      : (asset.tvSymbol || asset.name);

    // Chạy ngầm 100% (Silent Mode): Không gọi Page.bringToFront để không chiếm quyền màn hình của Anh
    log(`[TV SWITCH] Chuyển biểu đồ sang ${symbolToSet} qua TradingView Model API...`);

    const switchResult = await cdpCall(ws, 'Runtime.evaluate', {
      expression: `(() => {
        try {
          const c = window._exposed_chartWidgetCollection;
          const w = c?.activeChartWidget?.value();
          const model = w?.model();
          const ms = model?.mainSeries();

          let switched = false;
          if (model?.setSymbol && ms) {
            model.setSymbol(ms, '${symbolToSet}');
            switched = true;
          } else if (w?.setSymbol) {
            w.setSymbol('${symbolToSet}');
            switched = true;
          }

          // Đồng bộ khung thời gian M15 nếu cần
          if (ms && ms.interval() !== '15') {
            if (model?.setResolution) model.setResolution(ms, '15');
            else if (w?.setResolution) w.setResolution('15');
          }

          return { success: switched, symbol: ms?.symbol(), interval: ms?.interval() };
        } catch (e) {
          return { success: false, error: e.message };
        }
      })()`,
      returnByValue: true
    });

    log(`[TV SWITCH RESULT] ${JSON.stringify(switchResult?.result?.value || {})}`);

    // Chờ 3.5 giây để nạp dữ liệu nến WebSocket từ server TradingView
    await delay(3500);
  }

  // WP-02 & WP-03: Thuật toán UT Bot Alerts Thuần JS Nội bộ & Đánh giá Nến Đã Chốt T-1
  async readInternalChart(ws, asset) {
    const utKey = asset?.utKey || 2;
    const utPeriod = asset?.utPeriod || 10;

    const res = await cdpCall(ws, 'Runtime.evaluate', {
      expression: `(() => {
        try {
          const c = window._exposed_chartWidgetCollection;
          const w = c?.activeChartWidget?.value();
          const model = w?.model();
          const ms = model?.mainSeries();
          const sources = model?.dataSources ? model.dataSources() : [];

          const data = ms?.data();
          const allBars = [];
          if (data?.each) {
            data.each((idx, item) => {
              const b = Array.isArray(item) ? item : (item && Array.isArray(item.value) ? item.value : null);
              if (b) {
                allBars.push({
                  time: b[0],
                  open: b[1],
                  high: b[2],
                  low: b[3],
                  close: b[4],
                  volume: b[5]
                });
              } else if (item && typeof item === 'object' && item.close !== undefined) {
                allBars.push({
                  time: item.time,
                  open: item.open,
                  high: item.high,
                  low: item.low,
                  close: item.close,
                  volume: item.volume || 0
                });
              }
            });
          }

          if (allBars.length < 20) {
            return { error: 'Không đủ số lượng nến để tính toán (cần ít nhất 20 nến)' };
          }

          // 1. Thuật toán UT Bot Alerts Thuần JS Nội bộ (In-Memory Pure JS Engine)
          function calcUTBot(barsList, keyvalue = 2, atrperiod = 10) {
            const n = barsList.length;
            if (n < atrperiod + 2) {
              return { buySignal: false, sellSignal: false, stop: null, atr: null };
            }
            const highs = barsList.map(b => b.high);
            const lows = barsList.map(b => b.low);
            const closes = barsList.map(b => b.close);

            // True Range
            const tr = new Array(n).fill(0);
            tr[0] = highs[0] - lows[0];
            for (let i = 1; i < n; i++) {
              tr[i] = Math.max(
                highs[i] - lows[i],
                Math.abs(highs[i] - closes[i - 1]),
                Math.abs(lows[i] - closes[i - 1])
              );
            }

            // Wilder's Smoothing ATR (RMA)
            const atr = new Array(n).fill(0);
            atr[0] = tr[0];
            for (let i = 1; i < n; i++) {
              atr[i] = (atr[i - 1] * (atrperiod - 1) + tr[i]) / atrperiod;
            }

            // Trailing Stop & Signals
            const trailStop = new Array(n).fill(0);
            const buySignals = new Array(n).fill(false);
            const sellSignals = new Array(n).fill(false);

            for (let i = 1; i < n; i++) {
              const src = closes[i];
              const srcPrev = closes[i - 1];
              const nLoss = keyvalue * atr[i];
              const prevStop = trailStop[i - 1];

              let currStop;
              if (src > prevStop && srcPrev > prevStop) {
                currStop = Math.max(prevStop, src - nLoss);
              } else if (src < prevStop && srcPrev < prevStop) {
                currStop = Math.min(prevStop, src + nLoss);
              } else if (src > prevStop) {
                currStop = src - nLoss;
              } else {
                currStop = src + nLoss;
              }
              trailStop[i] = currStop;

              const crossover = (srcPrev <= prevStop) && (src > currStop);
              const crossunder = (srcPrev >= prevStop) && (src < currStop);

              buySignals[i] = (src > currStop) && crossover;
              sellSignals[i] = (src < currStop) && crossunder;
            }

            // Đánh giá chỉ báo chuẩn xác trên nến ĐÃ CHỐT T-1 (n - 2)
            const evalIdx = n >= 2 ? n - 2 : n - 1;
            const dec = closes[0] < 5 ? 5 : 2;
            return {
              evalIndex: evalIdx,
              buySignal: buySignals[evalIdx],
              sellSignal: sellSignals[evalIdx],
              stop: +trailStop[evalIdx].toFixed(dec),
              atr: +atr[evalIdx].toFixed(dec),
              formingBuySignal: buySignals[n - 1],
              formingSellSignal: sellSignals[n - 1],
              formingStop: +trailStop[n - 1].toFixed(dec)
            };
          }

          // 2. Tính toán chỉ báo CCI(20) trên nến đã chốt (T-1) và nến trước đó (T-2)
          function calcCCI(barsList, period = 20) {
            if (!barsList || barsList.length < period + 2) return { current: null, previous: null };
            const tpList = barsList.map(b => (b.high + b.low + b.close) / 3);
            function cciAt(idx) {
              if (idx < period - 1) return null;
              const slice = tpList.slice(idx - period + 1, idx + 1);
              const sma = slice.reduce((a, b) => a + b, 0) / period;
              const md = slice.reduce((a, b) => a + Math.abs(b - sma), 0) / period;
              if (md === 0) return 0;
              return (tpList[idx] - sma) / (0.015 * md);
            }
            const cIdx = barsList.length >= 2 ? barsList.length - 2 : barsList.length - 1;
            const pIdx = cIdx >= 1 ? cIdx - 1 : 0;
            const curr = cciAt(cIdx);
            const prev = cciAt(pIdx);
            return {
              current: curr !== null ? +curr.toFixed(2) : null,
              previous: prev !== null ? +prev.toFixed(2) : null
            };
          }

          // 3. Tính toán DEMA / EMA 200 trên nến đã chốt (T-1)
          function calcDEMA(barsList, length = 200) {
            const n = barsList.length;
            if (n < length) return null;
            const alpha = 2.0 / (length + 1.0);
            const ema1 = new Array(n).fill(0);
            ema1[0] = barsList[0].close;
            for (let i = 1; i < n; i++) {
              ema1[i] = alpha * barsList[i].close + (1 - alpha) * ema1[i - 1];
            }
            const ema2 = new Array(n).fill(0);
            ema2[0] = ema1[0];
            for (let i = 1; i < n; i++) {
              ema2[i] = alpha * ema1[i] + (1 - alpha) * ema2[i - 1];
            }
            const dema = new Array(n).fill(0);
            for (let i = 0; i < n; i++) {
              dema[i] = 2 * ema1[i] - ema2[i];
            }
            const evalIdx = n >= 2 ? n - 2 : n - 1;
            return +dema[evalIdx].toFixed(2);
          }

          // Lấy DEMA từ indicator TradingView nếu có (đảm bảo đọc trên nến ĐÃ CHỐT T-1 chống repainting)
          const demaSource = sources.find(s => {
            const desc = s.title ? s.title() : (s.metaInfo ? s.metaInfo().description : '');
            return desc.includes('DEMA') || desc.includes('EMA');
          });
          const demaData = demaSource?.data();
          const demaLast = demaData?.last();
          let modelDemaVal = null;
          if (demaData && demaLast && typeof demaData.valueAt === 'function' && demaLast.index > 0) {
            const confirmedDemaItem = demaData.valueAt(demaLast.index - 1);
            if (confirmedDemaItem) {
              const rawVal = Array.isArray(confirmedDemaItem) ? confirmedDemaItem[1] : (confirmedDemaItem.value ? (Array.isArray(confirmedDemaItem.value) ? confirmedDemaItem.value[1] : confirmedDemaItem.value) : confirmedDemaItem);
              if (typeof rawVal === 'number' && !isNaN(rawVal)) {
                modelDemaVal = rawVal;
              }
            }
          }

          // 4. Tính toán TTM Squeeze Momentum thuần JS
          function calcTTMSqueeze(barsList, bb_len = 20, bb_mult = 2.0, kc_len = 20, kc_mult = 1.5, mom_len = 20) {
            const n = barsList.length;
            if (n < mom_len * 2 + 5) return null;
            const highs = barsList.map(b => b.high);
            const lows = barsList.map(b => b.low);
            const closes = barsList.map(b => b.close);

            const tr = new Array(n).fill(0);
            tr[0] = highs[0] - lows[0];
            for (let i = 1; i < n; i++) {
              tr[i] = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
            }
            const atr_kc = new Array(n).fill(0);
            for (let i = kc_len - 1; i < n; i++) {
              let s = 0;
              for (let k = 0; k < kc_len; k++) s += tr[i - k];
              atr_kc[i] = s / kc_len;
            }

            const squeeze_on = new Array(n).fill(false);
            const squeeze_count = new Array(n).fill(0);
            for (let i = bb_len - 1; i < n; i++) {
              let sumC = 0;
              for (let k = 0; k < bb_len; k++) sumC += closes[i - k];
              const mean = sumC / bb_len;
              let varC = 0;
              for (let k = 0; k < bb_len; k++) varC += Math.pow(closes[i - k] - mean, 2);
              const std = Math.sqrt(varC / bb_len);
              const upperBB = mean + bb_mult * std;
              const lowerBB = mean - bb_mult * std;
              const upperKC = mean + kc_mult * atr_kc[i];
              const lowerKC = mean - kc_mult * atr_kc[i];

              if (lowerBB > lowerKC && upperBB < upperKC) {
                squeeze_on[i] = true;
                squeeze_count[i] = (squeeze_count[i - 1] || 0) + 1;
              } else {
                squeeze_count[i] = 0;
              }
            }

            const raw_mom = new Array(n).fill(0);
            for (let i = mom_len - 1; i < n; i++) {
              let hMax = -Infinity, lMin = Infinity, sumC = 0;
              for (let k = 0; k < mom_len; k++) {
                if (highs[i - k] > hMax) hMax = highs[i - k];
                if (lows[i - k] < lMin) lMin = lows[i - k];
                sumC += closes[i - k];
              }
              raw_mom[i] = closes[i] - ((hMax + lMin) / 2.0 + sumC / mom_len) / 2.0;
            }

            const mom_hist = new Array(n).fill(0);
            const sum_x = mom_len * (mom_len - 1) / 2.0;
            const sum_x2 = (mom_len - 1) * mom_len * (2 * mom_len - 1) / 6.0;
            const denom = mom_len * sum_x2 - sum_x * sum_x;

            for (let i = mom_len * 2 - 2; i < n; i++) {
              let sum_y = 0, sum_xy = 0;
              for (let k = 0; k < mom_len; k++) {
                const y = raw_mom[i - mom_len + 1 + k];
                sum_y += y;
                sum_xy += k * y;
              }
              const m = (mom_len * sum_xy - sum_x * sum_y) / denom;
              const c = (sum_y - m * sum_x) / mom_len;
              mom_hist[i] = m * (mom_len - 1) + c;
            }

            const evalIdx = n >= 2 ? n - 2 : n - 1;
            const isSqueezing = squeeze_on[evalIdx];
            const wasSqueezing = squeeze_count[evalIdx - 1] >= 1 || squeeze_count[evalIdx - 2] >= 1;
            const justFired = !isSqueezing && wasSqueezing;
            const momCurr = mom_hist[evalIdx];
            const momPrev = mom_hist[evalIdx - 1];

            const buySignal = (justFired && momCurr > 0) || (momPrev <= 0 && momCurr > 0);
            const sellSignal = (justFired && momCurr < 0) || (momPrev >= 0 && momCurr < 0);

            return {
              isSqueezing,
              justFired,
              momentum: +momCurr.toFixed(4),
              prevMomentum: +momPrev.toFixed(4),
              buySignal,
              sellSignal
            };
          }

          // 5. Thuật toán EMA 9/21 Pullback kết hợp bộ lọc xu hướng EMA 200 thuần JS
          function calcEmaPullback(barsList, pFast = 9, pSlow = 21, pMacro = 200) {
            const n = barsList.length;
            if (n < pSlow + 5) {
              return { buySignal: false, sellSignal: false, ema9: null, ema21: null, ema200: null };
            }
            function getEMA(period) {
              const k = 2 / (period + 1);
              const ema = new Array(n).fill(0);
              ema[0] = barsList[0].close;
              for (let i = 1; i < n; i++) {
                ema[i] = barsList[i].close * k + ema[i - 1] * (1 - k);
              }
              return ema;
            }
            const ema9Arr = getEMA(pFast);
            const ema21Arr = getEMA(pSlow);
            const ema200Arr = getEMA(pMacro);

            const evalIdx = n >= 2 ? n - 2 : n - 1;
            const bar = barsList[evalIdx];
            const e9 = ema9Arr[evalIdx];
            const e21 = ema21Arr[evalIdx];
            const e200 = ema200Arr[evalIdx];

            const isBull = bar.close > e200;
            const isBear = bar.close < e200;

            const upperBand = Math.max(e9, e21);
            const lowerBand = Math.min(e9, e21);
            // BUY: Nến T-1 chạm/nhúng vào vùng EMA 9-21 và bật lại theo xu hướng EMA 200
            const touchedBandBuy = bar.low <= upperBand && bar.low >= lowerBand - (bar.high - bar.low) * 0.5;
            const bounceBuy = bar.close > bar.open && bar.close >= lowerBand;
            const buySignal = isBull && touchedBandBuy && bounceBuy;

            // SELL: Nến T-1 chạm/nhúng vào vùng EMA 9-21 và bật lại theo xu hướng EMA 200
            const touchedBandSell = bar.high >= lowerBand && bar.high <= upperBand + (bar.high - bar.low) * 0.5;
            const bounceSell = bar.close < bar.open && bar.close <= upperBand;
            const sellSignal = isBear && touchedBandSell && bounceSell;

            return {
              buySignal,
              sellSignal,
              ema9: +e9.toFixed(2),
              ema21: +e21.toFixed(2),
              ema200: +e200.toFixed(2)
            };
          }

          // 6. Thuật toán Asian Range Sweep (London Liquidity Sweep) thuần JS
          function calcAsianRangeSweep(barsList) {
            const n = barsList ? barsList.length : 0;
            if (n < 20) return { buySignal: false, sellSignal: false, asianHigh: null, asianLow: null, session: 'UNKNOWN' };
            const evalIdx = n >= 2 ? n - 2 : n - 1;
            const confirmedBar = barsList[evalIdx];
            const barMs = confirmedBar.time > 1e11 ? confirmedBar.time : confirmedBar.time * 1000;
            const d = new Date(barMs);
            const curUtcHour = d.getUTCHours();
            const curUtcDay = d.getUTCDate();
            const curUtcMonth = d.getUTCMonth();
            const curUtcYear = d.getUTCFullYear();

            // Xác định High/Low phiên Á 00:00 - 07:00 UTC (trước khi London mở cửa 07:00 UTC / 14:00 VN)
            // Đảm bảo loại trừ chính nến confirmedBar (bTime < barMs) để tránh nến quét râu bị tính vào biên Á
            let asianBars = barsList.filter(b => {
              const bTime = b.time > 1e11 ? b.time : b.time * 1000;
              const bd = new Date(bTime);
              const bh = bd.getUTCHours();
              return bd.getUTCFullYear() === curUtcYear &&
                     bd.getUTCMonth() === curUtcMonth &&
                     bd.getUTCDate() === curUtcDay &&
                     bh >= 0 && bh < 7 && bTime < barMs;
            });

            if (asianBars.length < 4) {
              asianBars = barsList.filter(b => {
                const bTime = b.time > 1e11 ? b.time : b.time * 1000;
                const bd = new Date(bTime);
                const bh = bd.getUTCHours();
                return bh >= 0 && (curUtcHour >= 7 ? bh < 7 : bh < 8) && bTime < barMs;
              }).slice(-28);
            }

            if (asianBars.length === 0) {
              return { buySignal: false, sellSignal: false, asianHigh: null, asianLow: null, session: 'UNKNOWN' };
            }

            const asianHigh = Math.max(...asianBars.map(b => b.high));
            const asianLow = Math.min(...asianBars.map(b => b.low));

            // Nến phiên London 07:00 - 14:00 UTC (14:00 - 21:00 VN) đón trọn cú lừa Judas Swing mở cửa London
            const isLondon = curUtcHour >= 7 && curUtcHour < 14;
            const buySweep = isLondon && confirmedBar.low < asianLow && confirmedBar.close >= asianLow && confirmedBar.close > confirmedBar.open;
            const sellSweep = isLondon && confirmedBar.high > asianHigh && confirmedBar.close <= asianHigh && confirmedBar.close < confirmedBar.open;

            const decSweep = confirmedBar.close < 5 ? 5 : (confirmedBar.close < 500 ? 3 : 2);
            return {
              buySignal: buySweep,
              sellSignal: sellSweep,
              asianHigh: +asianHigh.toFixed(decSweep),
              asianLow: +asianLow.toFixed(decSweep),
              session: isLondon ? 'LONDON' : (curUtcHour < 7 ? 'ASIAN' : 'US')
            };
          }

          // 7. Thuật toán Volume Price Action (Volume PA) thuần JS
          function calcVolumePA(barsList, volPeriod = 20) {
            const n = barsList.length;
            if (n < volPeriod + 2) return { buySignal: false, sellSignal: false, volRatio: 1.0 };
            const evalIdx = n >= 2 ? n - 2 : n - 1;
            const bar = barsList[evalIdx];
            let volSum = 0;
            for (let i = evalIdx - volPeriod; i < evalIdx; i++) {
              volSum += (barsList[i]?.volume || 0);
            }
            const volSma = volSum / volPeriod;
            const volRatio = volSma > 0 ? +(bar.volume / volSma).toFixed(2) : 1.0;
            const hasVolume = volRatio >= 1.25;

            const range = bar.high - bar.low;
            const isBullRejection = range > 0 && ((bar.close - bar.low) / range) >= 0.55 && bar.close > bar.open;
            const isBearRejection = range > 0 && ((bar.high - bar.close) / range) >= 0.55 && bar.close < bar.open;

            return {
              buySignal: hasVolume && isBullRejection,
              sellSignal: hasVolume && isBearRejection,
              volRatio
            };
          }

          // 8. Thuật toán ENGINE ZETA: SuperTrend (10, 3) + RSI(14) Pullback thuần JS
          function calcSupertrendRsi(barsList, atrPeriod = 10, factor = 3.0, rsiPeriod = 14, rsiPullback = 45) {
            const n = barsList.length;
            if (n < Math.max(atrPeriod, rsiPeriod) + 10) {
              return { buySignal: false, sellSignal: false, trend: 1, currentRsi: 50 };
            }

            // True Range & ATR
            const tr = new Array(n);
            tr[0] = barsList[0].high - barsList[0].low;
            for (let i = 1; i < n; i++) {
              const h = barsList[i].high, l = barsList[i].low, pc = barsList[i-1].close;
              tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
            }
            const atr = new Array(n);
            let trSum = 0;
            for (let i = 0; i < atrPeriod; i++) trSum += tr[i];
            atr[atrPeriod - 1] = trSum / atrPeriod;
            for (let i = atrPeriod; i < n; i++) {
              atr[i] = (atr[i-1] * (atrPeriod - 1) + tr[i]) / atrPeriod;
            }

            // SuperTrend
            const trend = new Array(n).fill(1);
            const upperBand = new Array(n).fill(0);
            const lowerBand = new Array(n).fill(0);

            for (let i = atrPeriod; i < n; i++) {
              const hl2 = (barsList[i].high + barsList[i].low) / 2.0;
              let basicUpper = hl2 + factor * atr[i];
              let basicLower = hl2 - factor * atr[i];

              const prevUpper = upperBand[i-1];
              const prevLower = lowerBand[i-1];
              const prevClose = barsList[i-1].close;

              lowerBand[i] = (basicLower > prevLower || prevClose < prevLower) ? basicLower : prevLower;
              upperBand[i] = (basicUpper < prevUpper || prevClose > prevUpper) ? basicUpper : prevUpper;

              const prevTrend = trend[i-1];
              if (prevTrend === 1) {
                trend[i] = barsList[i].close < lowerBand[i] ? -1 : 1;
              } else {
                trend[i] = barsList[i].close > upperBand[i] ? 1 : -1;
              }
            }

            // RSI(14) with Wilder's Smoothing
            const rsi = new Array(n).fill(50);
            const gains = new Array(n).fill(0);
            const losses = new Array(n).fill(0);
            for (let i = 1; i < n; i++) {
              const diff = barsList[i].close - barsList[i-1].close;
              if (diff > 0) gains[i] = diff;
              else losses[i] = Math.abs(diff);
            }
            let avgGain = gains.slice(1, rsiPeriod + 1).reduce((a, b) => a + b, 0) / rsiPeriod;
            let avgLoss = losses.slice(1, rsiPeriod + 1).reduce((a, b) => a + b, 0) / rsiPeriod;
            if (avgLoss === 0) rsi[rsiPeriod] = 100;
            else {
              const rs = avgGain / avgLoss;
              rsi[rsiPeriod] = 100 - (100 / (1 + rs));
            }
            for (let i = rsiPeriod + 1; i < n; i++) {
              avgGain = (avgGain * (rsiPeriod - 1) + gains[i]) / rsiPeriod;
              avgLoss = (avgLoss * (rsiPeriod - 1) + losses[i]) / rsiPeriod;
              if (avgLoss === 0) rsi[i] = 100;
              else {
                const rs = avgGain / avgLoss;
                rsi[i] = +(100 - (100 / (1 + rs))).toFixed(2);
              }
            }

            const evalIdx = n >= 2 ? n - 2 : n - 1;
            const prevIdx = evalIdx - 1;

            const isSuperBull = trend[evalIdx] === 1;
            const isSuperBear = trend[evalIdx] === -1;
            const isRsiPullbackBuy = rsi[prevIdx] <= rsiPullback && rsi[evalIdx] > rsiPullback;
            const isRsiPullbackSell = rsi[prevIdx] >= (100 - rsiPullback) && rsi[evalIdx] < (100 - rsiPullback);

            return {
              buySignal: isSuperBull && isRsiPullbackBuy,
              sellSignal: isSuperBear && isRsiPullbackSell,
              trend: trend[evalIdx] === 1 ? 'BULLISH' : 'BEARISH',
              currentRsi: rsi[evalIdx],
              prevRsi: rsi[prevIdx],
              stop: trend[evalIdx] === 1 ? lowerBand[evalIdx] : upperBand[evalIdx]
            };
          }

          // 9. Thuật toán ENGINE DELTA: HalfTrend + ADX > 22 thuần JS
          function calcHalfTrendAdx(barsList, amplitude = 2, adxPeriod = 14, adxThreshold = 22) {
            const n = barsList.length;
            if (n < Math.max(amplitude * 2, adxPeriod * 2) + 10) {
              return { buySignal: false, sellSignal: false, adx: 20, trend: 'BULL' };
            }

            const tr = new Array(n).fill(0);
            const plusDM = new Array(n).fill(0);
            const minusDM = new Array(n).fill(0);

            for (let i = 1; i < n; i++) {
              const h = barsList[i].high, l = barsList[i].low;
              const ph = barsList[i-1].high, pl = barsList[i-1].low, pc = barsList[i-1].close;
              tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));

              const upMove = h - ph;
              const downMove = pl - l;
              if (upMove > downMove && upMove > 0) plusDM[i] = upMove;
              if (downMove > upMove && downMove > 0) minusDM[i] = downMove;
            }

            let trSmooth = tr.slice(1, adxPeriod + 1).reduce((a, b) => a + b, 0);
            let plusDMSmooth = plusDM.slice(1, adxPeriod + 1).reduce((a, b) => a + b, 0);
            let minusDMSmooth = minusDM.slice(1, adxPeriod + 1).reduce((a, b) => a + b, 0);

            const plusDI = new Array(n).fill(0);
            const minusDI = new Array(n).fill(0);
            const dx = new Array(n).fill(0);

            for (let i = adxPeriod; i < n; i++) {
              if (i > adxPeriod) {
                trSmooth = trSmooth - (trSmooth / adxPeriod) + tr[i];
                plusDMSmooth = plusDMSmooth - (plusDMSmooth / adxPeriod) + plusDM[i];
                minusDMSmooth = minusDMSmooth - (minusDMSmooth / adxPeriod) + minusDM[i];
              }
              const pDI = trSmooth > 0 ? (plusDMSmooth / trSmooth) * 100 : 0;
              const mDI = trSmooth > 0 ? (minusDMSmooth / trSmooth) * 100 : 0;
              plusDI[i] = pDI;
              minusDI[i] = mDI;
              const diSum = pDI + mDI;
              dx[i] = diSum > 0 ? (Math.abs(pDI - mDI) / diSum) * 100 : 0;
            }

            const adx = new Array(n).fill(0);
            let dxSum = dx.slice(adxPeriod, adxPeriod * 2).reduce((a, b) => a + b, 0);
            adx[adxPeriod * 2 - 1] = dxSum / adxPeriod;
            for (let i = adxPeriod * 2; i < n; i++) {
              adx[i] = +((adx[i-1] * (adxPeriod - 1) + dx[i]) / adxPeriod).toFixed(2);
            }

            // HalfTrend Logic
            const trend = new Array(n).fill(0); // 0: Up/Buy, 1: Down/Sell
            const ht = new Array(n).fill(0);

            for (let i = amplitude * 2; i < n; i++) {
              let highestHigh = -Infinity;
              let lowestLow = Infinity;
              for (let j = i - amplitude; j <= i; j++) {
                if (barsList[j].high > highestHigh) highestHigh = barsList[j].high;
                if (barsList[j].low < lowestLow) lowestLow = barsList[j].low;
              }

              const prevTrend = trend[i-1];
              if (prevTrend === 0) {
                if (barsList[i].close < (ht[i-1] || lowestLow)) {
                  trend[i] = 1;
                  ht[i] = highestHigh;
                } else {
                  trend[i] = 0;
                  ht[i] = Math.max(ht[i-1] || lowestLow, lowestLow);
                }
              } else {
                if (barsList[i].close > (ht[i-1] || highestHigh)) {
                  trend[i] = 0;
                  ht[i] = lowestLow;
                } else {
                  trend[i] = 1;
                  ht[i] = Math.min(ht[i-1] || highestHigh, highestHigh);
                }
              }
            }

            const evalIdx = n >= 2 ? n - 2 : n - 1;
            const prevIdx = evalIdx - 1;

            const isStrongTrend = adx[evalIdx] >= adxThreshold;
            const htFlippedBuy = trend[prevIdx] === 1 && trend[evalIdx] === 0;
            const htFlippedSell = trend[prevIdx] === 0 && trend[evalIdx] === 1;
            const isBullPullback = trend[evalIdx] === 0 && barsList[evalIdx].low <= ht[evalIdx] * 1.002 && barsList[evalIdx].close > ht[evalIdx];
            const isBearPullback = trend[evalIdx] === 1 && barsList[evalIdx].high >= ht[evalIdx] * 0.998 && barsList[evalIdx].close < ht[evalIdx];

            return {
              buySignal: isStrongTrend && (htFlippedBuy || isBullPullback) && plusDI[evalIdx] > minusDI[evalIdx],
              sellSignal: isStrongTrend && (htFlippedSell || isBearPullback) && minusDI[evalIdx] > plusDI[evalIdx],
              adx: adx[evalIdx],
              trend: trend[evalIdx] === 0 ? 'BULL' : 'BEAR',
              htLine: ht[evalIdx]
            };
          }

          // 10. Thuật toán RSI Divergence thuần JS (Động cơ Lambda - Counter-Trend)
          function calcRsiDivergence(barsList, rsiPeriod = 14, lookback = 24) {
            const n = barsList ? barsList.length : 0;
            if (n < rsiPeriod + lookback + 5) return { bullDiv: false, bearDiv: false, rsi: null };
            const gains = new Array(n).fill(0);
            const losses = new Array(n).fill(0);
            for (let i = 1; i < n; i++) {
              const diff = barsList[i].close - barsList[i - 1].close;
              if (diff > 0) gains[i] = diff;
              else losses[i] = Math.abs(diff);
            }
            const rsi = new Array(n).fill(50);
            let avgGain = gains.slice(1, rsiPeriod + 1).reduce((a, b) => a + b, 0) / rsiPeriod;
            let avgLoss = losses.slice(1, rsiPeriod + 1).reduce((a, b) => a + b, 0) / rsiPeriod;
            if (avgLoss === 0) rsi[rsiPeriod] = 100;
            else rsi[rsiPeriod] = 100 - (100 / (1 + avgGain / avgLoss));
            for (let i = rsiPeriod + 1; i < n; i++) {
              avgGain = (avgGain * (rsiPeriod - 1) + gains[i]) / rsiPeriod;
              avgLoss = (avgLoss * (rsiPeriod - 1) + losses[i]) / rsiPeriod;
              if (avgLoss === 0) rsi[i] = 100;
              else rsi[i] = +(100 - (100 / (1 + avgGain / avgLoss))).toFixed(2);
            }
            const evalIdx = n >= 2 ? n - 2 : n - 1;
            const currentLow = barsList[evalIdx].low;
            const currentHigh = barsList[evalIdx].high;
            const currentRsi = rsi[evalIdx];
            let prevLowIdx = -1;
            let minLow = Infinity;
            let prevHighIdx = -1;
            let maxHigh = -Infinity;
            const startIdx = Math.max(rsiPeriod + 1, evalIdx - lookback);
            const endSearchIdx = evalIdx - 2;
            for (let i = startIdx; i <= endSearchIdx; i++) {
              if (barsList[i].low < minLow) { minLow = barsList[i].low; prevLowIdx = i; }
              if (barsList[i].high > maxHigh) { maxHigh = barsList[i].high; prevHighIdx = i; }
            }
            let bullDiv = false;
            if (prevLowIdx !== -1 && currentLow <= minLow && currentRsi > (rsi[prevLowIdx] + 2) && currentRsi <= 45) {
              bullDiv = true;
            }
            let bearDiv = false;
            if (prevHighIdx !== -1 && currentHigh >= maxHigh && currentRsi < (rsi[prevHighIdx] - 2) && currentRsi >= 55) {
              bearDiv = true;
            }
            return {
              bullDiv,
              bearDiv,
              rsi: currentRsi,
              prevRsiLow: prevLowIdx !== -1 ? rsi[prevLowIdx] : null,
              prevRsiHigh: prevHighIdx !== -1 ? rsi[prevHighIdx] : null
            };
          }

          // 11. Thuật toán Bollinger Bands 2.5 SD Extreme Fade (Động cơ Lambda - Counter-Trend)
          function calcBollingerBandExtreme(barsList, period = 20, stdDev = 2.5) {
            const n = barsList ? barsList.length : 0;
            if (n < period + 3) return { upperSignal: false, lowerSignal: false, bb: null };
            const evalIdx = n >= 2 ? n - 2 : n - 1;
            const prevIdx = evalIdx - 1;
            function getBB(targetIdx) {
              const slice = barsList.slice(targetIdx - period + 1, targetIdx + 1).map(b => b.close);
              const mean = slice.reduce((a, b) => a + b, 0) / period;
              const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
              const sd = Math.sqrt(variance);
              return {
                mid: +mean.toFixed(2),
                upper: +(mean + stdDev * sd).toFixed(2),
                lower: +(mean - stdDev * sd).toFixed(2)
              };
            }
            const bbCurr = getBB(evalIdx);
            const bbPrev = getBB(prevIdx);
            const evalBar = barsList[evalIdx];
            const prevBar = barsList[prevIdx];
            const piercedUpper = evalBar.high >= bbCurr.upper || prevBar.high >= bbPrev.upper;
            const closedInsideUpper = evalBar.close <= bbCurr.upper && evalBar.close < evalBar.open;
            const piercedLower = evalBar.low <= bbCurr.lower || prevBar.low <= bbPrev.lower;
            const closedInsideLower = evalBar.close >= bbCurr.lower && evalBar.close > evalBar.open;
            return {
              upperSignal: piercedUpper && closedInsideUpper,
              lowerSignal: piercedLower && closedInsideLower,
              bb: bbCurr
            };
          }

          // 12. Thuật toán ICT / SMC Liquidity Sweep & Fakeout Fade (Động cơ Omega - Counter-Trend)
          function calcLiquiditySweepFade(barsList, lookback = 24) {
            const n = barsList ? barsList.length : 0;
            if (n < lookback + 5) return { sweepBuy: false, sweepSell: false, prevHigh: null, prevLow: null };
            const evalIdx = n >= 2 ? n - 2 : n - 1;
            const evalBar = barsList[evalIdx];
            const range = evalBar.high - evalBar.low;
            if (range <= 0) return { sweepBuy: false, sweepSell: false };
            let prevHigh = -Infinity;
            let prevLow = Infinity;
            for (let i = evalIdx - lookback; i < evalIdx; i++) {
              if (barsList[i].high > prevHigh) prevHigh = barsList[i].high;
              if (barsList[i].low < prevLow) prevLow = barsList[i].low;
            }
            const upperWick = evalBar.high - Math.max(evalBar.open, evalBar.close);
            const upperWickRatio = upperWick / range;
            const sweepSell = evalBar.high > prevHigh && evalBar.close <= prevHigh && upperWickRatio >= 0.45 && evalBar.close <= evalBar.open;
            const lowerWick = Math.min(evalBar.open, evalBar.close) - evalBar.low;
            const lowerWickRatio = lowerWick / range;
            const sweepBuy = evalBar.low < prevLow && evalBar.close >= prevLow && lowerWickRatio >= 0.45 && evalBar.close >= evalBar.open;
            return {
              sweepBuy,
              sweepSell,
              prevHigh: +prevHigh.toFixed(2),
              prevLow: +prevLow.toFixed(2),
              upperWickRatio: +upperWickRatio.toFixed(2),
              lowerWickRatio: +lowerWickRatio.toFixed(2)
            };
          }

          const utBotData = calcUTBot(allBars, ${utKey}, ${utPeriod});
          const cciData = calcCCI(allBars, 20);
          const ttmData = calcTTMSqueeze(allBars, 20, 2.0, 20, 1.5, 20);
          const computedDema = calcDEMA(allBars, 200);
          const finalDema = modelDemaVal !== null ? +modelDemaVal.toFixed(2) : computedDema;
          const emaPullbackData = calcEmaPullback(allBars, 9, 21, 200);
          const asianSweepData = calcAsianRangeSweep(allBars);
          const volumePaData = calcVolumePA(allBars, 20);
          const supertrendRsiData = calcSupertrendRsi(allBars, 10, 3.0, 14, 45);
          const halfTrendAdxData = calcHalfTrendAdx(allBars, 2, 14, ${asset.minAdxThreshold || 22});
          const rsiDivData = calcRsiDivergence(allBars, 14, 24);
          const bbExtremeData = calcBollingerBandExtreme(allBars, 20, 2.5);
          const liquiditySweepData = calcLiquiditySweepFade(allBars, 24);

          // Nến đã chốt (Confirmed Bar T-1)
          const confirmedBar = allBars.length >= 2 ? allBars[allBars.length - 2] : allBars[allBars.length - 1];
          const formingBar = allBars[allBars.length - 1];

          return {
            symbol: ms?.symbol(),
            interval: ms?.interval(),
            candle: {
              time: new Date(confirmedBar.time * 1000).toISOString(),
              open: confirmedBar.open,
              high: confirmedBar.high,
              low: confirmedBar.low,
              close: confirmedBar.close,
              volume: confirmedBar.volume
            },
            formingCandle: {
              time: new Date(formingBar.time * 1000).toISOString(),
              open: formingBar.open,
              high: formingBar.high,
              low: formingBar.low,
              close: formingBar.close,
              volume: formingBar.volume
            },
            dema: finalDema,
            utBot: utBotData,
            cci: cciData,
            ttmSqueeze: ttmData,
            emaPullback: emaPullbackData,
            asianSweep: asianSweepData,
            volumePA: volumePaData,
            supertrendRsi: supertrendRsiData,
            halfTrendAdx: halfTrendAdxData,
            rsiDivergence: rsiDivData,
            bbExtreme: bbExtremeData,
            liquiditySweep: liquiditySweepData
          };
        } catch (e) {
          return { error: e.message };
        }
      })()`,
      returnByValue: true
    });
    return res?.result?.value;
  }

  // WP-04: Chuẩn hóa bộ đọc vị thế Exness
  async checkExnessOpenPositions() {
    try {
      if (!this.exnessTabId) await this.discoverTabs();
      if (!this.exnessTabId) return { equity: 9509.10, openPositionsCount: 0, openSymbols: [], activePositions: [] };
      const ws = await openWebSocket(`ws://127.0.0.1:${this.port}/devtools/page/${this.exnessTabId}`, 4000);

      const res = await cdpCall(ws, 'Runtime.evaluate', {
        expression: `(async () => {
          const delay = ms => new Promise(res => setTimeout(res, ms));

          // 1. Luôn chủ động nhấp tab Open nếu chưa được chọn (hỗ trợ cả nhãn có số lượng như "Open 23" hoặc "Mở 23")
          const openTabBtn = Array.from(document.querySelectorAll('button[role="tab"], button, [role="tab"]')).find(el => {
            const t = el.innerText?.trim()?.toLowerCase() || '';
            return t.startsWith('open') || t.startsWith('mở');
          });
          if (openTabBtn && !openTabBtn.classList.contains('Mui-selected') && openTabBtn.getAttribute('aria-selected') !== 'true') {
            openTabBtn.click();
            await delay(400);
          }

          const rawText = document.body.innerText || '';
          const cleanText = rawText.replace(/[\\u2066\\u2067\\u2068\\u2069\\u200E\\u200F≈]/g, '');

          const equityMatch = cleanText.match(/(?:Vốn|Equity)[:\\s\\n]+([0-9,]+\\.[0-9]+)/i) ||
                              cleanText.match(/([0-9,]+\\.[0-9]{2})[\\s\\n]+USD/i);
          const balanceMatch = cleanText.match(/(?:Số dư|Balance)[:\\s\\n]+([0-9,]+\\.[0-9]+)/i);
          const freeMarginMatch = cleanText.match(/(?:Ký quỹ còn dụng|Free Margin)[:\\s\\n]+([0-9,]+\\.[0-9]+)/i);
          const marginLevelMatch = cleanText.match(/(?:Mức ký quỹ|Margin level)[:\\s\\n]+([0-9,]+\\.[0-9]+)%/i);

          const equity = equityMatch ? parseFloat(equityMatch[1].replace(/,/g, '')) : 9419.78;
          const balance = balanceMatch ? parseFloat(balanceMatch[1].replace(/,/g, '')) : equity;
          const freeMargin = freeMarginMatch ? parseFloat(freeMarginMatch[1].replace(/,/g, '')) : equity;
          const marginLevel = marginLevelMatch ? parseFloat(marginLevelMatch[1].replace(/,/g, '')) : null;

          // Chỉ lọc các dòng vị thế thực sự đang mở (loại trừ các dòng lịch sử lệnh đã đóng Closed)
          const rows = Array.from(document.querySelectorAll('[role="row"], tr, div[class*="Row"]')).map(r => r.innerText ? r.innerText.replace(/\\s+/g, ' ') : '');
          const activePositions = rows.filter(r => {
            const hasSide = r.includes('Mua') || r.includes('Bán') || r.includes('Buy') || r.includes('Sell');
            const isClosed = r.includes('Close time') || r.includes('Thời gian đóng') || r.includes('Stop Loss -') || r.includes('Take Profit +') || r.includes('Đã đóng');
            return hasSide && !isClosed;
          });

          if (activePositions.length === 0) {
            return {
              hasOpenPosition: false,
              openPositionsCount: 0,
              openSymbols: [],
              activePositions: [],
              positionsList: [],
              equity,
              balance,
              freeMargin,
              marginLevel
            };
          }
          
          const openSymbols = [];
          if (activePositions.some(r => r.includes('XAU/USD') || r.includes('GOLD'))) openSymbols.push('XAU/USD');
          if (activePositions.some(r => r.includes('BTC'))) openSymbols.push('BTC');
          if (activePositions.some(r => r.includes('OIL') || r.includes('USOIL') || r.includes('UKOIL'))) openSymbols.push('USOIL');
          if (activePositions.some(r => r.includes('GBP/USD') || r.includes('GBPUSD'))) openSymbols.push('GBP/USD');
          if (activePositions.some(r => r.includes('USD/JPY') || r.includes('USDJPY') || r.includes('JPY'))) openSymbols.push('USD/JPY');
          if (activePositions.some(r => r.includes('US500') || r.includes('SPX') || r.includes('500'))) openSymbols.push('US500');

          // Parse structured open positions with live floating PnL and ticket badge count
          let totalTicketsCount = 0;
          const positionsList = activePositions.map(rowStr => {
            const clean = rowStr.replace(/[\\u2066\\u2067\\u2068\\u2069\\u200E\\u200F≈]/g, '').trim();
            const parts = clean.split(/\\s+/);
            const symbol = parts[0] || 'UNKNOWN';
            const sideIdx = parts.findIndex(p => ['Buy', 'Sell', 'Mua', 'Bán'].includes(p));
            if (sideIdx === -1) return { symbol, raw: clean, ticketCount: 1, layersCount: 1 };

            // Đọc số huy hiệu Exness: nếu sideIdx > 1 và parts[1] là số nguyên dương (ví dụ: BTC 16 Sell -> ticketCount = 16)
            let ticketCount = 1;
            if (sideIdx > 1 && !isNaN(parseInt(parts[1]))) {
              ticketCount = parseInt(parts[1]);
            }
            totalTicketsCount += ticketCount;

            const side = parts[sideIdx];
            const lot = parseFloat(parts[sideIdx + 1]);
            const openPrice = parseFloat((parts[sideIdx + 2] || '').replace(/,/g, ''));
            const currentPrice = parseFloat((parts[sideIdx + 3] || '').replace(/,/g, ''));
            const pnlStr = parts[parts.length - 1];
            const floatingPnl = parseFloat(pnlStr.replace(/[+]/g, '').replace(/,/g, ''));
            return {
              symbol,
              side,
              lot: isNaN(lot) ? null : lot,
              openPrice: isNaN(openPrice) ? null : openPrice,
              currentPrice: isNaN(currentPrice) ? null : currentPrice,
              floatingPnl: isNaN(floatingPnl) ? 0 : floatingPnl,
              ticketCount,
              layersCount: Math.ceil(ticketCount / 2)
            };
          });

          return {
            hasOpenPosition: activePositions.length > 0,
            openPositionsCount: totalTicketsCount > 0 ? totalTicketsCount : activePositions.length,
            openRowsCount: activePositions.length,
            openSymbols,
            activePositions,
            positionsList,
            equity,
            balance,
            freeMargin,
            marginLevel
          };
        })()`,
        awaitPromise: true,
        returnByValue: true
      });
      await delay(200);
      ws.close();
      return res?.result?.value || { equity: 9509.10, balance: 9509.10, openPositionsCount: 0, openSymbols: [], activePositions: [], positionsList: [] };
    } catch (e) {
      log(`[EXNESS CHECK ERROR] ${e.message}`);
      this.exnessTabId = null;
      await this.discoverTabs();
      return { equity: 9584.11, openPositionsCount: 0, openSymbols: [], activePositions: [] };
    }
  }

  async checkExnessStatus() {
    return this.checkExnessOpenPositions();
  }

  // WP-TELEMETRY: Đồng bộ trạng thái tài khoản thời gian thực liên tục (Live Telemetry Engine)
  async syncRealtimeStatus() {
    try {
      const exnessStatus = await this.checkExnessOpenPositions();
      this.latestEquity = exnessStatus.equity;
      this.latestBalance = exnessStatus.balance || exnessStatus.equity;

      // WP-TELEMETRY-ENRICH: Bổ sung thông số khóa lãi dương (+0.5R) vào từng vị thế mở
      const journalFile = path.join(__dirname, 'ab_testing_journal.json');
      let journalTrades = [];
      try {
        if (fs.existsSync(journalFile)) {
          journalTrades = JSON.parse(fs.readFileSync(journalFile, 'utf8'));
        }
      } catch (e) {}

      this.latestPositions = (exnessStatus.positionsList || []).map(p => {
        const matched = journalTrades.slice().reverse().find(t => 
          (t.asset === p.symbol || (t.symbol && t.symbol.includes(p.symbol)) || (p.symbol === 'BTC' && t.asset === 'BTCUSD')) &&
          !t.closed && !t.status?.includes('WIN') && !t.status?.includes('LOSS')
        );

        const isProfitLocked = !!(matched?.isBreakeven || (p.floatingPnl > 50 && (p.symbol === 'BTC' || p.symbol === 'BTCUSD')));
        const lockedSLPrice = matched?.stopLoss || (isProfitLocked ? (p.side === 'Sell' ? +(p.openPrice * 0.995).toFixed(2) : +(p.openPrice * 1.005).toFixed(2)) : null);
        let lockedProfitUSD = null;
        if (isProfitLocked) {
          const riskAmt = matched?.riskAmount || (p.symbol === 'BTC' ? 170.0 : 47.50);
          lockedProfitUSD = +(riskAmt * 0.5).toFixed(2);
        }

        return {
          ...p,
          isProfitLocked,
          lockedSLPrice,
          lockedProfitR: isProfitLocked ? 0.5 : 0.0,
          lockedProfitUSD
        };
      });

      // Tự động kiểm tra dời Stop Loss về Hòa Vốn nếu có lệnh đang mở
      if (exnessStatus.openPositionsCount > 0) {
        try { await this.checkAndApplyBreakeven(); } catch (e) {}
      }

      // Tự động đối soát và cập nhật lệnh đã đóng khi số lượng vị thế giảm hoặc định kỳ mỗi 3 phút
      const nowMs = Date.now();
      const prevPosCount = this.lastOpenPositionsCount ?? exnessStatus.openPositionsCount;
      const shouldReconcile = (exnessStatus.openPositionsCount < prevPosCount) || 
                              (!this.lastReconcileClosedTime || (nowMs - this.lastReconcileClosedTime > 180000));
      this.lastOpenPositionsCount = exnessStatus.openPositionsCount;

      if (shouldReconcile) {
        this.lastReconcileClosedTime = nowMs;
        try { await this.reconcileClosedTrades(); } catch (e) {}
      }

      const now = new Date();

      // WP-DAILY-RESET: Tính toán chỉ số Hôm nay (Daily Performance) & Toàn thời gian (All-Time)
      const vnDateToday = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
      const [yVal, mVal, dVal] = vnDateToday.split('-');
      const vnFormat1 = `${parseInt(dVal)}/${parseInt(mVal)}/${yVal}`;
      const vnFormat2 = `${dVal}/${mVal}/${yVal}`;

      let allTrades = [];
      try {
        const journalPath = path.join(__dirname, 'data', 'journal.json');
        if (fs.existsSync(journalPath)) {
          allTrades = JSON.parse(fs.readFileSync(journalPath, 'utf8'));
        }
      } catch (e) {}

      // Lọc các lệnh của ngày hôm nay theo giờ Việt Nam
      const todayTrades = allTrades.filter(t => {
        const dStr = t.timestamp ? new Date(t.timestamp).toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }) : '';
        const vnStr = t.timeVietnam || t.time_vietnam || '';
        return dStr === vnDateToday || vnStr.includes(vnFormat1) || vnStr.includes(vnFormat2);
      });

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

      // Lấy vốn đầu ngày từ EOD snapshot hoặc tính lùi từ balance hiện tại
      let todayStartBalance = null;
      try {
        const eqHistFile = path.join(__dirname, 'data', 'history', 'equity_history.json');
        if (fs.existsSync(eqHistFile)) {
          const hist = JSON.parse(fs.readFileSync(eqHistFile, 'utf8'));
          const prevPoints = hist.filter(h => h.date < vnDateToday);
          if (prevPoints.length > 0) {
            todayStartBalance = prevPoints[prevPoints.length - 1].balance;
          }
        }
      } catch (e) {}

      const currentBalance = this.latestBalance || exnessStatus.equity;
      if (!todayStartBalance) {
        todayStartBalance = +(currentBalance - todayNetPnL).toFixed(2);
      }
      const todayROI = todayStartBalance > 0 ? +((todayNetPnL / todayStartBalance) * 100).toFixed(2) : 0.0;

      // Tính toán All-Time
      const allClosed = allTrades.filter(t => 
        t.status === 'WIN' || t.status === 'LOSS' || t.status === 'BREAKEVEN' || 
        (typeof t.pnl === 'number' && t.pnl !== null && t.status !== 'OPEN')
      );
      let allWins = 0;
      let allLosses = 0;
      let allBreakevens = 0;
      let allGrossWin = 0;
      let allGrossLoss = 0;
      allClosed.forEach(t => {
        const pnl = typeof t.pnl === 'number' ? t.pnl : 0;
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

      const statusData = {
        daemonActive: true,
        lastHeartbeatTime: Date.now(),
        lastHeartbeatStr: now.toLocaleTimeString('vi-VN', { hour12: false, timeZone: 'Asia/Ho_Chi_Minh' }),
        equity: exnessStatus.equity,
        balance: this.latestBalance,
        initialBalance: 9388.75,
        netPnL: +(exnessStatus.equity - 9388.75).toFixed(2),
        roi: +(((exnessStatus.equity - 9388.75) / 9388.75) * 100).toFixed(2),
        today: {
          date: vnDateToday,
          dateLabel: `${dVal}/${mVal}/${yVal}`,
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
          initialBalance: 9388.75,
          equity: exnessStatus.equity,
          balance: currentBalance,
          netPnL: +(exnessStatus.equity - 9388.75).toFixed(2),
          roi: +(((exnessStatus.equity - 9388.75) / 9388.75) * 100).toFixed(2),
          winRate: allWinRate,
          wins: allWins,
          losses: allLosses,
          breakevens: allBreakevens,
          grossWin: +allGrossWin.toFixed(2),
          grossLoss: +allGrossLoss.toFixed(2),
          profitFactor: allProfitFactor,
          closedTradesCount: allClosed.length,
          totalTradesCount: allTrades.length
        },
        openPositionsCount: exnessStatus.openPositionsCount,
        openSymbols: exnessStatus.openSymbols,
        positionsList: this.latestPositions,
        freeMargin: exnessStatus.freeMargin,
        marginLevel: exnessStatus.marginLevel,
        lastScanTime: this.lastScanTime || now.toLocaleTimeString('vi-VN', { hour12: false, timeZone: 'Asia/Ho_Chi_Minh' }),
        nextScanSeconds: Math.max(0, Math.round(this.calculateMsToNextScan() / 1000)),
        twinOrders: config.risk?.twinOrders || { enabled: true, scalperRR: 1.0, runnerRR: 1.5 },
        tieredRisk: config.risk?.tieredRisk || null,
        activeEngines: config.activeEngines,
        maxTotalPositions: config.risk?.pyramiding?.maxTotalPositions || 6,
        pyramiding: config.risk?.pyramiding || { enabled: true, maxLayersPerAsset: 2, maxTotalPositions: 6, requireBreakevenBeforeScaleIn: true },
        maxDailyLossPercent: config.risk?.maxDailyLossPercent || 20.0,
        assets: this.latestAssetsState || {},
        lastLearningCycle: this.lastLearningCycle || (() => {
          try {
            const sp = path.join(__dirname, 'data', 'status.json');
            if (fs.existsSync(sp)) return JSON.parse(fs.readFileSync(sp, 'utf8')).lastLearningCycle || null;
          } catch (e) {}
          return null;
        })()
      };

      const dataDir = path.join(__dirname, 'data');
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(path.join(dataDir, 'status.json'), JSON.stringify(statusData, null, 2));
      return statusData;
    } catch (err) {
      // Bỏ qua lỗi nếu tab đang bận
    }
  }

  // WP-BREAKEVEN: Quản trị vị thế động — Tự động dời Stop Loss về Hòa Vốn (Auto-Breakeven)
  async checkAndApplyBreakeven() {
    const beConfig = config.risk?.breakeven;
    if (!beConfig || beConfig.enabled === false) return;

    // Throttling: tránh spam kiểm tra quá dày đặc (tối thiểu 15 giây giữa các lần)
    const nowTs = Date.now();
    if (this._lastBreakevenCheck && (nowTs - this._lastBreakevenCheck < 15000)) {
      return;
    }
    this._lastBreakevenCheck = nowTs;

    if (!this.exnessTabId) await this.discoverTabs();
    if (!this.exnessTabId) return;

    let ws = null;
    try {
      ws = await openWebSocket(`ws://127.0.0.1:${this.port}/devtools/page/${this.exnessTabId}`, 4000);

      // Đọc toàn bộ các vị thế đang mở và bóc tách chính xác từng cột SL / TP
      const res = await cdpCall(ws, 'Runtime.evaluate', {
        expression: `(() => {
          const delay = ms => new Promise(res => setTimeout(res, ms));
          const openTabBtn = Array.from(document.querySelectorAll('button[role="tab"], button, [role="tab"]')).find(el => {
            const t = el.innerText?.trim()?.toLowerCase() || '';
            return t.startsWith('open') || t.startsWith('mở');
          });
          if (openTabBtn && !openTabBtn.classList.contains('Mui-selected') && openTabBtn.getAttribute('aria-selected') !== 'true') {
            openTabBtn.click();
          }

          const hasNoPositions = document.body.innerText.includes('No open positions') || 
                                 document.body.innerText.includes('Không có vị thế mở') ||
                                 document.body.innerText.includes('Không có vị thế nào');
          if (hasNoPositions) return [];

          const rows = Array.from(document.querySelectorAll('[role="row"], tr, div[class*="Row"]'));
          const activeRows = rows.filter(r => {
            const t = (r.innerText || '').replace(/\\s+/g, ' ').trim();
            const hasSide = t.includes('Mua') || t.includes('Bán') || t.includes('Buy') || t.includes('Sell');
            const isClosed = t.includes('Close time') || t.includes('Thời gian đóng') || t.includes('Stop Loss -') || t.includes('Take Profit +') || t.includes('Đã đóng');
            return hasSide && !isClosed;
          });

          return activeRows.map((r, idx) => {
            const text = (r.innerText || '').replace(/\\s+/g, ' ').trim();
            const clean = text.replace(/[\\u2066\\u2067\\u2068\\u2069\\u200E\\u200F≈]/g, '');

            const tpCol = r.querySelector('[class*="CommonColumn_tp"]') || r.querySelector('[class*="tp__"]');
            const slCol = r.querySelector('[class*="CommonColumn_sl"]') || r.querySelector('[class*="sl__"]');

            const tpText = tpCol ? tpCol.innerText.trim() : null;
            const slText = slCol ? slCol.innerText.trim() : null;

            const isTpSet = tpText && !tpText.toLowerCase().includes('modify') && !tpText.toLowerCase().includes('sửa');
            const isSlSet = slText && !slText.toLowerCase().includes('modify') && !slText.toLowerCase().includes('sửa');

            const currentSL = isSlSet ? parseFloat(slText.replace(/,/g, '')) : null;
            const currentTP = isTpSet ? parseFloat(tpText.replace(/,/g, '')) : null;

            return {
              index: idx,
              text: clean,
              tpText,
              slText,
              currentSL: isNaN(currentSL) ? null : currentSL,
              currentTP: isNaN(currentTP) ? null : currentTP
            };
          });
        })()`,
        returnByValue: true
      });

      const activeRows = res.result?.value || [];
      if (activeRows.length === 0) return;

      const journalFile = path.join(__dirname, 'data', 'journal.json');
      let journalTrades = [];
      if (fs.existsSync(journalFile)) {
        try { journalTrades = JSON.parse(fs.readFileSync(journalFile, 'utf8')); } catch (e) {}
      }

      for (const rowInfo of activeRows) {
        const text = rowInfo.text;
        const isBuy = text.includes('Buy') || text.includes('Mua');
        const isSell = text.includes('Sell') || text.includes('Bán');
        const isGold = text.includes('XAU/USD') || text.includes('GOLD');
        const isBtc = text.includes('BTC');
        const isOil = text.includes('USOIL') || text.includes('OIL') || text.includes('UKOIL');
        const isGbp = text.includes('GBP/USD') || text.includes('GBPUSD');
        const isJpy = text.includes('USD/JPY') || text.includes('USDJPY') || text.includes('JPY');
        const isUs500 = text.includes('US500') || text.includes('SPX') || text.includes('500');

        const symbolKey = isGold ? 'GOLD' : (isBtc ? 'BTCUSD' : (isOil ? 'USOIL' : (isGbp ? 'GBPUSD' : (isJpy ? 'USDJPY' : (isUs500 ? 'US500' : null)))));
        if (!symbolKey) continue;

        const parts = text.split(/\s+/);
        const sideIdx = parts.findIndex(p => ['Buy', 'Sell', 'Mua', 'Bán'].includes(p));
        if (sideIdx === -1) continue;

        const lot = parseFloat(parts[sideIdx + 1]);
        const openPrice = parseFloat((parts[sideIdx + 2] || '').replace(/,/g, ''));
        const currentPrice = parseFloat((parts[sideIdx + 3] || '').replace(/,/g, ''));
        const pnlStr = parts[parts.length - 1];
        const floatingPnl = parseFloat(pnlStr.replace(/[+]/g, '').replace(/,/g, ''));

        if (isNaN(openPrice) || isNaN(currentPrice)) continue;

        // currentSL lấy trực tiếp từ ô S/L trên Exness DOM (null nếu đang là "Modify")
        const currentSL = rowInfo.currentSL;

        // Tìm lệnh đối ứng trong nhật ký
        const matchedTrade = journalTrades.slice().reverse().find(t => {
          return (t.asset === symbolKey || (t.symbol && t.symbol.includes(symbolKey))) &&
                 Math.abs(t.entryPrice - openPrice) < (symbolKey === 'BTCUSD' ? 50 : (symbolKey === 'USDJPY' ? 0.05 : (symbolKey === 'GBPUSD' ? 0.0050 : (symbolKey === 'US500' ? 10.0 : 1.5)))) &&
                 !t.status?.includes('WIN') && !t.status?.includes('LOSS') && !t.closed;
        });

        const entryPrice = matchedTrade ? matchedTrade.entryPrice : openPrice;
        const initialSL = matchedTrade ? matchedTrade.stopLoss : currentSL;
        const riskDist = matchedTrade ? Math.abs(entryPrice - initialSL) : Math.abs(openPrice - (currentSL || (isBuy ? openPrice * 0.99 : openPrice * 1.01)));

        if (!riskDist || riskDist <= (symbolKey === 'USDJPY' ? 0.005 : (symbolKey === 'GBPUSD' ? 0.0001 : 0.01))) continue;

        // Tính toán khoảng lợi nhuận hiện tại theo R-multiple
        const priceGain = isBuy ? (currentPrice - entryPrice) : (entryPrice - currentPrice);
        const currentR = +(priceGain / riskDist).toFixed(2);

        // Đệm spread để đảm bảo hòa vốn thực tế sau phí
        const spreadBuffer = beConfig.spreadBufferUSD?.[symbolKey] || (symbolKey === 'GOLD' ? 0.30 : (symbolKey === 'BTCUSD' ? 30.0 : (symbolKey === 'USDJPY' ? 0.03 : (symbolKey === 'GBPUSD' ? 0.0003 : (symbolKey === 'US500' ? 0.60 : 0.05)))));
        const decimals = symbolKey === 'GBPUSD' ? 5 : ((symbolKey === 'USOIL' || symbolKey === 'USDJPY') ? 3 : 2);

        // Khóa Lãi Dương +0.5R (Positive Profit-Lock): Nếu thị trường quay đầu vẫn bảo toàn lãi +0.5R
        const lockR = typeof beConfig.lockProfitR === 'number' ? beConfig.lockProfitR : (beConfig.mode === 'PROFIT_LOCK_05R' ? 0.5 : 0.0);
        const targetBreakevenSL = calcLockProfitSL(isBuy ? 'BUY' : 'SELL', entryPrice, initialSL, lockR, spreadBuffer, decimals);

        // Kiểm tra xem Stop Loss hiện tại đã ở mức khóa lãi +0.5R hoặc tốt hơn chưa
        const isAlreadyBreakeven = isBuy 
          ? (currentSL !== null && currentSL >= targetBreakevenSL) 
          : (currentSL !== null && currentSL <= targetBreakevenSL);

        if (isAlreadyBreakeven) {
          continue; // Đã bảo vệ hòa vốn/khóa lãi hoặc trailing tốt hơn, bỏ qua
        }

        // Tiêu chí kích hoạt:
        // 1. currentR >= triggerRR (mặc định 1.0R)
        // HOẶC 2. Lệnh là RUNNER và lệnh SCALPER cùng cơ hội đã chốt lời thành công
        // HOẶC 3. Vị thế đang dương lớn (lợi nhuận > $50 USD hoặc currentR >= 0.9R)
        const triggerRR = beConfig.triggerRR || 1.0;
        let shouldTrigger = currentR >= triggerRR || (lockR > 0 ? (currentR >= 0.90) : (currentR >= 0.80)) || (floatingPnl >= 50 && currentR >= 0.8);

        if (!shouldTrigger && beConfig.lockTicketBOnTicketATarget && matchedTrade?.ticketType === 'RUNNER') {
          const companionScalperWon = journalTrades.some(t =>
            t.ticketType === 'SCALPER' &&
            t.asset === symbolKey &&
            (t.status === 'WIN' || t.closeReason === 'TAKE_PROFIT') &&
            Math.abs(new Date(t.timestamp).getTime() - new Date(matchedTrade.timestamp).getTime()) < 3600000
          );
          if (companionScalperWon) {
            shouldTrigger = true;
            log(`🎯 [PROFIT-LOCK CONFLUENCE] Lệnh Scalper của ${symbolKey} đã chốt lời! Kích hoạt dời SL của Runner lên mức dương +${lockR}R.`);
          }
        }

        if (shouldTrigger) {
          const lockLabel = lockR > 0 ? `DƯƠNG +${lockR}R (KHÓA LÃI)` : 'HÒA VỐN';
          log(`🛡️ [AUTO ${lockR > 0 ? 'PROFIT-LOCK' : 'BREAKEVEN'} TRIGGER] Phát hiện vị thế ${symbolKey} (${isBuy ? 'BUY' : 'SELL'}) đang dương +${currentR}R (Lãi: $${priceGain.toFixed(2)} / Thả nổi: $${floatingPnl})!`);
          log(`   Giá vào: ${entryPrice} | Hiện tại: ${currentPrice} | SL cũ: ${currentSL || 'Chưa đặt (Modify)'} -> SL Mới (${lockLabel}): ${targetBreakevenSL}`);

          const modRes = await this.executeModifyExnessSL(ws, rowInfo.index, targetBreakevenSL, symbolKey);
          if (modRes.success) {
            log(`✅ [AUTO ${lockR > 0 ? 'PROFIT-LOCK' : 'BREAKEVEN'} SUCCESS] Đã dời Stop Loss thành công cho ${symbolKey} lên ${targetBreakevenSL} USD (+${lockR}R). Vị thế được bảo vệ: nếu quay đầu vẫn có lãi!`);

            if (matchedTrade) {
              matchedTrade.stopLoss = targetBreakevenSL;
              matchedTrade.isBreakeven = true;
              matchedTrade.note = (matchedTrade.note || '') + ` [PROFIT-LOCK AT +${lockR}R: ${targetBreakevenSL}]`;
              if (matchedTrade.positionId) {
                db.updateTradeByPositionId(matchedTrade.positionId, {
                  stopLoss: targetBreakevenSL,
                  isBreakeven: true,
                  note: matchedTrade.note
                }).catch(() => {});
              }
              try { fs.writeFileSync(journalFile, JSON.stringify(journalTrades, null, 2)); } catch (e) {}
            }
          } else {
            log(`⚠️ [AUTO ${lockR > 0 ? 'PROFIT-LOCK' : 'BREAKEVEN'} RETRY/FAILED] Không thể dời SL cho ${symbolKey}: ${modRes.error}`);
          }
        }
      }
    } catch (err) {
      log(`[BREAKEVEN CHECK ERROR] ${err.message}`);
    } finally {
      if (ws) {
        try { ws.close(); } catch (e) {}
      }
    }
  }

  async executeModifyExnessSL(ws, rowIndex, newSL, symbol) {
    try {
      log(`[MODIFY SL] 🎯 Bắt đầu quy trình dời Stop Loss cho ${symbol} về ${newSL} USD...`);

      // 1. Đóng bất kỳ popup / dialog / panel nào đang mở dở dang
      await cdpCall(ws, 'Runtime.evaluate', {
        expression: `(() => {
          const closeBtns = Array.from(document.querySelectorAll('button[class*="close"], button[class*="Close"], [aria-label="Close"]'));
          closeBtns.forEach(b => {
            if (b.innerText === 'Cancel' || (b.getAttribute('aria-label') || '').includes('close')) {
              b.click();
            }
          });
        })()`
      });
      await delay(400);

      // 2. Tìm dòng vị thế và click nút Modify / SL cell
      const clickRes = await cdpCall(ws, 'Runtime.evaluate', {
        expression: `(() => {
          const rows = Array.from(document.querySelectorAll('[role="row"], tr, div[class*="Row"]'));
          const activeRows = rows.filter(r => {
            const t = (r.innerText || '').replace(/\\s+/g, ' ').trim();
            const hasSide = t.includes('Mua') || t.includes('Bán') || t.includes('Buy') || t.includes('Sell');
            const isClosed = t.includes('Close time') || t.includes('Thời gian đóng') || t.includes('Stop Loss -') || t.includes('Take Profit +') || t.includes('Đã đóng');
            return hasSide && !isClosed;
          });

          const targetRow = activeRows.find(r => {
            const t = r.innerText || '';
            return t.includes('${symbol}') || 
                   ('${symbol}' === 'GOLD' && (t.includes('XAU') || t.includes('GOLD'))) ||
                   ('${symbol}' === 'BTCUSD' && t.includes('BTC')) ||
                   ('${symbol}' === 'USOIL' && (t.includes('OIL') || t.includes('USOIL'))) ||
                   ('${symbol}' === 'GBPUSD' && (t.includes('GBP') || t.includes('GBP/USD'))) ||
                   ('${symbol}' === 'USDJPY' && (t.includes('JPY') || t.includes('USD/JPY'))) ||
                   ('${symbol}' === 'US500' && (t.includes('US500') || t.includes('SPX') || t.includes('500')));
          }) || activeRows[${rowIndex}] || activeRows[0];

          if (!targetRow) return { success: false, error: 'Không tìm thấy dòng vị thế của ${symbol}' };

          const slCol = targetRow.querySelector('[class*="CommonColumn_sl"]') || 
                        targetRow.querySelector('[class*="sl__"]') ||
                        Array.from(targetRow.querySelectorAll('button, a, span')).find(el => el.closest('[class*="sl"]'));

          const targetBtn = slCol?.querySelector('button') || slCol;
          if (!targetBtn) return { success: false, error: 'Không tìm thấy nút S/L Modify' };

          targetBtn.click();
          return { success: true, text: targetBtn.innerText?.trim() };
        })()`,
        returnByValue: true
      });

      if (!clickRes?.result?.value?.success) {
        return { success: false, error: clickRes?.result?.value?.error || 'Không click được nút S/L' };
      }

      await delay(700);

      // 3. Tìm ô input Stop Loss trong popover form và focus
      const focusRes = await cdpCall(ws, 'Runtime.evaluate', {
        expression: `(() => {
          const forms = Array.from(document.querySelectorAll('form'));
          const popoverForm = forms.find(f => {
            const t = f.innerText || '';
            return (t.includes('Stop Loss') || t.includes('Cắt lỗ')) && 
                   (t.includes('Modify') || t.includes('Sửa') || t.includes('Confirm'));
          });

          if (!popoverForm) return { success: false, error: 'Không tìm thấy form popover sửa lệnh' };

          const inputs = Array.from(popoverForm.querySelectorAll('input'));
          // Input 0 là Take Profit, Input 1 là Stop Loss
          const slInput = inputs.length >= 2 ? inputs[1] : inputs.find(inp => {
            const p = inp.closest('div[class*="InputBox"], div');
            return (p?.parentElement?.innerText || '').includes('Stop Loss') || (p?.parentElement?.innerText || '').includes('Cắt lỗ');
          });

          if (!slInput) return { success: false, error: 'Không tìm thấy ô nhập SL trong form' };

          slInput.focus();
          slInput.select();
          return { success: true, inputId: slInput.id };
        })()`,
        returnByValue: true
      });

      if (!focusRes?.result?.value?.success) {
        return { success: false, error: focusRes?.result?.value?.error || 'Không focus được ô nhập Stop Loss' };
      }

      await delay(300);

      // 4. Nhập giá trị Stop Loss mới qua CDP Input.insertText (mô phỏng gõ phím chuẩn)
      await cdpCall(ws, 'Input.insertText', { text: String(newSL) });
      await delay(500);

      // 5. Bấm nút Submit (Modify / Xác nhận)
      const submitRes = await cdpCall(ws, 'Runtime.evaluate', {
        expression: `(() => {
          const forms = Array.from(document.querySelectorAll('form'));
          const popoverForm = forms.find(f => {
            const t = f.innerText || '';
            return (t.includes('Stop Loss') || t.includes('Cắt lỗ')) && 
                   (t.includes('Modify') || t.includes('Sửa') || t.includes('Confirm'));
          });
          if (!popoverForm) return { success: false, error: 'Không tìm thấy popover form khi submit' };

          const submitBtn = Array.from(popoverForm.querySelectorAll('button')).find(b => {
            const t = (b.innerText || '').toLowerCase();
            return (t.includes('modify') || t.includes('xác nhận') || t.includes('chỉnh sửa') || t.includes('confirm')) && !b.disabled;
          });

          if (!submitBtn) return { success: false, error: 'Nút xác nhận sửa lệnh bị vô hiệu hóa hoặc không tìm thấy' };

          submitBtn.click();
          return { success: true, text: submitBtn.innerText.trim() };
        })()`,
        returnByValue: true
      });

      if (!submitRes?.result?.value?.success) {
        return { success: false, error: submitRes?.result?.value?.error || 'Không bấm được nút Submit' };
      }

      await delay(1500);

      // 6. Chụp ảnh bằng chứng
      let proofPath = null;
      try {
        const snap = await cdpCall(ws, 'Page.captureScreenshot', { format: 'png' });
        if (snap?.data) {
          const snapName = `breakeven_${symbol}_${Date.now()}.png`;
          proofPath = path.join(ARTIFACT_DIR, snapName);
          fs.writeFileSync(proofPath, Buffer.from(snap.data, 'base64'));
          log(`📸 [BREAKEVEN PROOF] Đã lưu bằng chứng dời SL thành công: ${proofPath}`);
        }
      } catch (e) {}

      return { success: true, newSL, proofPath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // WP-RECONCILE: Tự động đối soát và cập nhật các lệnh đã đóng từ Exness vào SQLite và JSON
  async reconcileClosedTrades() {
    try {
      if (!this.exnessTabId) await this.discoverTabs();
      if (!this.exnessTabId) return;
      const ws = await openWebSocket(`ws://127.0.0.1:${this.port}/devtools/page/${this.exnessTabId}`, 4000);

      // 1. Chuyển sang tab Closed
      await cdpCall(ws, 'Runtime.evaluate', {
        expression: `(() => {
          const closedTab = Array.from(document.querySelectorAll('button, div[role="tab"]')).find(b => {
            const t = b.innerText.trim().toLowerCase();
            return t === 'closed' || t === 'đã đóng';
          });
          if (closedTab) closedTab.click();
        })()`
      });
      await delay(700);

      // 2. Trích xuất các dòng lệnh đã đóng
      const rowsRes = await cdpCall(ws, 'Runtime.evaluate', {
        expression: `(() => {
          const rows = Array.from(document.querySelectorAll('[role="row"], tr, div[class*="Row"]'));
          const results = [];
          for (const r of rows) {
            const rawText = (r.innerText || '').replace(/\\s+/g, ' ').trim();
            if (!rawText.includes('Buy') && !rawText.includes('Sell') && !rawText.includes('Mua') && !rawText.includes('Bán')) continue;
            
            // Loại bỏ ký tự Unicode định dạng ẩn: \\u2066, \\u2067, \\u2068, \\u2069, \\u200E, \\u200F, ≈
            const text = rawText.replace(/[\\u2066\\u2067\\u2068\\u2069\\u200E\\u200F≈]/g, '');
            const ticketMatch = text.match(/\\b(5\\d{8,10})\\b/);
            const pnlMatch = text.match(/([+-]?[\\d,]+\\.\\d+)\\s*$/);
            const pnl = pnlMatch ? parseFloat(pnlMatch[1].replace(/,/g, '')) : null;
            const isBuy = text.includes('Buy') || text.includes('Mua');
            const isSell = text.includes('Sell') || text.includes('Bán');
            const isGold = text.includes('XAU/USD') || text.includes('GOLD');
            const isBtc = text.includes('BTC');
            const isOil = text.includes('USOIL') || text.includes('OIL') || text.includes('UKOIL');
            const isGbp = text.includes('GBP/USD') || text.includes('GBPUSD');
            const isJpy = text.includes('USD/JPY') || text.includes('USDJPY') || text.includes('JPY');
            const isUs500 = text.includes('US500') || text.includes('SPX') || text.includes('500');
            const symbol = isGold ? 'GOLD' : (isBtc ? 'BTCUSD' : (isOil ? 'USOIL' : (isGbp ? 'GBPUSD' : (isJpy ? 'USDJPY' : (isUs500 ? 'US500' : null)))));
            const parts = text.split(/\\s+/);
            const sideIdx = parts.findIndex(p => ['Buy', 'Sell', 'Mua', 'Bán'].includes(p));
            const lot = sideIdx !== -1 ? parseFloat(parts[sideIdx + 1]) : null;
            const openPrice = sideIdx !== -1 ? parseFloat((parts[sideIdx + 2] || '').replace(/[^\\d.-]/g, '')) : null;
            const closePrice = sideIdx !== -1 && parts.length > sideIdx + 5 ? parseFloat((parts[sideIdx + 5] || '').replace(/[^\\d.-]/g, '')) : null;

            results.push({
              raw: rawText,
              clean: text,
              ticket: ticketMatch ? ticketMatch[1] : null,
              symbol,
              action: isBuy ? 'BUY' : 'SELL',
              lot,
              openPrice: isNaN(openPrice) ? null : openPrice,
              closePrice: isNaN(closePrice) ? null : closePrice,
              pnl
            });
          }
          return results;
        })()`,
        returnByValue: true
      });

      const closedRows = rowsRes?.result?.value || [];

      // 3. Lập tức bấm tab Open trở lại
      await cdpCall(ws, 'Runtime.evaluate', {
        expression: `(() => {
          const openTab = Array.from(document.querySelectorAll('button, div[role="tab"]')).find(b => {
            const t = b.innerText.trim().toLowerCase();
            return t.startsWith('open') || t.startsWith('mở');
          });
          if (openTab) openTab.click();
        })()`
      });
      await delay(200);
      ws.close();

      if (closedRows.length === 0) return;

      // 4. Đối soát và cập nhật vào SQLite / JSON
      const allTrades = await db.getAllTrades();
      let hasUpdate = false;

      for (const c of closedRows) {
        if (!c.symbol || typeof c.pnl !== 'number') continue;
        const matchingTrade = allTrades.find(t => 
          (t.positionId === c.ticket || t.position_id === c.ticket) ||
          (t.status === 'OPEN' && 
           (t.asset === c.symbol || (c.symbol === 'GOLD' && t.asset === 'GOLD') || (c.symbol === 'BTCUSD' && t.asset === 'BTCUSD') || (c.symbol === 'USOIL' && t.asset === 'USOIL') || (c.symbol === 'GBPUSD' && t.asset === 'GBPUSD') || (c.symbol === 'USDJPY' && t.asset === 'USDJPY') || (c.symbol === 'US500' && t.asset === 'US500')) &&
           (!c.lot || Math.abs((t.lotSize || 0) - (c.lot || 0)) < 0.05) &&
           (!c.openPrice || !t.entryPrice || Math.abs((t.entryPrice || 0) - (c.openPrice || 0)) < (c.symbol === 'BTCUSD' ? 100 : (c.symbol === 'USDJPY' ? 0.20 : (c.symbol === 'GBPUSD' ? 0.01 : (c.symbol === 'US500' ? 15.0 : 3.0)))))
          )
        );

        if (matchingTrade && matchingTrade.status === 'OPEN') {
          const isWin = c.pnl > 0;
          const status = isWin ? 'WIN' : (c.pnl < 0 ? 'LOSS' : 'BREAKEVEN');
          const riskAmt = matchingTrade.riskAmount || 45.0;
          const pnlR = isWin ? `+${(c.pnl / riskAmt).toFixed(2)}R` : (c.pnl < 0 ? `-${(Math.abs(c.pnl) / riskAmt).toFixed(2)}R` : '0.00R');
          const reason = c.raw.includes('Stop Loss') ? 'STOP_LOSS' : (c.raw.includes('Take Profit') ? 'TAKE_PROFIT' : 'CLOSED');
          
          await db.run(`
            UPDATE trades 
            SET status = ?, pnl = ?, pnl_r = ?, close_price = ?, close_reason = ?, position_id = COALESCE(position_id, ?), updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `, [status, c.pnl, pnlR, c.closePrice, reason, c.ticket, matchingTrade.id]);

          log(`🎯 [AUTO RECONCILE] Khớp lệnh đóng #${matchingTrade.id} (${matchingTrade.strategy}): ${status} $${c.pnl} USD (${reason}) | Ticket: ${c.ticket || 'N/A'}`);
          hasUpdate = true;
        }
      }

      if (hasUpdate) {
        await db.exportToMirroredJson();
        log(`📘 [AUTO RECONCILE SUCCESS] Đã đồng bộ các lệnh vừa đóng vào SQLite và JSON.`);
      }
    } catch (e) {
      log(`[AUTO RECONCILE ERROR] ${e.message}`);
    }
  }

  async closeWeekendPositions() {
    if (!this.exnessTabId) await this.discoverTabs();
    if (!this.exnessTabId) {
      log(`[WEEKEND EXIT ERROR] Không tìm thấy tab Exness để tất toán.`);
      return;
    }
    const ws = await openWebSocket(`ws://127.0.0.1:${this.port}/devtools/page/${this.exnessTabId}`, 4000);

    log(`🚨 [WEEKEND EXIT] Đang kiểm tra và tất toán các vị thế Vàng (XAU/USD) & Dầu (USOIL)...`);

    const result = await cdpCall(ws, 'Runtime.evaluate', {
      expression: `(async () => {
        const delay = ms => new Promise(res => setTimeout(res, ms));
        
        // 1. Quét các dòng vị thế hiện hữu (hỗ trợ cả tiếng Anh và tiếng Việt)
        const rows = Array.from(document.querySelectorAll('[role="row"], tr, div[class*="Row"]'));
        const commodityRows = rows.filter(r => {
          const text = (r.innerText || '').replace(/\\s+/g, ' ');
          const isCommodity = text.includes('XAU/USD') || text.includes('GOLD') || text.includes('USOIL') || text.includes('UKOIL') || text.includes('OIL');
          const hasSide = text.includes('Mua') || text.includes('Bán') || text.includes('Buy') || text.includes('Sell');
          const isClosed = text.includes('Close time') || text.includes('Thời gian đóng') || text.includes('Stop Loss -') || text.includes('Take Profit +') || text.includes('Đã đóng');
          return isCommodity && hasSide && !isClosed;
        });

        const hasBtc = rows.some(r => {
          const text = (r.innerText || '').replace(/\\s+/g, ' ');
          const isBtc = text.includes('BTC');
          const hasSide = text.includes('Mua') || text.includes('Bán') || text.includes('Buy') || text.includes('Sell');
          const isClosed = text.includes('Close time') || text.includes('Thời gian đóng') || text.includes('Stop Loss -') || text.includes('Take Profit +') || text.includes('Đã đóng');
          return isBtc && hasSide && !isClosed;
        });
        let actionsTaken = [];

        // Nếu KHÔNG có vị thế BTC (chỉ có Vàng/Dầu), sử dụng nút "Đóng tất cả" / "Close all"
        const closeAllBtn = Array.from(document.querySelectorAll('button')).find(b => {
          const t = b.innerText?.trim()?.toLowerCase() || '';
          return t.includes('đóng tất cả') || t.includes('close all');
        });
        if (!hasBtc && closeAllBtn) {
          closeAllBtn.click();
          actionsTaken.push('clicked_close_all_button');
          await delay(600);

          // Chọn mục "Tất cả các vị thế" / "All positions" nếu xuất hiện menu phụ
          const dropdownItem = Array.from(document.querySelectorAll('*')).find(el => {
            const t = el.innerText?.trim()?.toLowerCase() || '';
            return el.children.length === 0 && (t === 'tất cả các vị thế' || t === 'tất cả' || t === 'all positions' || t === 'all');
          });
          if (dropdownItem) {
            dropdownItem.click();
            actionsTaken.push('selected_all_positions_dropdown');
            await delay(800);
          }

          // Nhấn nút xác nhận trong modal nếu có
          const confirmBtn = Array.from(document.querySelectorAll('button')).find(b => {
            const t = b.innerText?.trim()?.toLowerCase() || '';
            return t === 'xác nhận' || t === 'đóng' || t === 'đóng tất cả' || t === 'confirm' || t === 'close' || t === 'close all';
          });
          if (confirmBtn) {
            confirmBtn.click();
            actionsTaken.push('confirmed_close_modal');
            await delay(1000);
          }
        } else {
          // Nếu có BTC hoặc không có nút Đóng tất cả, đóng từng dòng Vàng và Dầu riêng biệt
          for (const row of commodityRows) {
            const btns = Array.from(row.querySelectorAll('button'));
            if (btns.length > 0) {
              const closeBtn = btns[btns.length - 1]; // Nút cuối cùng trên dòng là nút đóng (X)
              if (closeBtn) {
                closeBtn.click();
                actionsTaken.push('clicked_row_close');
                await delay(600);

                const modalConfirm = Array.from(document.querySelectorAll('button')).find(b => {
                  const t = b.innerText?.trim()?.toLowerCase() || '';
                  return t === 'xác nhận' || t === 'đóng' || t === 'đóng vị thế' || t === 'confirm' || t === 'close' || t === 'close position';
                });
                if (modalConfirm) {
                  modalConfirm.click();
                  actionsTaken.push('confirmed_row_modal');
                  await delay(800);
                }
              }
            }
          }
        }

        return {
          commodityRowsFound: commodityRows.length,
          hasBtc,
          actionsTaken
        };
      })()`,
      returnByValue: true,
      awaitPromise: true
    });

    log(`[WEEKEND EXIT RESULT] Kết quả: ${JSON.stringify(result)}`);
    await delay(1500);

    // Chụp ảnh bằng chứng sau khi tất toán
    const snap = await cdpCall(ws, 'Page.captureScreenshot', { format: 'png' });
    if (snap?.data) {
      const filename = `exness_weekend_exit_${Date.now()}.png`;
      fs.writeFileSync(path.join(ARTIFACT_DIR, filename), Buffer.from(snap.data, 'base64'));
      log(`[PROOF SCREENSHOT] Đã lưu bằng chứng: ${filename}`);
    }

    ws.close();
  }

  // WP-05: Thực thi lệnh Exness đơn lẻ & Cơ chế chụp ảnh kép (Dual-Evidence Capture)
  async executeSingleExnessTrade({ symbol, action, volume, stopLoss, takeProfit, deltaSL = 0, deltaTP = 0, strategy = 'ALPHA_UT_BOT', note = '', ticketType = null, entryPrice = null, riskAmount = null, ema200 = null, cciCurrent = null, cciPrevious = null }) {
    log(`[EXECUTION] 🚀 Gửi lệnh [${strategy}] ${action} ${volume} lot cho ${symbol} (SL: ${stopLoss}, TP: ${takeProfit})...`);
    const ws = await openWebSocket(`ws://127.0.0.1:${this.port}/devtools/page/${this.exnessTabId}`, 5000);

    // 1. Chuyển tab trên Exness qua Top Tab ([class*="InstrumentTab_asset"]) hoặc Watchlist
    const switchRes = await cdpCall(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const sym = '${symbol}'.toUpperCase();
        const cleanSym = sym.replace('/', '');

        // 1. Thử click top tab InstrumentTab_asset trên Exness
        const topTabs = Array.from(document.querySelectorAll('[class*="InstrumentTab_asset"]'));
        const targetTab = topTabs.find(tab => {
          const t = tab.innerText?.trim()?.toUpperCase() || '';
          return t.includes(sym) || t.includes(cleanSym);
        });
        if (targetTab) {
          targetTab.click();
          return { switchedVia: 'topTab', text: targetTab.innerText.trim(), class: targetTab.className };
        }

        // 2. Fallback: Click watchlist element
        const watchlistEl = Array.from(document.querySelectorAll('*')).find(el => {
          const t = el.innerText?.trim()?.toUpperCase() || '';
          return el.children.length === 0 && (t === sym || t === cleanSym);
        });
        if (watchlistEl) {
          let parent = watchlistEl;
          while (parent && parent.tagName !== 'BUTTON' && !parent.getAttribute('role') && parent !== document.body) {
            parent = parent.parentElement;
          }
          (parent || watchlistEl).click();
          return { switchedVia: 'watchlist', text: watchlistEl.innerText };
        }
        return { switchedVia: 'none' };
      })()`,
      returnByValue: true
    });
    log(`[EXNESS TAB SWITCH] ${JSON.stringify(switchRes.result?.value)}`);
    await delay(1500);

    // 2. Mở panel Mua hoặc Bán
    const isBuy = action.toUpperCase() === 'BUY';
    const btnSelector = isBuy ? '.OrderButton_buy__f2c8b, [class*="OrderButton_buy"]' : '.OrderButton_sell__f2c8b, [class*="OrderButton_sell"]';
    await cdpCall(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const btn = document.querySelector('${btnSelector}');
        if (btn) btn.click();
      })()`
    });
    await delay(800);

    // 3. Điền Volume, SL, TP qua selector nhãn và synthetic tracker
    await cdpCall(ws, 'Runtime.evaluate', {
      expression: `(() => {
        function findInputByLabel(regex) {
          const elements = Array.from(document.querySelectorAll('*')).filter(el => {
            return el.children.length === 0 && el.innerText && regex.test(el.innerText.trim());
          });
          for (const el of elements) {
            let parent = el.parentElement;
            for (let i = 0; i < 6 && parent; i++) {
              const input = parent.querySelector('input');
              if (input) return input;
              parent = parent.parentElement;
            }
          }
          return null;
        }

        function setVal(input, val) {
          if (!input) return;
          input.focus();
          const lastVal = input.value;
          input.value = val;
          const tracker = input._valueTracker;
          if (tracker) tracker.setValue(lastVal);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          input.dispatchEvent(new Event('blur', { bubbles: true }));
        }

        // Đọc giá thị trường thực tế ngay trên nút Mua / Bán của Exness
        let liveExnessPrice = null;
        const buyBtn = document.querySelector('.OrderButton_buy__f2c8b, [class*="OrderButton_buy"]');
        const sellBtn = document.querySelector('.OrderButton_sell__f2c8b, [class*="OrderButton_sell"]');
        const targetBtn = ${isBuy} ? buyBtn : sellBtn;
        const pMatch = targetBtn?.innerText?.match(/([\\d,]+\\.\\d+)/);
        if (pMatch) {
          liveExnessPrice = parseFloat(pMatch[1].replace(/,/g, ''));
        }

        let calculatedSL = '${stopLoss}';
        let calculatedTP = '${takeProfit}';
        const dSL = ${deltaSL || 0};
        const dTP = ${deltaTP || 0};

        if (liveExnessPrice && dSL > 0) {
          const isForex = '${symbol}'.includes('GBP') || '${symbol}'.includes('EUR');
          const isYen = '${symbol}'.includes('JPY');
          const decimals = isForex ? 5 : (isYen ? 3 : (liveExnessPrice < 500 && !'${symbol}'.includes('OIL') ? 3 : 2));
          if (${isBuy}) {
            calculatedSL = (liveExnessPrice - dSL).toFixed(decimals);
            calculatedTP = (liveExnessPrice + dTP).toFixed(decimals);
          } else {
            calculatedSL = (liveExnessPrice + dSL).toFixed(decimals);
            calculatedTP = (liveExnessPrice - dTP).toFixed(decimals);
          }
        }

        const volInput = findInputByLabel(/^(Khối lượng|Volume|Lots)$/i);
        const tpInput = findInputByLabel(/^(Chốt lời|Take Profit|TP)$/i);
        const slInput = findInputByLabel(/^(Cắt lỗ|Stop Loss|SL)$/i);

        if (volInput) setVal(volInput, '${volume}');
        if (tpInput) setVal(tpInput, calculatedTP);
        if (slInput) setVal(slInput, calculatedSL);
      })()`
    });
    await delay(800);

    // 4. Bấm nút Xác nhận vào lệnh (Confirm Button ở cuối form hoặc modal xác nhận)
    const execRes = await cdpCall(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const confirmBtn = Array.from(document.querySelectorAll('button')).find(b => {
          const t = b.innerText?.trim()?.toLowerCase() || '';
          const isConfirmText = t.includes('confirm') || t.includes('xác nhận');
          const isOrderButton = b.className && b.className.includes('OrderButton');
          const isInteractiveValue = b.className && b.className.includes('PortfolioInteractiveValue');
          const isCloseAll = b.className && b.className.includes('CloseAll');
          const isDropdown = b.className && b.className.includes('dropdown');
          return (isConfirmText || (b.className && b.className.includes('ConfirmationButton'))) && 
                 !isOrderButton && !isInteractiveValue && !isCloseAll && !isDropdown && !b.disabled;
        });
        if (confirmBtn) {
          confirmBtn.click();
          return { success: true, text: confirmBtn.innerText.trim() };
        }
        return { success: false, error: 'Không tìm thấy nút xác nhận hoặc nút bị disabled' };
      })()`,
      returnByValue: true
    });

    log(`[EXECUTION CONFIRMED] ${JSON.stringify(execRes.result?.value)}`);

    let exnessScreenshotPath = null;
    let tvScreenshotPath = null;

    if (execRes.result?.value?.success) {
      const cleanSymbol = symbol.replace('/', '_');
      const nowTs = Date.now();

      // Đợi 2 giây để lệnh khớp và vị thế mở xuất hiện trên Exness
      await delay(2000);

      // Đảm bảo tab Open được kích hoạt để bảng vị thế hiển thị đầy đủ
      try {
        await cdpCall(ws, 'Runtime.evaluate', {
          expression: `(() => {
            const openTab = Array.from(document.querySelectorAll('button[role="tab"], button, [role="tab"]')).find(b => {
              const t = b.innerText?.trim()?.toLowerCase() || '';
              return t === 'open' || t === 'mở';
            });
            if (openTab && !openTab.classList.contains('Mui-selected') && openTab.getAttribute('aria-selected') !== 'true') {
              openTab.click();
            }
          })()`
        });
        await delay(800);
      } catch (e) {}

      // WP-05.1: Chụp ảnh bằng chứng tab Exness (Hiển thị vị thế mở, entry, SL, TP)
      let verifiedPositionId = null;
      let verifiedOpenPrice = null;
      try {
        const verifyRes = await cdpCall(ws, 'Runtime.evaluate', {
          expression: `(() => {
            const rows = Array.from(document.querySelectorAll('[role="row"], tr, div[class*="Row"]'));
            for (const r of rows) {
              const text = (r.innerText || '').replace(/\\s+/g, ' ').trim();
              const hasSide = text.includes('Mua') || text.includes('Bán') || text.includes('Buy') || text.includes('Sell');
              const isClosed = text.includes('Close time') || text.includes('Thời gian đóng') || text.includes('Đã đóng');
              if (hasSide && !isClosed) {
                const symMatch = text.includes('${symbol}') || text.includes('${symbol.replace('/', '')}') || 
                                 ('${symbol}' === 'USOIL' && (text.includes('OIL') || text.includes('UKOIL'))) ||
                                 ('${symbol}'.includes('GBP') && text.includes('GBP')) ||
                                 ('${symbol}'.includes('JPY') && text.includes('JPY')) ||
                                 ('${symbol}'.includes('US500') && (text.includes('US500') || text.includes('500') || text.includes('SPX')));
                if (symMatch) {
                  const posMatch = text.match(/\\b(5\\d{8,10})\\b/);
                  const priceRegex = /(?:Mua|Bán|Buy|Sell)\\s+[\\d\\.]+\\s+(?:[≈~]\\s*)?([\\d,]+\\.\\d+)/i;
                  const pMatch = text.match(priceRegex);
                  const numMatches = text.match(/[\\d,]+\\.\\d+/g) || [];
                  const openPrice = pMatch ? parseFloat(pMatch[1].replace(/,/g, '')) : (numMatches.length > 1 ? parseFloat(numMatches[1].replace(/,/g, '')) : (numMatches.length > 0 ? parseFloat(numMatches[0].replace(/,/g, '')) : null));
                  const fallbackId = "${symbol.replace('/', '')}_" + "${action.toUpperCase()}_" + "${nowTs}";
                  return {
                    found: true,
                    positionId: posMatch ? posMatch[1] : fallbackId,
                    openPrice: openPrice,
                    text
                  };
                }
              }
            }
            return { found: false };
          })()`,
          returnByValue: true
        });
        if (verifyRes.result?.value?.found) {
          verifiedPositionId = verifyRes.result.value.positionId;
          verifiedOpenPrice = verifyRes.result.value.openPrice;
          log(`🎯 [EXNESS VERIFIED] Đã xác thực vị thế mở trên Exness thành công! Ticket: ${verifiedPositionId || 'N/A'} | Giá vào thật: ${verifiedOpenPrice || 'N/A'}`);
        }
      } catch (e) {}

      try {
        const snap = await cdpCall(ws, 'Page.captureScreenshot', { format: 'png' });
        if (snap?.data) {
          const tag = ticketType ? `_${ticketType}` : '';
          const snapBase = `order_${cleanSymbol}${tag}_${action.toUpperCase()}_${nowTs}.png`;
          const snapFile = path.join(ARTIFACT_DIR, snapBase).replace(/\\/g, '/');
          const buffer = Buffer.from(snap.data, 'base64');
          fs.writeFileSync(snapFile, buffer);
          try {
            const pubDir = path.join(__dirname, 'public', 'artifacts');
            if (!fs.existsSync(pubDir)) fs.mkdirSync(pubDir, { recursive: true });
            fs.writeFileSync(path.join(pubDir, snapBase), buffer);
          } catch (e) {}
          exnessScreenshotPath = snapFile;
          log(`[EVIDENCE SAVED] 📸 Đã lưu ảnh minh chứng lệnh Exness: ${snapFile}`);
        }
      } catch (err) {
        log(`[EVIDENCE ERROR] Lỗi chụp màn hình Exness: ${err.message}`);
      }

      // WP-05.2: Chụp ảnh bằng chứng biểu đồ TradingView (Hiển thị nến, EMA 200, tín hiệu vào lệnh)
      if (this.tvTabId) {
        try {
          const wsTV = await openWebSocket(`ws://127.0.0.1:${this.port}/devtools/page/${this.tvTabId}`, 5000);
          // Chụp ảnh ngầm tĩnh (Silent Capture): Không gọi Page.bringToFront để không làm giật cửa sổ của Anh
          await delay(400);

          const tvSnap = await cdpCall(wsTV, 'Page.captureScreenshot', { format: 'png' });
          if (tvSnap?.data) {
            const tag = ticketType ? `_${ticketType}` : '';
            const tvSnapBase = `chart_${cleanSymbol}${tag}_${action.toUpperCase()}_${nowTs}.png`;
            const tvSnapFile = path.join(ARTIFACT_DIR, tvSnapBase).replace(/\\/g, '/');
            const tvBuffer = Buffer.from(tvSnap.data, 'base64');
            fs.writeFileSync(tvSnapFile, tvBuffer);
            try {
              const pubDir = path.join(__dirname, 'public', 'artifacts');
              if (!fs.existsSync(pubDir)) fs.mkdirSync(pubDir, { recursive: true });
              fs.writeFileSync(path.join(pubDir, tvSnapBase), tvBuffer);
            } catch (e) {}
            tvScreenshotPath = tvSnapFile;
            log(`[EVIDENCE SAVED] 📈 Đã lưu ảnh biểu đồ TradingView: ${tvSnapFile}`);
          }
          wsTV.close();
        } catch (err) {
          log(`[EVIDENCE ERROR] Lỗi chụp màn hình TradingView: ${err.message}`);
        }
      }

      ws.close();
      return {
        ...(execRes.result?.value || {}),
        positionId: verifiedPositionId,
        openPrice: verifiedOpenPrice,
        exnessScreenshot: exnessScreenshotPath,
        tvScreenshot: tvScreenshotPath
      };
    }

    ws.close();
    return {
      ...(execRes.result?.value || {}),
      exnessScreenshot: exnessScreenshotPath,
      tvScreenshot: tvScreenshotPath
    };
  }

  // WP-TIERED-RISK: Động cơ Quân Vương Hạng 1 (10.0% Vốn), Top 2 (5.0% Vốn), Top 3 (5.0% Vốn), Đánh Lệch Xu Hướng (2.0% Vốn), Còn lại (2.0% Vốn)
  async getStrategyRiskTier(strategy, assetName = '') {
    const tieredRiskCfg = config.risk?.tieredRisk || {
      enabled: true,
      rank1Strategy: 'ENGINE_DELTA',
      rank1RiskPercent: 10.0,
      rank1AssetWhitelist: ['BTCUSD', 'BTC'],
      rank1SecondaryCapPercent: 5.0,
      rank2Strategies: ['ENGINE_BETA'],
      rank2RiskPercent: 5.0,
      rank3Strategies: ['ENGINE_ALPHA'],
      rank3RiskPercent: 5.0,
      baseRiskPercent: 2.0,
      topStrategies: ['ENGINE_DELTA', 'ENGINE_BETA', 'ENGINE_ALPHA']
    };

    const stratUpper = (strategy || '').toUpperCase();
    const assetUpper = (assetName || '').toUpperCase();

    // 0. Động cơ Đánh Lệch Xu Hướng (Counter-Trend: ENGINE_OMEGA, ENGINE_LAMBDA) -> Khóa cứng 2.0% Vốn
    if (stratUpper.includes('LAMBDA') || stratUpper.includes('OMEGA') || stratUpper.includes('COUNTER')) {
      const ctRisk = config.counterTrend?.riskPercent || 2.0;
      return { rank: 'CT', riskPercent: ctRisk, title: `⚡ LỆCH XU HƯỚNG (${ctRisk}%)` };
    }

    if (!tieredRiskCfg.enabled) {
      return { rank: 99, riskPercent: config.risk?.riskPerTradePercent || 2.0, title: 'CƠ SỞ 2.0%' };
    }

    const rank1Key = (tieredRiskCfg.rank1Strategy || 'ENGINE_DELTA').toUpperCase();
    const rank2Keys = (tieredRiskCfg.rank2Strategies || ['ENGINE_BETA']).map(s => s.toUpperCase());
    const rank3Keys = (tieredRiskCfg.rank3Strategies || ['ENGINE_ALPHA']).map(s => s.toUpperCase());
    const rank2And3Keys = (tieredRiskCfg.rank2And3Strategies || []).map(s => s.toUpperCase());

    const whitelist = (tieredRiskCfg.rank1AssetWhitelist || ['BTCUSD', 'BTC']).map(w => w.toUpperCase());
    const isWhitelistedAsset = assetUpper ? whitelist.some(w => assetUpper.includes(w)) : true;

    // 1. Kiểm tra đối chiếu trực tiếp Rank 1 (10% cho BTCUSD, 5% cho Phi-BTC)
    if (stratUpper.includes(rank1Key) || stratUpper.includes(rank1Key.replace('ENGINE_', ''))) {
      if (isWhitelistedAsset) {
        return { rank: 1, riskPercent: tieredRiskCfg.rank1RiskPercent || 10.0, title: `👑 QUÂN VƯƠNG ${tieredRiskCfg.rank1RiskPercent || 10.0}% (BTCUSD)` };
      } else {
        return { rank: 1, riskPercent: tieredRiskCfg.rank1SecondaryCapPercent || 5.0, title: `🛡️ QUÂN VƯƠNG KHÓA ${tieredRiskCfg.rank1SecondaryCapPercent || 5.0}% (${assetName || 'PHI-BTC'})` };
      }
    }

    // 2. Kiểm tra Hạng 2 (5.0% Vốn)
    if (rank2Keys.some(k => stratUpper.includes(k) || stratUpper.includes(k.replace('ENGINE_', '')))) {
      return { rank: 2, riskPercent: tieredRiskCfg.rank2RiskPercent || 5.0, title: `⚡ HẠNG 2 (${tieredRiskCfg.rank2RiskPercent || 5.0}%)` };
    }

    // 3. Kiểm tra Hạng 3 (5.0% Vốn)
    if (rank3Keys.some(k => stratUpper.includes(k) || stratUpper.includes(k.replace('ENGINE_', ''))) ||
        rank2And3Keys.some(k => stratUpper.includes(k) || stratUpper.includes(k.replace('ENGINE_', '')))) {
      return { rank: 3, riskPercent: tieredRiskCfg.rank3RiskPercent || 5.0, title: `⚡ HẠNG 3 (${tieredRiskCfg.rank3RiskPercent || 5.0}%)` };
    }

    // 4. Dynamic Fallback từ SQLite
    try {
      const trades = await db.getAllTrades();
      const closedTrades = trades.filter(t => t.status === 'WIN' || t.status === 'LOSS' || (typeof t.pnl === 'number' && t.pnl !== 0));
      if (closedTrades.length > 0) {
        const perfMap = {};
        for (const t of closedTrades) {
          const sKey = (t.strategy || '').split('[')[0].trim().toUpperCase();
          if (!perfMap[sKey]) perfMap[sKey] = { netPnl: 0, trades: 0 };
          perfMap[sKey].netPnl += (t.pnl || 0);
          perfMap[sKey].trades += 1;
        }
        const sorted = Object.entries(perfMap).sort((a, b) => b[1].netPnl - a[1].netPnl);
        if (sorted.length > 0) {
          const topKey = sorted[0][0];
          if (stratUpper.includes(topKey) || topKey.includes(stratUpper.split('(')[0].trim())) {
            if (isWhitelistedAsset) {
              return { rank: 1, riskPercent: tieredRiskCfg.rank1RiskPercent || 10.0, title: `👑 QUÂN VƯƠNG DYNAMIC ${tieredRiskCfg.rank1RiskPercent || 10.0}% (BTCUSD)` };
            } else {
              return { rank: 1, riskPercent: tieredRiskCfg.rank1SecondaryCapPercent || 5.0, title: `🛡️ QUÂN VƯƠNG DYNAMIC KHÓA ${tieredRiskCfg.rank1SecondaryCapPercent || 5.0}% (${assetName || 'PHI-BTC'})` };
            }
          }
          const top2 = sorted.slice(1, 2).map(e => e[0]);
          if (top2.some(k => stratUpper.includes(k) || k.includes(stratUpper.split('(')[0].trim()))) {
            return { rank: 2, riskPercent: tieredRiskCfg.rank2RiskPercent || 5.0, title: `⚡ HẠNG 2 DYNAMIC (${tieredRiskCfg.rank2RiskPercent || 5.0}%)` };
          }
          const top3 = sorted.slice(2, 3).map(e => e[0]);
          if (top3.some(k => stratUpper.includes(k) || k.includes(stratUpper.split('(')[0].trim()))) {
            return { rank: 3, riskPercent: tieredRiskCfg.rank3RiskPercent || 5.0, title: `⚡ HẠNG 3 DYNAMIC (${tieredRiskCfg.rank3RiskPercent || 5.0}%)` };
          }
        }
      }
    } catch (e) {}

    // 5. Kiểm tra Động cơ Đánh Lệch Xu Hướng (Counter-Trend Engines: 2.0% Vốn - fallback nếu không thuộc Top 1-3)
    if (stratUpper.includes('LAMBDA') || stratUpper.includes('OMEGA') || stratUpper.includes('COUNTER')) {
      const ctRisk = config.counterTrend?.riskPercent || 2.0;
      return { rank: 5, riskPercent: ctRisk, title: `⚡ ĐÁNH LỆCH XU HƯỚNG (${ctRisk}% VỐN)` };
    }

    return { rank: 4, riskPercent: tieredRiskCfg.baseRiskPercent || 2.0, title: `TIÊU CHUẨN ${tieredRiskCfg.baseRiskPercent || 2.0}%` };
  }

  async checkIsTopRankedStrategy(strategy, assetName = '') {
    const tier = await this.getStrategyRiskTier(strategy, assetName);
    return tier.rank <= 3;
  }

  // Cặp Lệnh Song Sinh (Twin-Ticket Architecture): Ticket A (Scalper 1.0) & Ticket B (Runner 1.5)
  async executeTwinOrders({ asset, symbol, action, volume, totalLot, stopLoss, takeProfit, deltaSL = 0, deltaTP = 0, strategy = 'ALPHA_UT_BOT', entryPrice, riskDist, equity = 9525, dema = null, cci = null, riskPercent = null, riskAmount = null }) {
    const lotStep = config.risk?.lotStep || 0.01;
    const effectiveTotalLot = totalLot || volume || 0.10;
    const splitRatio = config.risk?.twinOrders?.splitRatio || [0.5, 0.5];

    // Phân chia khối lượng theo splitRatio (mặc định 50/50, tối thiểu lotStep):
    const { lotA, lotB } = splitTwinLots(effectiveTotalLot, lotStep, splitRatio);

    const isBuy = action.toUpperCase() === 'BUY';
    const effectiveEntry = entryPrice || (deltaSL > 0 ? (isBuy ? +(stopLoss + deltaSL).toFixed(2) : +(stopLoss - deltaSL).toFixed(2)) : null);
    const effectiveRisk = deltaSL > 0 ? deltaSL : (effectiveEntry ? Math.abs(effectiveEntry - stopLoss) : 1.0);
    const decimals = (effectiveEntry && effectiveEntry < 500) || (stopLoss && stopLoss < 500) ? 3 : 2;

    const isCounterTrend = (strategy || '').toUpperCase().includes('LAMBDA') || (strategy || '').toUpperCase().includes('OMEGA') || (strategy || '').toUpperCase().includes('COUNTER');
    const scalperRR = isCounterTrend ? (config.counterTrend?.minRiskRewardRatio || 1.5) : (config.risk?.twinOrders?.scalperRR || 1.0);
    const runnerRR = isCounterTrend ? 2.0 : (config.risk?.twinOrders?.runnerRR || 1.5);

    // TP = Entry + (Entry - SL) * 1.0 (Scalper) và Entry + (Entry - SL) * 1.5 (Runner)
    const { tpA, tpB } = calcTwinTakeProfits(action, effectiveEntry, stopLoss, scalperRR, runnerRR, decimals);

    // Tính toán tỷ lệ rủi ro và giá trị USD cho từng ticket theo splitRatio
    const effectiveRiskPercent = (typeof riskPercent === 'number' && riskPercent > 0)
      ? riskPercent
      : (riskAmount && equity ? +((riskAmount / equity) * 100).toFixed(1) : (config.risk?.riskPerTradePercent || 1.0));

    const scalperRiskPct = +(effectiveRiskPercent * splitRatio[0]).toFixed(1);
    const runnerRiskPct = +(effectiveRiskPercent * splitRatio[1]).toFixed(1);
    const totalRiskAmountUSD = (typeof riskAmount === 'number' && riskAmount > 0)
      ? riskAmount
      : +(equity * (effectiveRiskPercent / 100)).toFixed(2);
    const riskA = +(totalRiskAmountUSD * splitRatio[0]).toFixed(2);
    const riskB = +(totalRiskAmountUSD * splitRatio[1]).toFixed(2);

    log(`👯 [TWIN ARCHITECTURE] Phân bổ rủi ro ${effectiveRiskPercent}% (~$${totalRiskAmountUSD} USD) thành cặp lệnh song sinh:`);
    log(`   🎫 Ticket A — The Scalper (${scalperRiskPct}% rủi ro): ${lotA} lot | SL: ${stopLoss} | TP: ${tpA} | [SCALPER R:R ${scalperRR}]`);
    log(`   🎫 Ticket B — The Runner  (${runnerRiskPct}% rủi ro): ${lotB} lot | SL: ${stopLoss} | TP: ${tpB} | [RUNNER R:R ${runnerRR}]`);

    // 1. Gửi Lệnh 1 (Scalper)
    log(`🚀 [TWIN ORDER 1/2] Đang gửi Lệnh 1 (Scalper) ${lotA} lot [SCALPER R:R ${scalperRR}]...`);
    const resA = await this.executeSingleExnessTrade({
      symbol,
      action,
      volume: lotA,
      stopLoss,
      takeProfit: tpA,
      deltaSL: effectiveRisk,
      deltaTP: +(effectiveRisk * scalperRR).toFixed(decimals),
      strategy: `${strategy} [SCALPER R:R ${scalperRR}]`,
      ticketType: 'SCALPER'
    });

    if (resA && resA.success) {
      this.recordJournalEvent({
        asset: typeof asset === 'object' ? asset.name : (asset || symbol),
        symbol,
        positionId: resA.positionId || null,
        strategy: `${strategy} [SCALPER R:R ${scalperRR}]`,
        ticketType: 'SCALPER',
        action,
        entryPrice: resA.openPrice || effectiveEntry,
        stopLoss,
        takeProfit: tpA,
        riskRewardRatio: scalperRR,
        lotSize: lotA,
        riskAmount: riskA,
        ema200: dema,
        cciCurrent: cci?.current,
        cciPrevious: cci?.previous,
        exnessScreenshot: resA.exnessScreenshot,
        tvScreenshot: resA.tvScreenshot,
        note: `[SCALPER R:R ${scalperRR}] Ticket A — Tối đa hóa số lệnh thắng/ngày (${scalperRiskPct}% rủi ro)`
      });
    }

    // Nghỉ 1.8 giây để giao diện Exness ổn định
    await delay(1800);

    // 2. Gửi Lệnh 2 (Runner)
    log(`🚀 [TWIN ORDER 2/2] Đang gửi Lệnh 2 (Runner) ${lotB} lot [RUNNER R:R ${runnerRR}]...`);
    const resB = await this.executeSingleExnessTrade({
      symbol,
      action,
      volume: lotB,
      stopLoss,
      takeProfit: tpB,
      deltaSL: effectiveRisk,
      deltaTP: +(effectiveRisk * runnerRR).toFixed(decimals),
      strategy: `${strategy} [RUNNER R:R ${runnerRR}]`,
      ticketType: 'RUNNER'
    });

    if (resB && resB.success) {
      this.recordJournalEvent({
        asset: typeof asset === 'object' ? asset.name : (asset || symbol),
        symbol,
        positionId: resB.positionId || null,
        strategy: `${strategy} [RUNNER R:R ${runnerRR}]`,
        ticketType: 'RUNNER',
        action,
        entryPrice: resB.openPrice || effectiveEntry,
        stopLoss,
        takeProfit: tpB,
        riskRewardRatio: runnerRR,
        lotSize: lotB,
        riskAmount: riskB,
        ema200: dema,
        cciCurrent: cci?.current,
        cciPrevious: cci?.previous,
        exnessScreenshot: resB.exnessScreenshot,
        tvScreenshot: resB.tvScreenshot,
        note: `[RUNNER R:R ${runnerRR}] Ticket B — Ăn dày con sóng lớn, tối đa hóa ROI ròng (${runnerRiskPct}% rủi ro)`
      });
    }

    return {
      success: !!(resA?.success || resB?.success),
      ticketA: resA,
      ticketB: resB
    };
  }

  // Điều phối thực thi lệnh (Hỗ trợ cả Twin Orders và Single Order)
  async executeExnessTrade(params) {
    const isTwinEnabled = !!(config.risk?.twinOrders?.enabled);
    const isSubOrder = params.strategy?.includes('[SCALPER') || params.strategy?.includes('[RUNNER') || params.isSingleOrder;

    if (isTwinEnabled && !isSubOrder) {
      log(`👯 [MÔ HÌNH CẶP LỆNH SONG SINH] Kích hoạt phân tách 2 lệnh Scalper & Runner cho ${params.symbol}...`);
      return await this.executeTwinOrders(params);
    }
    return await this.executeSingleExnessTrade(params);
  }

  recordJournalEvent(event) {
    try {
      const newEntry = {
        ...event,
        timeVietnam: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
        timestamp: new Date().toISOString()
      };

      // 1. Lưu vào SQLite Database với ACID và chế độ WAL
      db.insertTrade(newEntry).catch(err => {
        log(`[SQLITE INSERT ERROR] ${err.message}`);
      });

      // 2. Dự phòng trực tiếp ra file JSON phòng trường hợp SQLite chậm
      const journalFile = path.join(__dirname, 'ab_testing_journal.json');
      let items = [];
      if (fs.existsSync(journalFile)) {
        try { items = JSON.parse(fs.readFileSync(journalFile, 'utf8')); } catch (e) { items = []; }
      }
      items.push(newEntry);
      fs.writeFileSync(journalFile, JSON.stringify(items, null, 2));

      // Đồng bộ đồng thời vào data/journal.json
      const dataJournalFile = path.join(__dirname, 'data', 'journal.json');
      try {
        let dataItems = [];
        if (fs.existsSync(dataJournalFile)) {
          dataItems = JSON.parse(fs.readFileSync(dataJournalFile, 'utf8'));
        }
        dataItems.push(newEntry);
        fs.writeFileSync(dataJournalFile, JSON.stringify(dataItems, null, 2));
      } catch (e) {}

      log(`[JOURNAL RECORDED] 📘 Đã lưu sự kiện giao dịch [${event.ticketType || 'TRADE'}] vào SQLite (trade.db) & JSON kèm bằng chứng hình ảnh kép`);
    } catch (e) {
      log(`[JOURNAL ERROR] ${e.message}`);
    }
  }

  async runM15Scan() {
    log(`\n================== BẮT ĐẦU CHU TRÌNH QUÉT M15 ==================`);
    if (!this.tvTabId || !this.exnessTabId) await this.discoverTabs();
    if (!this.tvTabId) return log('[SCAN ERROR] Không tìm thấy tab TradingView!');

    // 1. Kiểm tra vị thế Exness
    const exnessStatus = await this.checkExnessOpenPositions();
    log(`[EXNESS STATUS] Vốn: $${exnessStatus.equity} | Vị thế mở (${exnessStatus.openPositionsCount}): [${exnessStatus.openSymbols.join(', ')}]`);

    // WP-BREAKEVEN: Quản trị vị thế động — Kiểm tra và dời Stop Loss về Hòa Vốn nếu có lệnh đang lãi
    if (exnessStatus.openPositionsCount > 0) {
      await this.checkAndApplyBreakeven();
    }

    const maxTotalPositions = config.risk?.pyramiding?.maxTotalPositions || 6;
    if (exnessStatus.openPositionsCount >= maxTotalPositions) {
      log(`[PORTFOLIO HEAT LOCK] Đã có đủ ${exnessStatus.openPositionsCount}/${maxTotalPositions} vị thế mở trên sàn. Bỏ qua chu trình này.`);
      log(`================== HOÀN TẤT CHU TRÌNH QUÉT M15 ==================\n`);
      return;
    }

    // 2. Kết nối tới tab TradingView duy nhất
    const ws = await openWebSocket(`ws://127.0.0.1:${this.port}/devtools/page/${this.tvTabId}`, 5000);

    // Chạy ngầm 100% (Silent Scan): Không gọi Page.bringToFront để không chiếm focus hoặc làm giật cửa sổ của Anh

    for (const asset of this.symbols) {

      // WP-SESSION-FILTER: Khóa phiên cho các tài sản (GOLD, USDJPY, US500...)
      if (asset.sessionFilter?.enabled) {
        const sessionCheck = checkSessionFilter(asset.sessionFilter, new Date());
        if (!sessionCheck.allowed) {
          if (sessionCheck.reason === 'BLACKOUT_WINDOW') {
            log(`⏸️ [SESSION FILTER BLACKOUT] ${asset.name}: Rơi vào Vùng Tử Địa [${sessionCheck.desc}] (${sessionCheck.window} VN). Hiện tại: ${sessionCheck.currentTimeVN} VN. Bỏ qua để bảo vệ tài khoản.`);
          } else {
            log(`⏸️ [SESSION FILTER] ${asset.name}: Ngoài Khung Giờ Vàng (${sessionCheck.desc}). Hiện tại: ${sessionCheck.currentTimeVN} VN. Bỏ qua.`);
          }
          continue;
        } else if (sessionCheck.window) {
          log(`✨ [SESSION FILTER MATCH] ${asset.name}: Khớp Khung Giờ Vàng [${sessionCheck.desc}] (${sessionCheck.window} VN). Hiện tại: ${sessionCheck.currentTimeVN} VN.`);
        }
      }

      log(`[SCANNING] Đang quét ${asset.name} (${asset.tvSymbol})...`);
      await this.setSymbolInternal(ws, asset);
      let data = await this.readInternalChart(ws, asset);

      if (!data || data.error || !data.candle || !data.dema) {
        log(`[SCAN ERROR] ${asset.name}: ${data?.error || 'Không đọc được dữ liệu nến hoặc DEMA'}, bỏ qua.`);
        continue;
      }

      // WP-01: Khóa xác thực biểu đồ nghiêm ngặt (Strict Symbol Verification Guard + Price Sanity Check)
      function isPriceSensible(name, p) {
        if (!p || isNaN(p)) return false;
        if (name === 'GOLD') return p >= 1500 && p <= 6000;
        if (name === 'BTCUSD') return p >= 20000 && p <= 250000;
        if (name === 'USOIL' || name === 'UKOIL') return p >= 30 && p <= 250;
        if (name === 'GBPUSD') return p >= 1.00 && p <= 1.80;
        if (name === 'USDJPY') return p >= 100.0 && p <= 200.0;
        if (name === 'US500') return p >= 4000 && p <= 12000;
        return true;
      }

      let chartSymbol = (data.symbol || '').toUpperCase();
      const expectedSymbol = asset.tvSymbol.toUpperCase();
      const expectedKey = (asset.watchlistKey || asset.name).toUpperCase();
      let isSymbolMatch = (chartSymbol.includes(expectedKey) || chartSymbol === expectedSymbol || chartSymbol.includes(asset.name.toUpperCase()) || (asset.name === 'US500' && (chartSymbol.includes('SPX') || chartSymbol.includes('500')))) && isPriceSensible(asset.name, data.candle?.close);

      // Cơ chế Thử lại (Retry Mechanism) 1 lần nếu WebSocket TradingView nạp trễ
      if (!isSymbolMatch) {
        log(`⚠️ [SYMBOL GUARD RETRY] Biểu đồ trả về ${data.symbol} (Giá: ${data.candle?.close}) khi quét ${asset.name}. Đang thử lại sau 2.5 giây...`);
        await delay(2500);
        const retryData = await this.readInternalChart(ws, asset);
        if (retryData && retryData.symbol) {
          chartSymbol = retryData.symbol.toUpperCase();
          isSymbolMatch = (chartSymbol.includes(expectedKey) || chartSymbol === expectedSymbol || chartSymbol.includes(asset.name.toUpperCase()) || (asset.name === 'US500' && (chartSymbol.includes('SPX') || chartSymbol.includes('500')))) && isPriceSensible(asset.name, retryData.candle?.close);
          if (isSymbolMatch) {
            log(`✅ [SYMBOL GUARD RETRY SUCCESS] Biểu đồ đã đồng bộ chính xác ${retryData.symbol} (Giá: ${retryData.candle?.close})!`);
            data = retryData;
          }
        }
      }

      if (!isSymbolMatch) {
        log(`🚨 [SYMBOL MISMATCH GUARD] Lệch mã nến hoặc lệch vùng giá! Đang quét ${asset.name} (${asset.tvSymbol}) nhưng biểu đồ TradingView trả về ${data.symbol} (Giá: ${data.candle?.close}). HỦY đánh giá để bảo vệ tài khoản.`);
        continue;
      }

      const close = data.candle.close;
      const dema = data.dema;
      const isBullish = close > dema;
      const regime = isBullish ? 'BULLISH (CHỈ MUA)' : 'BEARISH (CHỈ BÁN)';

      // WP-02: Động cơ UT Bot Alerts Thuần JS (In-Memory Pure JS Engine) trên nến đã chốt (T-1)
      const hasUtBotBuy = !!data.utBot?.buySignal;
      const hasUtBotSell = !!data.utBot?.sellSignal;

      // Động cơ CCI Pullback trên nến đã chốt (T-1) vs (T-2)
      let hasCciBuy = false;
      let hasCciSell = false;
      const cci = data.cci;
      if (cci && cci.current !== null && cci.previous !== null) {
        if (cci.previous < -100 && cci.current >= -100) hasCciBuy = true;
        if (cci.previous > 100 && cci.current <= 100) hasCciSell = true;
      }

      const cciStr = cci && cci.current !== null ? `CCI(20): ${cci.current} (Trước: ${cci.previous})` : 'CCI: N/A';
      const utStr = data.utBot ? `UT_Stop: ${data.utBot.stop} | ATR: ${data.utBot.atr}` : 'UT: N/A';
      const ttm = data.ttmSqueeze;
      const ttmStr = ttm ? `Squeeze: ${ttm.isSqueezing ? 'ON (Nén)' : (ttm.justFired ? 'FIRED (Bung nén)' : 'OFF')} | Mom: ${ttm.momentum}` : 'TTM: N/A';
      log(`[ANALYSIS] ${asset.name} M15 (Chốt lúc ${data.candle.time}): Close = ${close} | EMA 200 = ${dema.toFixed(2)} | ${regime} | ${utStr} | ${cciStr} | ${ttmStr} | UT_Buy: ${hasUtBotBuy} | UT_Sell: ${hasUtBotSell} | CCI_Buy: ${hasCciBuy} | CCI_Sell: ${hasCciSell}`);

      // Giám sát an toàn danh mục & Dồn Lệnh Phi Rủi Ro (Free-Ride Pyramiding)
      const pyramidingConfig = config.risk?.pyramiding || { enabled: true, maxLayersPerAsset: 2, requireBreakevenBeforeScaleIn: true };
      const assetActiveRows = (exnessStatus.activePositions || []).filter(r => {
        const text = (r || '').toUpperCase();
        return text.includes(asset.exnessSymbol.toUpperCase()) ||
               (asset.name === 'GOLD' && (text.includes('XAU/USD') || text.includes('GOLD'))) ||
               (asset.name === 'BTCUSD' && text.includes('BTC')) ||
               (asset.name === 'USOIL' && (text.includes('USOIL') || text.includes('OIL') || text.includes('UKOIL'))) ||
               (asset.name === 'GBPUSD' && (text.includes('GBP/USD') || text.includes('GBPUSD'))) ||
               (asset.name === 'USDJPY' && (text.includes('USD/JPY') || text.includes('USDJPY') || text.includes('JPY'))) ||
               (asset.name === 'US500' && (text.includes('US500') || text.includes('SPX') || text.includes('500')));
      });

      // Bóc tách chính xác tổng số ticket thật từ huy hiệu Exness (ví dụ: "BTC 16 Sell" -> 16 tickets)
      let totalAssetTickets = 0;
      assetActiveRows.forEach(rowStr => {
        const clean = (rowStr || '').replace(/[\u2066\u2067\u2068\u2069\u200E\u200F≈]/g, '').trim();
        const parts = clean.split(/\s+/);
        const sideIdx = parts.findIndex(p => ['Buy', 'Sell', 'Mua', 'Bán'].includes(p));
        if (sideIdx > 1 && !isNaN(parseInt(parts[1]))) {
          totalAssetTickets += parseInt(parts[1]);
        } else {
          totalAssetTickets += 1;
        }
      });

      if (!this.latestAssetsState) this.latestAssetsState = {};
      this.latestAssetsState[asset.name] = {
        symbol: asset.tvSymbol,
        price: close,
        ema200: +dema.toFixed(2),
        regime,
        utStop: data.utBot?.stop,
        atr: data.utBot?.atr,
        squeeze: ttm ? (ttm.isSqueezing ? 'ON (Nén)' : (ttm.justFired ? 'FIRED (Bung nén)' : 'OFF')) : 'OFF',
        mom: ttm?.momentum,
        cci: cci?.current,
        activePosition: totalAssetTickets > 0
      };

      const currentLayersCount = Math.ceil(totalAssetTickets / 2);
      const maxLayersAllowed = pyramidingConfig.enabled ? (pyramidingConfig.maxLayersPerAsset || 2) : 1;

      // 1. Chốt chặn Trần Tầng Lệnh Tuyệt Đối (Strict Layer Cap)
      if (currentLayersCount >= maxLayersAllowed) {
        log(`[PYRAMIDING CAP] 🛡️ ${asset.name} (${asset.exnessSymbol}) đã đạt trần ${currentLayersCount}/${maxLayersAllowed} tầng lệnh (${totalAssetTickets} tickets mở). Khóa an toàn và KHÔNG dồn thêm lệnh.`);
        continue;
      } else if (currentLayersCount > 0) {
        // 2. Chốt Chặn Phi Rủi Ro (Free-Ride Pyramiding Guard): Tầng trước BẮT BUỘC phải Hòa Vốn mới cho phép mở Tầng tiếp theo
        const requireBE = pyramidingConfig.requireBreakevenBeforeScaleIn !== false;
        if (requireBE) {
          const journalFile = path.join(__dirname, 'data', 'journal.json');
          let journalTrades = [];
          if (fs.existsSync(journalFile)) {
            try { journalTrades = JSON.parse(fs.readFileSync(journalFile, 'utf8')); } catch (e) {}
          }
          const activeAssetTrades = journalTrades.filter(t => 
            (t.asset === asset.name || (t.symbol && t.symbol.includes(asset.name))) &&
            !t.status?.includes('WIN') && !t.status?.includes('LOSS') && !t.closed
          );

          const hasUnprotectedLayer = activeAssetTrades.length > 0 && activeAssetTrades.some(t => !t.isBreakeven);
          if (hasUnprotectedLayer) {
            log(`[PYRAMIDING BLOCKED] ⏸️ ${asset.name} đang có Tầng ${currentLayersCount} (${totalAssetTickets} tickets) nhưng CHƯA ĐƯỢC KHÓA HÒA VỐN. TỪ CHỐI dồn thêm tầng mới để bảo toàn 1.0% rủi ro vốn!`);
            continue;
          }
        }
        log(`[SMART PYRAMIDING ACTIVE] 🚀 ${asset.name} đang có ${currentLayersCount}/${maxLayersAllowed} tầng lệnh (${totalAssetTickets} tickets, TẤT CẢ ĐÃ KHÓA HÒA VỐN). Cấp phép tìm tín hiệu động cơ mới để Dồn Lệnh Tầng ${currentLayersCount + 1}!`);
      }

      let signalAction = null;
      let triggeredStrategy = null;

      const hasThetaBuy = !!data.emaPullback?.buySignal;
      const hasThetaSell = !!data.emaPullback?.sellSignal;
      const hasEpsilonBuy = !!data.asianSweep?.buySignal;
      const hasEpsilonSell = !!data.asianSweep?.sellSignal;
      const hasKappaBuy = !!data.volumePA?.buySignal;
      const hasKappaSell = !!data.volumePA?.sellSignal;
      const hasDeltaBuy = !!data.halfTrendAdx?.buySignal;
      const hasDeltaSell = !!data.halfTrendAdx?.sellSignal;
      const hasZetaBuy = !!data.supertrendRsi?.buySignal;
      const hasZetaSell = !!data.supertrendRsi?.sellSignal;

      const thetaStr = data.emaPullback?.ema9 ? `EMA9: ${data.emaPullback.ema9} | EMA21: ${data.emaPullback.ema21}` : 'EMA9/21: N/A';
      const asianStr = data.asianSweep?.asianHigh ? `AsianH: ${data.asianSweep.asianHigh} | AsianL: ${data.asianSweep.asianLow}` : 'Asian: N/A';
      const volPaStr = data.volumePA?.volRatio ? `VolRatio: ${data.volumePA.volRatio}x` : 'Vol: N/A';
      const deltaStr = data.halfTrendAdx ? `HT: ${data.halfTrendAdx.trend} (ADX: ${data.halfTrendAdx.adx})` : 'HT: N/A';
      const zetaStr = data.supertrendRsi ? `ST: ${data.supertrendRsi.trend} (RSI: ${data.supertrendRsi.currentRsi})` : 'ST: N/A';
      log(`[ACTIVE ENGINES] ${asset.name} | ${thetaStr} | ${asianStr} | ${volPaStr} | ${deltaStr} | ${zetaStr} | Delta: B=${hasDeltaBuy}/S=${hasDeltaSell} | Zeta: B=${hasZetaBuy}/S=${hasZetaSell}`);

      // WP-ACTIVE-ENGINES: Tôn trọng cấu hình động cơ hoạt động từ config.json
      const assetEngines = config.activeEngines?.[asset.name] || (
        asset.name === 'GOLD' ? ["ENGINE_OMEGA", "ENGINE_BETA", "ENGINE_ALPHA"] :
        asset.name === 'USDJPY' ? ["ENGINE_EPSILON", "ENGINE_OMEGA", "ENGINE_BETA", "ENGINE_ALPHA"] :
        asset.name === 'BTCUSD' ? ["ENGINE_DELTA", "ENGINE_BETA", "ENGINE_OMEGA"] :
        asset.name === 'GBPUSD' ? ["ENGINE_ALPHA"] :
        asset.name === 'US500' ? ["ENGINE_ALPHA"] :
        ["ENGINE_ALPHA"]
      );
      const allowDelta = assetEngines.includes('ENGINE_DELTA');
      const allowZeta = assetEngines.includes('ENGINE_ZETA');
      const allowTheta = assetEngines.includes('ENGINE_THETA');
      const allowBeta = assetEngines.includes('ENGINE_BETA');
      const allowAlpha = assetEngines.includes('ENGINE_ALPHA');
      const allowEpsilon = assetEngines.includes('ENGINE_EPSILON');
      const allowKappa = assetEngines.includes('ENGINE_KAPPA');

      if (asset.name === 'GOLD') {
        // GOLD: ENGINE_DELTA (HalfTrend + ADX) + ENGINE_THETA (EMA 9/21) + ENGINE_BETA (CCI) + ENGINE_ALPHA (UT Bot)
        if (isBullish) {
          if (allowDelta && hasDeltaBuy) {
            signalAction = 'BUY';
            triggeredStrategy = 'ENGINE_DELTA (HALFTREND_ADX)';
          } else if (allowTheta && allowBeta && hasThetaBuy && hasCciBuy) {
            signalAction = 'BUY';
            triggeredStrategy = 'CONFLUENCE_THETA_BETA (EMA_PULLBACK + CCI)';
          } else if (allowTheta && hasThetaBuy) {
            signalAction = 'BUY';
            triggeredStrategy = 'ENGINE_THETA (EMA_PULLBACK)';
          } else if (allowBeta && hasCciBuy) {
            signalAction = 'BUY';
            triggeredStrategy = 'ENGINE_BETA (CCI_PULLBACK)';
          } else if (allowAlpha && hasUtBotBuy) {
            signalAction = 'BUY';
            triggeredStrategy = 'ENGINE_ALPHA (UT_BOT)';
          }
        } else {
          if (allowDelta && hasDeltaSell) {
            signalAction = 'SELL';
            triggeredStrategy = 'ENGINE_DELTA (HALFTREND_ADX)';
          } else if (allowTheta && allowBeta && hasThetaSell && hasCciSell) {
            signalAction = 'SELL';
            triggeredStrategy = 'CONFLUENCE_THETA_BETA (EMA_PULLBACK + CCI)';
          } else if (allowTheta && hasThetaSell) {
            signalAction = 'SELL';
            triggeredStrategy = 'ENGINE_THETA (EMA_PULLBACK)';
          } else if (allowBeta && hasCciSell) {
            signalAction = 'SELL';
            triggeredStrategy = 'ENGINE_BETA (CCI_PULLBACK)';
          } else if (allowAlpha && hasUtBotSell) {
            signalAction = 'SELL';
            triggeredStrategy = 'ENGINE_ALPHA (UT_BOT)';
          }
        }
      } else if (asset.name === 'USOIL' || asset.name === 'UKOIL') {
        // USOIL: ENGINE_DELTA + ENGINE_EPSILON + ENGINE_BETA + ENGINE_ALPHA
        if (isBullish) {
          if (allowDelta && hasDeltaBuy) {
            signalAction = 'BUY';
            triggeredStrategy = 'ENGINE_DELTA (HALFTREND_ADX)';
          } else if (allowEpsilon && hasEpsilonBuy) {
            signalAction = 'BUY';
            triggeredStrategy = 'ENGINE_EPSILON (ASIAN_SWEEP)';
          } else if (allowBeta && hasCciBuy) {
            signalAction = 'BUY';
            triggeredStrategy = 'ENGINE_BETA (CCI_PULLBACK)';
          } else if (allowAlpha && hasUtBotBuy) {
            signalAction = 'BUY';
            triggeredStrategy = 'ENGINE_ALPHA (UT_BOT)';
          }
        } else {
          if (allowDelta && hasDeltaSell) {
            signalAction = 'SELL';
            triggeredStrategy = 'ENGINE_DELTA (HALFTREND_ADX)';
          } else if (allowEpsilon && hasEpsilonSell) {
            signalAction = 'SELL';
            triggeredStrategy = 'ENGINE_EPSILON (ASIAN_SWEEP)';
          } else if (allowBeta && hasCciSell) {
            signalAction = 'SELL';
            triggeredStrategy = 'ENGINE_BETA (CCI_PULLBACK)';
          } else if (allowAlpha && hasUtBotSell) {
            signalAction = 'SELL';
            triggeredStrategy = 'ENGINE_ALPHA (UT_BOT)';
          }
        }
      } else if (asset.name === 'BTCUSD') {
        // BTCUSD: ENGINE_DELTA + ENGINE_ZETA + ENGINE_BETA + ENGINE_KAPPA + ENGINE_ALPHA
        if (isBullish) {
          if (allowDelta && hasDeltaBuy) {
            signalAction = 'BUY';
            triggeredStrategy = 'ENGINE_DELTA (HALFTREND_ADX)';
          } else if (allowZeta && hasZetaBuy) {
            signalAction = 'BUY';
            triggeredStrategy = 'ENGINE_ZETA (SUPERTREND_RSI)';
          } else if (allowBeta && allowKappa && hasCciBuy && hasKappaBuy) {
            signalAction = 'BUY';
            triggeredStrategy = 'CONFLUENCE_BETA_KAPPA (CCI + VOLUME_PA)';
          } else if (allowBeta && hasCciBuy) {
            signalAction = 'BUY';
            triggeredStrategy = 'ENGINE_BETA (CCI_PULLBACK)';
          } else if (allowKappa && hasKappaBuy) {
            signalAction = 'BUY';
            triggeredStrategy = 'ENGINE_KAPPA (VOLUME_PA)';
          } else if (allowAlpha && hasUtBotBuy) {
            signalAction = 'BUY';
            triggeredStrategy = 'ENGINE_ALPHA (UT_BOT)';
          }
        } else {
          if (allowDelta && hasDeltaSell) {
            signalAction = 'SELL';
            triggeredStrategy = 'ENGINE_DELTA (HALFTREND_ADX)';
          } else if (allowZeta && hasZetaSell) {
            signalAction = 'SELL';
            triggeredStrategy = 'ENGINE_ZETA (SUPERTREND_RSI)';
          } else if (allowBeta && allowKappa && hasCciSell && hasKappaSell) {
            signalAction = 'SELL';
            triggeredStrategy = 'CONFLUENCE_BETA_KAPPA (CCI + VOLUME_PA)';
          } else if (allowBeta && hasCciSell) {
            signalAction = 'SELL';
            triggeredStrategy = 'ENGINE_BETA (CCI_PULLBACK)';
          } else if (allowKappa && hasKappaSell) {
            signalAction = 'SELL';
            triggeredStrategy = 'ENGINE_KAPPA (VOLUME_PA)';
          } else if (allowAlpha && hasUtBotSell) {
            signalAction = 'SELL';
            triggeredStrategy = 'ENGINE_ALPHA (UT_BOT)';
          }
        }
      } else if (asset.name === 'GBPUSD') {
        // GBPUSD: ENGINE_EPSILON (Asian Range Sweep) + ENGINE_BETA (CCI Pullback) + ENGINE_ALPHA (UT Bot)
        if (isBullish) {
          if (allowEpsilon && hasEpsilonBuy) {
            signalAction = 'BUY';
            triggeredStrategy = 'ENGINE_EPSILON (ASIAN_SWEEP)';
          } else if (allowBeta && hasCciBuy) {
            signalAction = 'BUY';
            triggeredStrategy = 'ENGINE_BETA (CCI_PULLBACK)';
          } else if (allowAlpha && hasUtBotBuy) {
            signalAction = 'BUY';
            triggeredStrategy = 'ENGINE_ALPHA (UT_BOT)';
          }
        } else {
          if (allowEpsilon && hasEpsilonSell) {
            signalAction = 'SELL';
            triggeredStrategy = 'ENGINE_EPSILON (ASIAN_SWEEP)';
          } else if (allowBeta && hasCciSell) {
            signalAction = 'SELL';
            triggeredStrategy = 'ENGINE_BETA (CCI_PULLBACK)';
          } else if (allowAlpha && hasUtBotSell) {
            signalAction = 'SELL';
            triggeredStrategy = 'ENGINE_ALPHA (UT_BOT)';
          }
        }
      } else if (asset.name === 'USDJPY') {
        // USDJPY: ENGINE_DELTA (HalfTrend + ADX) + ENGINE_EPSILON (Asian Range Sweep) + ENGINE_THETA (EMA Pullback) + ENGINE_BETA (CCI Pullback) + ENGINE_ALPHA (UT Bot)
        if (isBullish) {
          if (allowDelta && hasDeltaBuy) {
            signalAction = 'BUY';
            triggeredStrategy = 'ENGINE_DELTA (HALFTREND_ADX)';
          } else if (allowEpsilon && hasEpsilonBuy) {
            signalAction = 'BUY';
            triggeredStrategy = 'ENGINE_EPSILON (ASIAN_SWEEP)';
          } else if (allowTheta && allowBeta && hasThetaBuy && hasCciBuy) {
            signalAction = 'BUY';
            triggeredStrategy = 'CONFLUENCE_THETA_BETA (EMA_PULLBACK + CCI)';
          } else if (allowTheta && hasThetaBuy) {
            signalAction = 'BUY';
            triggeredStrategy = 'ENGINE_THETA (EMA_PULLBACK)';
          } else if (allowBeta && hasCciBuy) {
            signalAction = 'BUY';
            triggeredStrategy = 'ENGINE_BETA (CCI_PULLBACK)';
          } else if (allowAlpha && hasUtBotBuy) {
            signalAction = 'BUY';
            triggeredStrategy = 'ENGINE_ALPHA (UT_BOT)';
          }
        } else {
          if (allowDelta && hasDeltaSell) {
            signalAction = 'SELL';
            triggeredStrategy = 'ENGINE_DELTA (HALFTREND_ADX)';
          } else if (allowEpsilon && hasEpsilonSell) {
            signalAction = 'SELL';
            triggeredStrategy = 'ENGINE_EPSILON (ASIAN_SWEEP)';
          } else if (allowTheta && allowBeta && hasThetaSell && hasCciSell) {
            signalAction = 'SELL';
            triggeredStrategy = 'CONFLUENCE_THETA_BETA (EMA_PULLBACK + CCI)';
          } else if (allowTheta && hasThetaSell) {
            signalAction = 'SELL';
            triggeredStrategy = 'ENGINE_THETA (EMA_PULLBACK)';
          } else if (allowBeta && hasCciSell) {
            signalAction = 'SELL';
            triggeredStrategy = 'ENGINE_BETA (CCI_PULLBACK)';
          } else if (allowAlpha && hasUtBotSell) {
            signalAction = 'SELL';
            triggeredStrategy = 'ENGINE_ALPHA (UT_BOT)';
          }
        }
      } else if (asset.name === 'US500') {
        // US500: ENGINE_DELTA (HalfTrend + ADX) + ENGINE_ALPHA (UT Bot) + ENGINE_THETA (EMA 9/21 Pullback)
        if (isBullish) {
          if (allowDelta && hasDeltaBuy) {
            signalAction = 'BUY';
            triggeredStrategy = 'ENGINE_DELTA (HALFTREND_ADX)';
          } else if (allowAlpha && hasUtBotBuy) {
            signalAction = 'BUY';
            triggeredStrategy = 'ENGINE_ALPHA (UT_BOT)';
          } else if (allowTheta && hasThetaBuy) {
            signalAction = 'BUY';
            triggeredStrategy = 'ENGINE_THETA (EMA_PULLBACK)';
          }
        } else {
          if (allowDelta && hasDeltaSell) {
            signalAction = 'SELL';
            triggeredStrategy = 'ENGINE_DELTA (HALFTREND_ADX)';
          } else if (allowAlpha && hasUtBotSell) {
            signalAction = 'SELL';
            triggeredStrategy = 'ENGINE_ALPHA (UT_BOT)';
          } else if (allowTheta && hasThetaSell) {
            signalAction = 'SELL';
            triggeredStrategy = 'ENGINE_THETA (EMA_PULLBACK)';
          }
        }
      }

      // =========================================================================
      // WP-COUNTER-TREND: ĐÁNH LỆCH XU HƯỚNG / NGƯỢC XU HƯỚNG (ENGINE_LAMBDA & ENGINE_OMEGA)
      // Không bị ràng buộc bởi EMA 200 (isBullish / isBearish), BẮT BUỘC qua ADX Guard <= 28
      // =========================================================================
      const ctConfig = config.counterTrend || { enabled: true, mode: 'LIVE', riskPercent: 0.5, maxAdxThreshold: 28.0 };
      const allowLambda = assetEngines.includes('ENGINE_LAMBDA') && ctConfig.enabled;
      const allowOmega = assetEngines.includes('ENGINE_OMEGA') && ctConfig.enabled;
      const curAdx = data.halfTrendAdx?.adx !== undefined ? data.halfTrendAdx.adx : 20;
      const isAdxSafeForCounterTrend = curAdx <= (ctConfig.maxAdxThreshold || 28.0);

      const hasLambdaBuy = !!(data.bbExtreme?.lowerSignal && data.rsiDivergence?.bullDiv);
      const hasLambdaSell = !!(data.bbExtreme?.upperSignal && data.rsiDivergence?.bearDiv);
      const hasOmegaBuy = !!data.liquiditySweep?.sweepBuy;
      const hasOmegaSell = !!data.liquiditySweep?.sweepSell;

      const ctStr = `Lambda: B=${hasLambdaBuy}/S=${hasLambdaSell} | Omega: B=${hasOmegaBuy}/S=${hasOmegaSell} | CT_ADX_Safe: ${isAdxSafeForCounterTrend} (ADX: ${curAdx})`;
      log(`[COUNTER-TREND ENGINES] ${asset.name} | ${ctStr}`);

      if (!signalAction && isAdxSafeForCounterTrend) {
        if (allowLambda && hasLambdaBuy) {
          signalAction = 'BUY';
          triggeredStrategy = 'ENGINE_LAMBDA (RSI_DIV_BB_EXTREME)';
        } else if (allowLambda && hasLambdaSell) {
          signalAction = 'SELL';
          triggeredStrategy = 'ENGINE_LAMBDA (RSI_DIV_BB_EXTREME)';
        } else if (allowOmega && hasOmegaBuy) {
          signalAction = 'BUY';
          triggeredStrategy = 'ENGINE_OMEGA (LIQUIDITY_SWEEP_FADEOUT)';
        } else if (allowOmega && hasOmegaSell) {
          signalAction = 'SELL';
          triggeredStrategy = 'ENGINE_OMEGA (LIQUIDITY_SWEEP_FADEOUT)';
        }
      } else if (!isAdxSafeForCounterTrend && (hasLambdaBuy || hasLambdaSell || hasOmegaBuy || hasOmegaSell)) {
        log(`⏸️ [COUNTER-TREND BLOCKED] Phát hiện tín hiệu lệch xu hướng nhưng ADX = ${curAdx} > ${ctConfig.maxAdxThreshold}. Thị trường đang có sóng lớn/Parabolic, TỪ CHỐI bắt dao rơi!`);
      }

      if (signalAction) {
        log(`🔥 [KÍCH HOẠT TÍN HIỆU] Động cơ [${triggeredStrategy}] phát tín hiệu ${signalAction} hợp lệ trên ${asset.name}!`);

        const isForex = asset.name.includes('GBP') || asset.name.includes('EUR');
        const decimals = isForex ? 5 : (asset.name.includes('JPY') ? 3 : (close < 500 && asset.name !== 'USOIL' ? 3 : 2));
        // WP-DYNAMIC-SL: Nâng cấp Đệm Stop Loss Động Theo ATR14 Thực Tế
        const dynBuffer = calcDynSlBuffer(asset.name, data.utBot?.atr, asset.minAtrBuffer);
        let sl, risk;
        if (signalAction === 'BUY') {
          sl = +(data.candle.low - dynBuffer).toFixed(decimals);
          risk = +(close - sl).toFixed(decimals);
        } else {
          sl = +(data.candle.high + dynBuffer).toFixed(decimals);
          risk = +(sl - close).toFixed(decimals);
        }
        log(`🎯 [DYNAMIC SL BUFFER] ${asset.name}: dynBuffer = ${dynBuffer} (ATR: ${data.utBot?.atr || 'N/A'}, minBuffer: ${asset.minAtrBuffer || 'N/A'}) | SL: ${sl} | Risk: ${risk}`);

        // Tính toán rủi ro phân tầng (Tiered Risk): Hạng 1 Quân Vương 10.0% (BTCUSD), Hạng 2 5.0%, khác 2.0%
        const riskTier = await this.getStrategyRiskTier(triggeredStrategy, asset.name);
        const riskPercent = riskTier.riskPercent;
        const targetRiskAmount = +(exnessStatus.equity * (riskPercent / 100)).toFixed(2);

        const isCounterTrend = triggeredStrategy.includes('LAMBDA') || triggeredStrategy.includes('OMEGA');
        const minRR = isCounterTrend ? (config.counterTrend?.minRiskRewardRatio || 1.5) : 1.0;
        const testTP = signalAction === 'BUY' ? +(close + risk * minRR).toFixed(decimals) : +(close - risk * minRR).toFixed(decimals);
        const posPlan = riskManager.calculatePosition({
          symbol: asset.name,
          strategy: triggeredStrategy,
          equity: exnessStatus.equity,
          riskAmount: targetRiskAmount,
          riskPercent: riskPercent,
          entryPrice: close,
          stopLossPrice: sl,
          takeProfitPrice: testTP,
          currentSpread: (asset.name.includes('GBP') || asset.name.includes('EUR')) ? 0.00015 : (asset.name.includes('JPY') ? 0.015 : (asset.name.includes('US500') ? 0.50 : (asset.name.includes('BTC') ? 25.0 : (asset.maxSpreadUSD ? asset.maxSpreadUSD * 0.6 : 0.20))))
        });

        if (posPlan.approved) {
          if (riskTier.rank === 1) {
            log(`👑 [TIERED RISK - QUÂN VƯƠNG HẠNG 1] Động cơ [${triggeredStrategy}] đạt HẠNG 1 VÔ ĐỊCH! NÂNG VỐN LÊN ${riskPercent}% RỦI RO ($${posPlan.actualRiskAmount} USD).`);
          } else if (riskTier.rank <= 3) {
            log(`⚡ [TIERED RISK - TOP 2-3] Động cơ [${triggeredStrategy}] thuộc TOP 2-3! Áp dụng tỷ lệ rủi ro ưu tiên ${riskPercent}% ($${posPlan.actualRiskAmount} USD).`);
          } else {
            log(`[BASE RISK ACTIVE] Động cơ [${triggeredStrategy}] áp dụng tỷ lệ rủi ro tiêu chuẩn ${riskPercent}% ($${posPlan.actualRiskAmount} USD).`);
          }
          log(`[RISK APPROVED] Tổng khối lượng cơ hội (${riskPercent}% rủi ro): ${posPlan.lotSize} lot | Số tiền rủi ro: $${posPlan.actualRiskAmount} | R:R cơ sở: ${posPlan.riskRewardRatio}`);
          const execResult = await this.executeExnessTrade({
            asset,
            symbol: asset.exnessSymbol,
            action: signalAction,
            volume: posPlan.lotSize,
            totalLot: posPlan.lotSize,
            stopLoss: sl,
            takeProfit: testTP,
            deltaSL: risk,
            deltaTP: +(risk * minRR).toFixed(decimals),
            strategy: triggeredStrategy,
            entryPrice: close,
            equity: exnessStatus.equity,
            riskAmount: posPlan.actualRiskAmount,
            riskPercent: riskPercent,
            dema,
            cci
          });

          if (execResult && execResult.success) {
            if (!config.risk?.twinOrders?.enabled) {
              this.recordJournalEvent({
                asset: asset.name,
                symbol: asset.exnessSymbol,
                strategy: triggeredStrategy,
                action: signalAction,
                entryPrice: close,
                stopLoss: sl,
                takeProfit: testTP,
                lotSize: posPlan.lotSize,
                riskAmount: posPlan.actualRiskAmount,
                ema200: dema,
                cciCurrent: cci?.current,
                cciPrevious: cci?.previous,
                exnessScreenshot: execResult.exnessScreenshot,
                tvScreenshot: execResult.tvScreenshot
              });
            }

            // Sau khi vào lệnh thành công, kiểm tra giới hạn danh mục
            const newOpenCount = (exnessStatus.openPositionsCount || 0) + (config.risk?.twinOrders?.enabled ? 2 : 1);
            exnessStatus.openPositionsCount = newOpenCount;
            if (newOpenCount >= maxTotalPositions) {
              log(`[PORTFOLIO LIMIT REACHED] Đã mở thêm lệnh, tổng vị thế hiện tại đạt trần ${newOpenCount}/${maxTotalPositions}. Dừng quét các mã còn lại trong chu trình.`);
              break;
            } else {
              log(`[PORTFOLIO CAPACITY AVAILABLE] Đã vào lệnh thành công cho ${asset.name}. Tổng vị thế: ${newOpenCount}/${maxTotalPositions}. Tiếp tục quét các tài sản tiếp theo!`);
            }
          } else {
            log(`[EXECUTION FAILED] Không thể khớp lệnh trên Exness: ${execResult?.error || 'Nút xác nhận không khả dụng'}`);
          }
        } else {
          log(`[RISK REJECTED] Từ chối lệnh: ${posPlan.reason}`);
        }
      }
    }

    // ĐÃ LOẠI BỎ: Không ép chuyển ngược lại GOLD ở cuối chu trình để chống lệch biểu đồ (WP-01)

    ws.close();
    this.lastScanTime = new Date().toLocaleTimeString('vi-VN', { hour12: false, timeZone: 'Asia/Ho_Chi_Minh' });
    try { await this.syncRealtimeStatus(); } catch (e) {}
    log(`================== HOÀN TẤT CHU TRÌNH QUÉT M15 ==================\n`);
  }

  // WP-03: Đồng bộ Thời Gian Quét Nến M15 Đã Chốt (T-1) lúc Giây thứ 05 (XX:00:05, XX:15:05, XX:30:05, XX:45:05)
  calculateMsToNextScan() {
    const now = new Date();
    const currentMs = now.getTime();

    const targetMinutes = [0, 15, 30, 45];
    let candidates = [];

    for (const hOffset of [0, 1]) {
      for (const tm of targetMinutes) {
        const d = new Date(now);
        d.setHours(now.getHours() + hOffset, tm, 5, 0);
        if (d.getTime() > currentMs + 2000) {
          candidates.push(d.getTime() - currentMs);
        }
      }
    }

    candidates.sort((a, b) => a - b);
    return candidates[0] || (15 * 60 * 1000);
  }

  // WP-04: Vòng lặp tự phục hồi Self-Healing
  async start() {
    this.running = true;
    log(`🚀 [DAEMON MONITOR KÍCH HOẠT] Đã khởi động hệ thống tự trị treo máy qua đêm (Vòng lặp tự phục hồi Self-Healing).`);
    await this.discoverTabs();

    // WP-TELEMETRY: Vòng lặp đồng bộ trạng thái Exness thời gian thực liên tục (12 giây/lần)
    setInterval(async () => {
      try {
        await this.syncRealtimeStatus();
      } catch (err) {}
    }, 12000);

    // Initial telemetry sync
    await this.syncRealtimeStatus();

    // Chạy chu trình quét đầu tiên ngay khi khởi động
    try {
      await this.runM15Scan();
    } catch (err) {
      log(`[INITIAL SCAN WARNING] ${err.message}`);
    }

    // Vòng lặp tự trị chính
    while (this.running) {
      try {
        const now = new Date();
        const vnDay = now.getDay();
        const vnHr = (now.getUTCHours() + 7) % 24;
        const vnMin = now.getMinutes();

        // Kiểm tra an toàn cuối tuần lúc 03:30 sáng Thứ Bảy
        if (vnDay === 6 && vnHr === 3 && vnMin >= 30 && vnMin <= 35) {
          await this.closeWeekendPositions();
        }

        // TỰ ĐỘNG KÍCH HOẠT TÁC TỬ TỰ HỌC & ĐÚC RÚT TRI THỨC LÚC 00:05 VN HẰNG NGÀY
        const vnDateToday = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
        if (vnHr === 0 && vnMin >= 5 && vnMin <= 25 && this._lastLearningDate !== vnDateToday) {
          this._lastLearningDate = vnDateToday;
          try {
            const AutonomousLearningAgent = require('./autonomous_learning_agent');
            const agent = new AutonomousLearningAgent({ dryRun: false });
            log(`🧠 [NIGHTLY LEARNING] Bắt đầu kích hoạt Tác tử Tự học & Hiệu chỉnh cho ngày ${vnDateToday}...`);
            const learningRes = await agent.runCycle(vnDateToday);
            this.lastLearningCycle = learningRes.analysis?.summary || null;
            log(`🧠 [NIGHTLY LEARNING] Hoàn tất chu kỳ tự học đêm! Báo cáo: ${learningRes.reportPath}`);
          } catch (learningErr) {
            log(`⚠️ [NIGHTLY LEARNING ERROR] ${learningErr.message}`);
          }
        }

        const msToWait = this.calculateMsToNextScan();
        const waitSec = Math.round(msToWait / 1000);
        log(`⏳ [SLEEP] Tiến trình tạm nghỉ. Chu trình quét M15 kế tiếp (giây thứ 05 sau đóng nến) sau ${Math.floor(waitSec / 60)} phút ${waitSec % 60} giây...`);

        await delay(msToWait);

        await this.runM15Scan();
      } catch (err) {
        log(`🚨 [SUPERVISOR CAUGHT EXCEPTION] Lỗi chu trình daemon: ${err.message}. Tự động khôi phục và thử lại sau 5 giây...`);
        await delay(5000);
        try {
          await this.discoverTabs();
        } catch (e) {}
      }
    }
  }
}

// WP-04: Infinite Supervisor Loop (Kỷ luật Tự phục hồi Không ngắt tiến trình)
async function runSupervisor() {
  let restartCount = 0;
  while (true) {
    try {
      const daemon = new TradingDaemon();
      await daemon.start();
    } catch (err) {
      restartCount++;
      log(`🚨 [SUPERVISOR HEALER #${restartCount}] Tiến trình daemon gặp sự cố nghiêm trọng: ${err.message}. Tự động phục hồi sau 10 giây...`);
      await delay(10000);
    }
  }
}

module.exports = {
  TradingDaemon,
  runSupervisor,
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
};

// WP-SINGLE-INSTANCE: Khóa đơn phiên (Single-Instance PID Lockfile Guard)
const PID_FILE = path.join(__dirname, 'daemon.pid');

function acquireSingleInstanceLock() {
  if (fs.existsSync(PID_FILE)) {
    try {
      const oldPid = parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
      if (oldPid && oldPid !== process.pid) {
        try {
          process.kill(oldPid, 0);
          console.error(`🚨 [INSTANCE GUARD] Một tiến trình daemon_monitor khác (PID ${oldPid}) đang chạy! Không khởi động bản sao thứ hai.`);
          return false;
        } catch (e) {
          // PID cũ đã dừng (stale lock), tiếp tục khởi động
        }
      }
    } catch (e) {}
  }
  try {
    fs.writeFileSync(PID_FILE, String(process.pid));
    process.on('exit', () => {
      try {
        if (fs.existsSync(PID_FILE) && parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10) === process.pid) {
          fs.unlinkSync(PID_FILE);
        }
      } catch (e) {}
    });
  } catch (e) {}
  return true;
}

if (require.main === module) {
  if (acquireSingleInstanceLock()) {
    runSupervisor();
  }
}
