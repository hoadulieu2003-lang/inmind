const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const config = require('./config.json');
const db = require('./database');
const { calculateDailyMetrics } = require('./metrics_calculator');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const JOURNAL_FILE = path.join(__dirname, 'ab_testing_journal.json');
const LOG_FILE = path.join(__dirname, 'daemon_monitor.log');

function resolveArtifactPath(cleanFileName) {
  const publicPath = path.join(PUBLIC_DIR, 'artifacts', cleanFileName);
  if (fs.existsSync(publicPath)) return publicPath;

  const baseBrain = 'C:/Users/game/.gemini/antigravity/brain';
  if (fs.existsSync(baseBrain)) {
    try {
      const dirs = fs.readdirSync(baseBrain, { withFileTypes: true })
        .filter(d => d.isDirectory() && !d.name.startsWith('.'))
        .map(d => ({ name: d.name, mtime: fs.statSync(path.join(baseBrain, d.name)).mtime }))
        .sort((a, b) => b.mtime - a.mtime);
      for (const d of dirs) {
        const candidate = path.join(baseBrain, d.name, cleanFileName);
        if (fs.existsSync(candidate)) return candidate;
      }
    } catch (e) {}
  }
  return null;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function parseAssetsFromLog(openPositions = []) {
  let assetsState = {
    GOLD: { symbol: 'TVC:GOLD', price: 4294.27, ema200: 4305.06, regime: 'BEARISH', utStop: 4268.48, squeeze: 'ON (Nén)', mom: 1.2007, activePosition: false },
    BTCUSD: { symbol: 'BITSTAMP:BTCUSD', price: 78533.50, ema200: 77542.33, regime: 'BULLISH', utStop: 78002.12, squeeze: 'OFF', mom: 460.84, activePosition: true },
    USOIL: { symbol: 'TVC:USOIL', price: 107.22, ema200: 108.46, regime: 'BEARISH', utStop: 108.73, squeeze: 'OFF', mom: 0.1098, activePosition: false },
    GBPUSD: { symbol: 'FX:GBPUSD', price: 1.2950, ema200: 1.2920, regime: 'BULLISH', utStop: 1.2930, squeeze: 'OFF', mom: 0.0005, activePosition: false },
    USDJPY: { symbol: 'FX:USDJPY', price: 156.40, ema200: 155.80, regime: 'BULLISH', utStop: 156.10, squeeze: 'OFF', mom: 0.05, activePosition: false },
    US500: { symbol: 'SP:SPX', price: 5850.00, ema200: 5820.00, regime: 'BULLISH', utStop: 5835.00, squeeze: 'OFF', mom: 5.2, activePosition: false }
  };

  try {
    if (fs.existsSync(LOG_FILE)) {
      const content = fs.readFileSync(LOG_FILE, 'utf-8');
      const lines = content.split('\n').filter(Boolean).slice(-120);
      for (const l of lines) {
        for (const sym of ['GOLD', 'BTCUSD', 'USOIL', 'UKOIL', 'GBPUSD', 'USDJPY', 'US500']) {
          if (l.includes(`[ANALYSIS] ${sym}`)) {
            const targetKey = (sym === 'UKOIL' || sym === 'USOIL') ? 'USOIL' : sym;
            if (!assetsState[targetKey]) assetsState[targetKey] = { symbol: targetKey, price: 0, ema200: 0, regime: 'NEUTRAL', activePosition: false };
            const pMatch = l.match(/Close\s*=\s*([\d\.]+)/);
            const emaMatch = l.match(/EMA 200\s*=\s*([\d\.]+)/);
            const regMatch = l.match(/(BULLISH|BEARISH)/);
            const sqMatch = l.match(/Squeeze:\s*([^\s\|]+(?:\s*\([^\)]+\))?)/);
            const momMatch = l.match(/Mom:\s*([\-\d\.]+)/);
            const utStopMatch = l.match(/UT_Stop:\s*([\d\.]+)/);
            const cciMatch = l.match(/CCI\(20\):\s*([\-\d\.]+)/);

            if (pMatch) assetsState[targetKey].price = parseFloat(pMatch[1]);
            if (emaMatch) assetsState[targetKey].ema200 = parseFloat(emaMatch[1]);
            if (regMatch) assetsState[targetKey].regime = regMatch[1];
            if (sqMatch) assetsState[targetKey].squeeze = sqMatch[1].trim();
            if (momMatch) assetsState[targetKey].mom = parseFloat(momMatch[1]);
            if (utStopMatch) assetsState[targetKey].utStop = parseFloat(utStopMatch[1]);
            if (cciMatch) assetsState[targetKey].cci = parseFloat(cciMatch[1]);
            assetsState[targetKey].activePosition = openPositions.some(p => p.includes(targetKey) || (targetKey === 'BTCUSD' && p === 'BTC') || (targetKey === 'GOLD' && p === 'XAU/USD') || (targetKey === 'USOIL' && (p === 'USOIL' || p === 'OIL')) || (targetKey === 'GBPUSD' && (p === 'GBP/USD' || p === 'GBP')) || (targetKey === 'USDJPY' && (p === 'USD/JPY' || p === 'JPY')) || (targetKey === 'US500' && (p === 'US500' || p === 'SPX')));
          }

          if (l.includes(`[ACTIVE ENGINES] ${sym}`)) {
            const targetKey = (sym === 'UKOIL' || sym === 'USOIL') ? 'USOIL' : sym;
            const ema9Match = l.match(/EMA9:\s*([\d\.]+)/);
            const ema21Match = l.match(/EMA21:\s*([\d\.]+)/);
            const asianHMatch = l.match(/AsianH:\s*([\d\.]+)/);
            const asianLMatch = l.match(/AsianL:\s*([\d\.]+)/);
            const volMatch = l.match(/VolRatio:\s*([\d\.]+)x/);
            const htMatch = l.match(/HT:\s*([^\s\(]+)\s*\(ADX:\s*([\d\.]+)\)/);
            const stMatch = l.match(/ST:\s*([^\s\(]+)\s*\(RSI:\s*([\d\.]+)\)/);
            const deltaMatch = l.match(/Delta:\s*B=(true|false)\/S=(true|false)/);
            const zetaMatch = l.match(/Zeta:\s*B=(true|false)\/S=(true|false)/);

            if (ema9Match) assetsState[targetKey].ema9 = parseFloat(ema9Match[1]);
            if (ema21Match) assetsState[targetKey].ema21 = parseFloat(ema21Match[1]);
            if (asianHMatch) assetsState[targetKey].asianHigh = parseFloat(asianHMatch[1]);
            if (asianLMatch) assetsState[targetKey].asianLow = parseFloat(asianLMatch[1]);
            if (volMatch) assetsState[targetKey].volRatio = parseFloat(volMatch[1]);
            if (htMatch) {
              assetsState[targetKey].htTrend = htMatch[1];
              assetsState[targetKey].adx = parseFloat(htMatch[2]);
            }
            if (stMatch) {
              assetsState[targetKey].stTrend = stMatch[1];
              assetsState[targetKey].rsi = parseFloat(stMatch[2]);
            }
            if (deltaMatch) {
              assetsState[targetKey].deltaBuy = deltaMatch[1] === 'true';
              assetsState[targetKey].deltaSell = deltaMatch[2] === 'true';
            }
            if (zetaMatch) {
              assetsState[targetKey].zetaBuy = zetaMatch[1] === 'true';
              assetsState[targetKey].zetaSell = zetaMatch[2] === 'true';
            }
          }
        }
      }
    }
  } catch (e) {}

  return assetsState;
}

function parseDaemonState() {
  const dataPath = path.join(__dirname, 'data', 'status.json');
  if (fs.existsSync(dataPath)) {
    try {
      const base = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
      const now = new Date();
      const mins = now.getMinutes();
      const secs = now.getSeconds();
      const nextMin = (Math.floor(mins / 15) + 1) * 15;
      let diffSec = (nextMin - mins) * 60 - secs + 5;
      if (diffSec < 0) diffSec += 900;
      base.nextScanSeconds = diffSec;

      // Kiểm tra nhịp tim Heartbeat (< 120s xem là Live Realtime)
      const lastHeartbeat = base.lastHeartbeatTime || 0;
      const isFresh = (Date.now() - lastHeartbeat) < 120000;
      base.daemonActive = isFresh;
      if (!isFresh) {
        base.daemonWarning = 'Tiến trình Daemon không phản hồi trong > 2 phút';
      }

      base.twinOrders = config.risk?.twinOrders || { enabled: true, scalperRR: 1.0, runnerRR: 1.5 };
      base.tieredRisk = config.risk?.tieredRisk || null;
      base.breakeven = config.risk?.breakeven || { enabled: true, triggerRR: 1.0, lockTicketBOnTicketATarget: true };
      base.activeEngines = config.activeEngines;
      base.maxTotalPositions = config.risk?.pyramiding?.maxTotalPositions || 10;
      base.maxDailyLossPercent = config.risk?.maxDailyLossPercent || 20.0;

      // Nếu assets rỗng, lấy dữ liệu từ log
      if (!base.assets || Object.keys(base.assets).length === 0) {
        base.assets = parseAssetsFromLog(base.openSymbols || []);
      }

      // Đảm bảo khối số liệu today & allTime luôn hiện hữu
      if (!base.today) {
        let allTrades = [];
        try {
          const jFile = path.join(__dirname, 'data', 'journal.json');
          if (fs.existsSync(jFile)) allTrades = JSON.parse(fs.readFileSync(jFile, 'utf8'));
        } catch (e) {}
        const calculated = calculateDailyMetrics(now, allTrades, base);
        base.today = calculated.today;
        base.allTime = calculated.allTime;
      }

      return base;
    } catch (e) {}
  }

  let equity = 9525.66;
  let balance = 9419.78;
  let openPositions = ['BTC'];
  let lastScan = null;
  let nextScanSeconds = 900;
  let assetsState = {
    GOLD: { symbol: 'TVC:GOLD', price: 4294.27, ema200: 4305.06, regime: 'BEARISH', utStop: 4268.48, squeeze: 'ON (Nén)', mom: 1.2007, activePosition: false },
    BTCUSD: { symbol: 'BITSTAMP:BTCUSD', price: 78533.50, ema200: 77542.33, regime: 'BULLISH', utStop: 78002.12, squeeze: 'OFF', mom: 460.84, activePosition: true },
    USOIL: { symbol: 'TVC:USOIL', price: 107.22, ema200: 108.46, regime: 'BEARISH', utStop: 108.73, squeeze: 'OFF', mom: 0.1098, activePosition: false }
  };

  try {
    if (fs.existsSync(LOG_FILE)) {
      const content = fs.readFileSync(LOG_FILE, 'utf-8');
      const lines = content.split('\n').filter(Boolean).slice(-60);
      
      for (const l of lines) {
        // Exness status
        const eqMatch = l.match(/\[EXNESS STATUS\] Vốn:\s*\$([\d,\.]+)/);
        if (eqMatch) equity = parseFloat(eqMatch[1].replace(/,/g, ''));
        
        const posMatch = l.match(/Vị thế mở \((\d+)\):\s*\[(.*?)\]/);
        if (posMatch) {
          openPositions = posMatch[2] ? posMatch[2].split(',').map(s => s.trim()).filter(Boolean) : [];
        }

        // Analysis parsing
        for (const sym of ['GOLD', 'BTCUSD', 'USOIL', 'UKOIL']) {
          if (l.includes(`[ANALYSIS] ${sym}`)) {
            const targetKey = (sym === 'UKOIL' || sym === 'USOIL') ? 'USOIL' : sym;
            const pMatch = l.match(/Close\s*=\s*([\d\.]+)/);
            const emaMatch = l.match(/EMA 200\s*=\s*([\d\.]+)/);
            const regMatch = l.match(/(BULLISH|BEARISH)/);
            const sqMatch = l.match(/Squeeze:\s*([^\s\|]+(?:\s*\([^\)]+\))?)/);
            const momMatch = l.match(/Mom:\s*([\-\d\.]+)/);
            const utStopMatch = l.match(/UT_Stop:\s*([\d\.]+)/);
            const cciMatch = l.match(/CCI\(20\):\s*([\-\d\.]+)/);

            if (pMatch) assetsState[targetKey].price = parseFloat(pMatch[1]);
            if (emaMatch) assetsState[targetKey].ema200 = parseFloat(emaMatch[1]);
            if (regMatch) assetsState[targetKey].regime = regMatch[1];
            if (sqMatch) assetsState[targetKey].squeeze = sqMatch[1].trim();
            if (momMatch) assetsState[targetKey].mom = parseFloat(momMatch[1]);
            if (utStopMatch) assetsState[targetKey].utStop = parseFloat(utStopMatch[1]);
            if (cciMatch) assetsState[targetKey].cci = parseFloat(cciMatch[1]);
            assetsState[targetKey].activePosition = openPositions.some(p => p.includes(targetKey) || (targetKey === 'BTCUSD' && p === 'BTC') || (targetKey === 'GOLD' && p === 'XAU/USD') || (targetKey === 'USOIL' && (p === 'USOIL' || p === 'OIL')));
          }

          if (l.includes(`[ACTIVE ENGINES] ${sym}`)) {
            const targetKey = (sym === 'UKOIL' || sym === 'USOIL') ? 'USOIL' : sym;
            const ema9Match = l.match(/EMA9:\s*([\d\.]+)/);
            const ema21Match = l.match(/EMA21:\s*([\d\.]+)/);
            const asianHMatch = l.match(/AsianH:\s*([\d\.]+)/);
            const asianLMatch = l.match(/AsianL:\s*([\d\.]+)/);
            const volMatch = l.match(/VolRatio:\s*([\d\.]+)x/);
            const htMatch = l.match(/HT:\s*([^\s\(]+)\s*\(ADX:\s*([\d\.]+)\)/);
            const stMatch = l.match(/ST:\s*([^\s\(]+)\s*\(RSI:\s*([\d\.]+)\)/);
            const deltaMatch = l.match(/Delta:\s*B=(true|false)\/S=(true|false)/);
            const zetaMatch = l.match(/Zeta:\s*B=(true|false)\/S=(true|false)/);

            if (ema9Match) assetsState[targetKey].ema9 = parseFloat(ema9Match[1]);
            if (ema21Match) assetsState[targetKey].ema21 = parseFloat(ema21Match[1]);
            if (asianHMatch) assetsState[targetKey].asianHigh = parseFloat(asianHMatch[1]);
            if (asianLMatch) assetsState[targetKey].asianLow = parseFloat(asianLMatch[1]);
            if (volMatch) assetsState[targetKey].volRatio = parseFloat(volMatch[1]);
            if (htMatch) {
              assetsState[targetKey].htTrend = htMatch[1];
              assetsState[targetKey].adx = parseFloat(htMatch[2]);
            }
            if (stMatch) {
              assetsState[targetKey].stTrend = stMatch[1];
              assetsState[targetKey].rsi = parseFloat(stMatch[2]);
            }
            if (deltaMatch) {
              assetsState[targetKey].deltaBuy = deltaMatch[1] === 'true';
              assetsState[targetKey].deltaSell = deltaMatch[2] === 'true';
            }
            if (zetaMatch) {
              assetsState[targetKey].zetaBuy = zetaMatch[1] === 'true';
              assetsState[targetKey].zetaSell = zetaMatch[2] === 'true';
            }
          }
        }

        if (l.includes('CHU TRÌNH QUÉT M15') || l.includes('EXNESS STATUS') || l.includes('SCANNING') || l.includes('ANALYSIS')) {
          const tMatch = l.match(/\[(\d{2}:\d{2}:\d{2}[^\]]*)\]/);
          if (tMatch) lastScan = tMatch[1];
        }
      }
    }
  } catch (e) {}

  if (!lastScan) {
    const now = new Date();
    const curMins = now.getMinutes();
    const lastBarMins = Math.floor(curMins / 15) * 15;
    const barDate = new Date(now);
    barDate.setMinutes(lastBarMins, 0, 0);
    lastScan = barDate.toLocaleTimeString('vi-VN', { hour12: false, timeZone: 'Asia/Ho_Chi_Minh' });
  }

  // Calculate time to next scan (at second 05 of M15)
  const now = new Date();
  const mins = now.getMinutes();
  const secs = now.getSeconds();
  const nextMin = (Math.floor(mins / 15) + 1) * 15;
  let diffSec = (nextMin - mins) * 60 - secs + 5;
  if (diffSec < 0) diffSec += 900;
  nextScanSeconds = diffSec;

  let allTrades = [];
  try {
    const jFile = path.join(__dirname, 'data', 'journal.json');
    if (fs.existsSync(jFile)) allTrades = JSON.parse(fs.readFileSync(jFile, 'utf8'));
  } catch (e) {}
  const calculated = calculateDailyMetrics(now, allTrades, { equity, balance });

  return {
    daemonActive: true,
    equity,
    initialBalance: 9388.75,
    netPnL: +(equity - 9388.75).toFixed(2),
    roi: +(((equity - 9388.75) / 9388.75) * 100).toFixed(2),
    today: calculated.today,
    allTime: calculated.allTime,
    openPositionsCount: openPositions.length,
    openSymbols: openPositions,
    lastScanTime: lastScan,
    nextScanSeconds,
    twinOrders: config.risk?.twinOrders || { enabled: true, scalperRR: 1.0, runnerRR: 1.5 },
    tieredRisk: config.risk?.tieredRisk || null,
    activeEngines: config.activeEngines,
    maxTotalPositions: config.risk?.pyramiding?.maxTotalPositions || 6,
    maxDailyLossPercent: config.risk?.maxDailyLossPercent || 5.0,
    assets: assetsState
  };
}

const server = http.createServer(async (req, res) => {
  let pathname = '/';
  try {
    const parsed = new URL(req.url, `http://${req.headers.host || '127.0.0.1:3000'}`);
    pathname = parsed.pathname;
  } catch (e) {
    pathname = req.url.split('?')[0];
  }

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const TUNNEL_URL = 'https://teams-superintendent-earlier-core.trycloudflare.com';

  // 1. API: System Status & Multi-Asset Telemetry
  if (pathname === '/api/status') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (process.env.VERCEL) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2500);
        const liveRes = await fetch(`${TUNNEL_URL}/api/status`, {
          signal: controller.signal,
          headers: { 'Cache-Control': 'no-cache' }
        });
        clearTimeout(timeout);
        if (liveRes.ok) {
          const liveData = await liveRes.json();
          res.writeHead(200);
          res.end(JSON.stringify(liveData, null, 2));
          return;
        }
      } catch (e) {}
    }
    res.writeHead(200);
    res.end(JSON.stringify(parseDaemonState(), null, 2));
    return;
  }

  // 2. API: A/B Testing Journal (Query trực tiếp từ SQLite WAL với fallback an toàn)
  if (pathname === '/api/journal') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (process.env.VERCEL) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2500);
        const liveRes = await fetch(`${TUNNEL_URL}/api/journal`, {
          signal: controller.signal,
          headers: { 'Cache-Control': 'no-cache' }
        });
        clearTimeout(timeout);
        if (liveRes.ok) {
          const liveData = await liveRes.json();
          res.writeHead(200);
          res.end(JSON.stringify(liveData, null, 2));
          return;
        }
      } catch (e) {}
    }
    try {
      const trades = await db.getAllTrades();
      if (trades && trades.length > 0) {
        res.writeHead(200);
        res.end(JSON.stringify(trades, null, 2));
        return;
      }
      if (fs.existsSync(JOURNAL_FILE)) {
        res.writeHead(200);
        res.end(fs.readFileSync(JOURNAL_FILE, 'utf-8'));
      } else {
        res.writeHead(200);
        res.end(JSON.stringify([]));
      }
    } catch (err) {
      if (fs.existsSync(JOURNAL_FILE)) {
        try {
          res.writeHead(200);
          res.end(fs.readFileSync(JOURNAL_FILE, 'utf-8'));
          return;
        } catch (e) {}
      }
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 3. API: Autonomous Learning Agent (Tri thức tự học định lượng)
  if (pathname === '/api/learning') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const learningDir = path.join(__dirname, 'data', 'learning');
    let latestReport = null;
    let latestMarkdown = '';
    try {
      if (fs.existsSync(learningDir)) {
        const files = fs.readdirSync(learningDir).filter(f => f.endsWith('.md')).sort().reverse();
        if (files.length > 0) {
          latestReport = files[0];
          latestMarkdown = fs.readFileSync(path.join(learningDir, latestReport), 'utf-8');
        }
      }
      const statusFile = path.join(__dirname, 'data', 'status.json');
      let statusData = {};
      if (fs.existsSync(statusFile)) {
        statusData = JSON.parse(fs.readFileSync(statusFile, 'utf-8'));
      }
      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        lastLearningCycle: statusData.lastLearningCycle || null,
        latestReportFile: latestReport,
        reportMarkdown: latestMarkdown
      }, null, 2));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  if (pathname === '/api/learning/trigger') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    try {
      const AutonomousLearningAgent = require('./autonomous_learning_agent');
      const agent = new AutonomousLearningAgent({ dryRun: false });
      const result = await agent.runCycle();
      res.writeHead(200);
      res.end(JSON.stringify(result, null, 2));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // 4. API: Artifact Evidence Images
  if (pathname.startsWith('/api/artifacts/') || pathname.startsWith('/artifacts/')) {
    const rawFile = pathname.replace(/^\/(?:api\/)?artifacts\//, '');
    const cleanFileName = path.basename(decodeURIComponent(rawFile));
    const targetPath = resolveArtifactPath(cleanFileName);

    if (targetPath && fs.existsSync(targetPath)) {
      const ext = path.extname(targetPath).toLowerCase();
      const mime = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'public, max-age=3600' });
      const stream = fs.createReadStream(targetPath);
      stream.on('error', () => { try { res.destroy(); } catch (e) {} });
      stream.pipe(res);
      return;
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Artifact Not Found: ' + cleanFileName);
      return;
    }
  }

  // 4. Static Files
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  const ext = path.extname(filePath).toLowerCase();

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => { try { res.destroy(); } catch (e) {} });
    stream.pipe(res);
  } else {
    // Fallback to index.html for SPA routing
    const fallbackPath = path.join(PUBLIC_DIR, 'index.html');
    if (fs.existsSync(fallbackPath)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      const stream = fs.createReadStream(fallbackPath);
      stream.on('error', () => { try { res.destroy(); } catch (e) {} });
      stream.pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
    }
  }
});

server.on('clientError', (err, socket) => {
  if (err.code === 'ECONNRESET' || !socket.writable) return;
  socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

let retryCount = 0;
function listenPort(port) {
  server.removeAllListeners('error');
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      retryCount++;
      if (retryCount <= 3) {
        console.warn(`[SERVER WARNING] Cổng ${port} đang bận (TimeWait). Tự động thử lại sau 1.5 giây (Lần ${retryCount}/3)...`);
        setTimeout(() => listenPort(port), 1500);
      } else {
        const altPort = port === 3000 ? 3300 : port + 1;
        console.warn(`[SERVER WARNING] Cổng ${port} bận liên tục. Tự động chuyển sang cổng dự phòng: http://localhost:${altPort}`);
        listenPort(altPort);
      }
    } else {
      console.error('[SERVER ERROR]', err.message);
    }
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`[DASHBOARD SERVER] 🚀 Trạm giám sát giao dịch trực tuyến tại: http://localhost:${port}`);
  });
}

listenPort(PORT);

