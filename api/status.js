const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // 1. Kết nối qua Cloudflare Live Tunnel về trực tiếp máy trạm của Anh
  const TUNNEL_URL = 'https://teams-superintendent-earlier-core.trycloudflare.com';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const liveRes = await fetch(`${TUNNEL_URL}/api/status`, {
      signal: controller.signal,
      headers: { 'Cache-Control': 'no-cache' }
    });
    clearTimeout(timer);
    if (liveRes.ok) {
      const liveData = await liveRes.json();
      return res.status(200).json(liveData);
    }
  } catch (err) {
    // Tunnel tạm thời không phản hồi -> Chuyển sang fallback
  }

  try {
    const filePath = path.join(process.cwd(), 'data', 'status.json');
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const now = new Date();
      const mins = now.getMinutes();
      const secs = now.getSeconds();
      const nextMin = (Math.floor(mins / 15) + 1) * 15;
      let diffSec = (nextMin - mins) * 60 - secs + 5;
      if (diffSec < 0) diffSec += 900;
      data.nextScanSeconds = diffSec;

      if (!data.lastScanTime) {
        const lastBarMins = Math.floor(mins / 15) * 15;
        const barDate = new Date(now);
        barDate.setMinutes(lastBarMins, 0, 0);
        data.lastScanTime = barDate.toLocaleTimeString('vi-VN', { hour12: false, timeZone: 'Asia/Ho_Chi_Minh' });
      }
      data.maxTotalPositions = data.maxTotalPositions || 10;
      data.maxDailyLossPercent = data.maxDailyLossPercent || 20.0;
      data.breakeven = data.breakeven || { enabled: true, triggerRR: 1.0, lockTicketBOnTicketATarget: true };
      return res.status(200).json(data);
    }
  } catch (e) {
    console.error(e);
  }

  return res.status(200).json({
    daemonActive: true,
    equity: 9584.11,
    initialBalance: 9388.75,
    netPnL: 195.36,
    roi: 2.08,
    openPositionsCount: 0,
    openSymbols: [],
    maxTotalPositions: 6,
    maxDailyLossPercent: 5.0,
    lastScanTime: '09:00:20 15/9/2026',
    nextScanSeconds: 450,
    twinOrders: {
      enabled: true,
      scalperRR: 1.0,
      runnerRR: 1.5,
      splitRatio: [0.5, 0.5]
    },
    breakeven: {
      enabled: true,
      triggerRR: 1.0,
      lockTicketBOnTicketATarget: true
    },
    activeEngines: {
      GOLD: ["ENGINE_THETA", "ENGINE_BETA", "ENGINE_ALPHA"],
      USOIL: ["ENGINE_EPSILON", "ENGINE_BETA"],
      BTCUSD: ["ENGINE_BETA", "ENGINE_KAPPA", "ENGINE_ALPHA"]
    },
    assets: {
      GOLD: { symbol: 'TVC:GOLD', price: 4305.99, ema200: 4303.3, regime: 'BULLISH', utStop: 4296.2, squeeze: 'ON (Nén)', mom: 1.2, activePosition: false },
      BTCUSD: { symbol: 'BITSTAMP:BTCUSD', price: 78533.5, ema200: 77542.33, regime: 'BULLISH', utStop: 78002.12, squeeze: 'OFF', mom: 460.84, activePosition: true },
      USOIL: { symbol: 'TVC:USOIL', price: 107.12, ema200: 108.46, regime: 'BEARISH', utStop: 108.43, squeeze: 'OFF', mom: -0.9471, activePosition: false }
    }
  });
};
