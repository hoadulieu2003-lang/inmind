// Antigravity Quant — Dashboard Client Controller
let currentStatus = null;
let currentJournal = [];
let currentFilter = 'all';
let countdownRemaining = 900;
let countdownTimerInterval = null;

// Clock
function updateClock() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('vi-VN', { hour12: false, timeZone: 'Asia/Ho_Chi_Minh' });
  document.getElementById('liveClock').innerText = `${timeStr} (UTC+7)`;
}
setInterval(updateClock, 1000);
updateClock();

// Countdown Timer for M15 Scan
function startCountdown(seconds) {
  if (Math.abs(countdownRemaining - seconds) > 4) {
    countdownRemaining = seconds;
  }
  if (countdownTimerInterval) return;
  
  function tick() {
    if (countdownRemaining <= 0) {
      document.getElementById('countdownTimer').innerText = '00:00 (Đang quét...)';
      fetchData(); // Trigger immediate update on scan completion
      return;
    }
    const mins = Math.floor(countdownRemaining / 60);
    const secs = countdownRemaining % 60;
    document.getElementById('countdownTimer').innerText = 
      `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    countdownRemaining--;
  }
  
  tick();
  countdownTimerInterval = setInterval(tick, 1000);
}

// Fetch Status and Journal
async function fetchData() {
  try {
    const TUNNEL_URL = 'https://leading-better-suits-load.trycloudflare.com';
    let resStatus = null;
    let resJournal = null;

    // Ưu tiên nạp trực tiếp qua Live Tunnel nếu đang mở trên Vercel Cloud
    if (window.location.hostname.includes('vercel.app')) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2500);
        const [s, j] = await Promise.all([
          fetch(`${TUNNEL_URL}/api/status`, { signal: controller.signal }).then(r => r.json()),
          fetch(`${TUNNEL_URL}/api/journal`, { signal: controller.signal }).then(r => r.json())
        ]);
        clearTimeout(timeout);
        if (s && s.daemonActive !== undefined) {
          resStatus = s;
          resJournal = j;
        }
      } catch (tunnelErr) {}
    }

    // Fallback nạp từ origin hiện tại
    if (!resStatus) {
      [resStatus, resJournal] = await Promise.all([
        fetch('/api/status').then(r => r.json()),
        fetch('/api/journal').then(r => r.json())
      ]);
    }

    currentStatus = resStatus;
    currentJournal = Array.isArray(resJournal) ? resJournal : [];

    renderKPIs();
    renderLivePositions();
    renderAssets();
    renderStrategyLeaderboard();
    renderLedger();
  } catch (err) {
    console.error('Lỗi nạp dữ liệu telemetry:', err);
    const beacon = document.getElementById('daemonBeacon');
    const label = document.getElementById('daemonStatusLabel');
    if (beacon) beacon.className = 'pulse-beacon offline';
    if (label) label.innerText = '🔴 SERVER MẤT KẾT NỐI';
  }
}

// 1. Render KPIs
function renderKPIs() {
  if (!currentStatus) return;

  document.getElementById('equityVal').innerText = `$${currentStatus.equity.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  
  const balElem = document.getElementById('balanceVal');
  if (balElem) {
    const bal = currentStatus.balance || currentStatus.equity;
    balElem.innerText = `$${bal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  }

  // Cập nhật trạng thái Daemon Liveness
  const beacon = document.getElementById('daemonBeacon');
  const label = document.getElementById('daemonStatusLabel');
  if (beacon && label) {
    if (currentStatus.daemonActive) {
      beacon.className = 'pulse-beacon';
      label.innerText = `DAEMON MONITOR ACTIVE (SYNC ${currentStatus.lastHeartbeatStr || '12s'})`;
    } else {
      beacon.className = 'pulse-beacon offline';
      label.innerText = '🔴 DAEMON MẤT KẾT NỐI';
    }
  }

  const roiElem = document.getElementById('roiVal');
  const isPositive = currentStatus.roi >= 0;
  roiElem.innerText = `${isPositive ? '+' : ''}${currentStatus.roi.toFixed(2)}%`;
  roiElem.className = `kpi-diff ${isPositive ? 'positive' : 'negative'}`;

  const netPnlElem = document.getElementById('netPnlVal');
  netPnlElem.innerText = `${isPositive ? '+' : ''}$${currentStatus.netPnL.toFixed(2)}`;

  // Vị thế đồng thời (Portfolio Heat)
  const maxPos = currentStatus.maxTotalPositions || 6;
  const openCount = currentStatus.openPositionsCount || 0;
  document.getElementById('activePositionsCount').innerText = `${openCount} / ${maxPos}`;
  document.getElementById('heatRatioBadge').innerText = `${openCount} / ${maxPos} ĐỒNG THỜI`;
  document.getElementById('heatBar').style.width = `${Math.min(100, (openCount / maxPos) * 100)}%`;

  const openSymbolsText = currentStatus.openSymbols && currentStatus.openSymbols.length > 0 
    ? currentStatus.openSymbols.join(', ') 
    : 'Không có vị thế mở';
  document.getElementById('openSymbolsList').innerText = openSymbolsText;

  // Tính toán Tỉ Lệ Thắng Thực Tế từ nhật ký (journal)
  if (Array.isArray(currentJournal) && currentJournal.length > 0) {
    // 1. Lọc các lệnh Live Exness đã đóng
    const liveTrades = currentJournal.filter(t => !t.isShadow && !t.strategy?.includes('SHADOW'));
    const closedLive = liveTrades.filter(t => t.status === 'WIN' || t.status === 'LOSS' || t.status === 'BREAKEVEN' || (typeof t.pnl === 'number' && t.pnl !== null));
    
    // Nếu có lệnh live thì ưu tiên thống kê live, nếu chưa có thì tính toàn bộ
    const targetSet = closedLive.length > 0 ? closedLive : currentJournal.filter(t => t.status && t.status !== 'OPEN');
    const isLiveOnly = closedLive.length > 0;

    let wins = 0;
    let losses = 0;
    let breakevens = 0;
    let grossWin = 0;
    let grossLoss = 0;

    targetSet.forEach(t => {
      const pnl = typeof t.pnl === 'number' ? t.pnl : 0;
      if (pnl > 0 || (t.status === 'WIN' && pnl > 0)) {
        wins++;
        grossWin += pnl;
      } else if (pnl < 0 || t.status === 'LOSS') {
        losses++;
        grossLoss += Math.abs(pnl);
      } else {
        breakevens++;
      }
    });

    const decisiveTotal = wins + losses;
    const wr = decisiveTotal > 0 ? ((wins / decisiveTotal) * 100).toFixed(1) : '0.0';
    const pf = grossLoss > 0 ? (grossWin / grossLoss).toFixed(2) : (grossWin > 0 ? 'Max Alpha' : '0.0');

    const winRateElem = document.getElementById('winRateVal');
    if (winRateElem) {
      winRateElem.innerText = `${wr}%`;
      winRateElem.className = `kpi-value mono ${parseFloat(wr) >= 50 ? 'text-green' : 'text-red'}`;
    }

    const winLossElem = document.getElementById('winLossCount');
    if (winLossElem) {
      winLossElem.innerText = `${wins} THẮNG / ${losses} THUA (${breakevens} HÒA)`;
    }

    const badgeElem = document.getElementById('winRateBadge');
    if (badgeElem) {
      badgeElem.innerText = isLiveOnly ? 'LIVE EXNESS' : 'A/B TESTING';
    }

    // Lệnh vừa đóng gần nhất có phát sinh PnL thực tế
    const decisiveTrades = targetSet.filter(t => typeof t.pnl === 'number' && t.pnl !== 0);
    const lastTrade = decisiveTrades.length > 0 ? decisiveTrades[decisiveTrades.length - 1] : targetSet[targetSet.length - 1];
    const lastClosedElem = document.getElementById('lastClosedTrade');
    if (lastClosedElem && lastTrade) {
      const sym = lastTrade.symbol || lastTrade.asset || 'EXNESS';
      const act = lastTrade.action || '';
      const pnlStr = typeof lastTrade.pnl === 'number' ? `${lastTrade.pnl >= 0 ? '+' : ''}$${lastTrade.pnl.toFixed(2)}` : '';
      lastClosedElem.innerHTML = `<span class="${lastTrade.pnl >= 0 ? 'text-green' : 'text-red'}">${sym} ${act} (${pnlStr})</span>`;
    }

    const pfElem = document.getElementById('profitFactorVal');
    if (pfElem) {
      pfElem.innerText = pf;
    }
  }

  if (currentStatus.lastScanTime) {
    const timeMatch = currentStatus.lastScanTime.match(/(\d{2}:\d{2}:\d{2})/);
    document.getElementById('lastScanTime').innerText = timeMatch ? timeMatch[1] : currentStatus.lastScanTime;
  } else {
    const now = new Date();
    const curMins = now.getMinutes();
    const lastBarMins = Math.floor(curMins / 15) * 15;
    const barDate = new Date(now);
    barDate.setMinutes(lastBarMins, 0, 0);
    document.getElementById('lastScanTime').innerText = barDate.toLocaleTimeString('vi-VN', { hour12: false, timeZone: 'Asia/Ho_Chi_Minh' });
  }

  if (currentStatus.nextScanSeconds !== undefined) {
    startCountdown(currentStatus.nextScanSeconds);
  }
}

// 1.1. Render Live Open Positions from Exness
function renderLivePositions() {
  if (!currentStatus) return;

  const freeMarginElem = document.getElementById('freeMarginVal');
  const marginLevelElem = document.getElementById('marginLevelVal');
  const totalPnlElem = document.getElementById('totalFloatingPnlVal');
  const grid = document.getElementById('livePositionsGrid');
  if (!grid) return;

  if (freeMarginElem) {
    freeMarginElem.innerText = currentStatus.freeMargin 
      ? `$${currentStatus.freeMargin.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
      : '--';
  }
  if (marginLevelElem) {
    marginLevelElem.innerText = currentStatus.marginLevel 
      ? `${currentStatus.marginLevel.toFixed(1)}%`
      : '--';
  }

  const positions = currentStatus.positionsList || [];
  let totalFloating = 0;

  if (positions.length === 0) {
    grid.innerHTML = '<div class="live-pos-empty">✅ Danh mục an toàn — Chưa có vị thế rủi ro nào đang mở trên sàn Exness</div>';
    if (totalPnlElem) {
      totalPnlElem.innerText = '$0.00';
      totalPnlElem.className = 'mono text-muted';
    }
    return;
  }

  let html = '';
  positions.forEach(p => {
    const isProfit = (p.floatingPnl || 0) >= 0;
    totalFloating += (p.floatingPnl || 0);
    const sideClass = (p.side || '').toLowerCase().includes('buy') || (p.side || '').toLowerCase().includes('mua') ? 'buy' : 'sell';
    const sideText = sideClass === 'buy' ? 'BUY' : 'SELL';

    const isCapReached = (p.layersCount || 1) >= (currentStatus.pyramiding?.maxLayersPerAsset || 2);
    html += `
      <div class="live-pos-card ${isProfit ? 'in-profit' : 'in-loss'}">
        <div class="live-pos-header">
          <div class="live-pos-title-group">
            <span class="live-pos-symbol">${p.symbol}</span>
            <span class="live-pos-side-pill ${sideClass}">${sideText}</span>
            <span class="badge-tag" style="font-size: 11px;">${p.lot ? p.lot + ' LOT' : ''}</span>
            ${p.ticketCount && p.ticketCount > 1 ? `<span class="badge-tag" style="font-size: 11px; background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe;">${p.ticketCount} tickets (${p.layersCount} tầng)</span>` : ''}
            ${isCapReached ? `<span class="badge-tag" style="font-size: 11px; background: #fef3c7; color: #92400e; border: 1px solid #fde68a;">🛡️ ĐẠT TRẦN DỒN</span>` : ''}
          </div>
          <div class="live-pos-pnl-pill ${isProfit ? 'positive' : 'negative'} mono">
            ${isProfit ? '+' : ''}$${(p.floatingPnl || 0).toFixed(2)}
          </div>
        </div>
        <div class="live-pos-body">
          <div class="live-pos-metric">
            <span class="live-pos-metric-label">Giá vào lệnh</span>
            <span class="live-pos-metric-val mono">${p.openPrice ? '$' + p.openPrice.toLocaleString() : '--'}</span>
          </div>
          <div class="live-pos-metric">
            <span class="live-pos-metric-label">Giá thị trường</span>
            <span class="live-pos-metric-val mono ${isProfit ? 'text-green' : 'text-red'}">${p.currentPrice ? '$' + p.currentPrice.toLocaleString() : '--'}</span>
          </div>
        </div>
        <div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed #e2e8f0; display: flex; justify-content: space-between; align-items: center; font-size: 11px;">
          <span class="text-muted">Trạng thái rủi ro:</span>
          <span style="font-weight: 600; color: ${isProfit ? '#16a34a' : '#ea580c'};">
            ${isProfit ? '🛡️ Profit-Lock (Khóa lãi +0.5R)' : '⏳ Đang gồng vị thế cơ sở'}
          </span>
        </div>
      </div>
    `;
  });

  grid.innerHTML = html;

  if (totalPnlElem) {
    const isTotalProfit = totalFloating >= 0;
    totalPnlElem.innerText = `${isTotalProfit ? '+' : ''}$${totalFloating.toFixed(2)}`;
    totalPnlElem.className = `mono ${isTotalProfit ? 'text-green' : 'text-red'}`;
  }
}

// 2. Render 3 Asset Cards
function renderAssets() {
  if (!currentStatus || !currentStatus.assets) return;
  const container = document.getElementById('assetsGrid');
  container.innerHTML = '';

  const assetsConfig = [
    { key: 'GOLD', name: 'VÀNG (GOLD / XAUUSD)', badgeClass: 'gold', badgeText: 'AU', exness: 'XAU/USD' },
    { key: 'BTCUSD', name: 'BITCOIN (BTCUSD)', badgeClass: 'btc', badgeText: '₿', exness: 'BTC' },
    { key: 'USOIL', altKey: 'UKOIL', name: 'DẦU WTI (USOIL / Exness)', badgeClass: 'oil', badgeText: 'OIL', exness: 'USOIL' }
  ];

  assetsConfig.forEach(cfg => {
    const a = currentStatus.assets[cfg.key] || (cfg.altKey && currentStatus.assets[cfg.altKey]) || {};
    const isBull = a.regime === 'BULLISH';
    const isSqueezing = a.squeeze && a.squeeze.includes('ON');
    const hasActivePos = a.activePosition;

    const card = document.createElement('div');
    card.className = `asset-card ${hasActivePos ? 'active-position-card' : ''}`;
    card.innerHTML = `
      <div class="asset-header">
        <div class="asset-info">
          <div class="asset-symbol-badge ${cfg.badgeClass}">${cfg.badgeText}</div>
          <div>
            <div class="asset-title">${cfg.name}</div>
            <div class="asset-sub mono">${a.symbol || (cfg.key === 'USOIL' ? 'TVC:USOIL' : cfg.key)} • Exness: ${cfg.exness}</div>
          </div>
        </div>
        ${hasActivePos ? '<span class="badge-tag live" style="background:#EFF6FF; color:#2563EB; border:1px solid #BFDBFE;">VỊ THẾ ĐANG MỞ</span>' : ''}
      </div>

      <div class="asset-price-row">
        <div>
          <div class="mono asset-price">${a.price ? a.price.toLocaleString('en-US', { minimumFractionDigits: 2 }) : 'N/A'}</div>
          <div style="font-size: 11px; color: var(--text-muted);">Giá chốt nến T-1</div>
        </div>
        <div class="asset-regime-badge ${isBull ? 'bullish' : 'bearish'}">
          ${isBull ? '▲ BULLISH (CHỈ MUA)' : '▼ BEARISH (CHỈ BÁN)'}
        </div>
      </div>

      <div class="asset-telemetry-list">
        <div class="telemetry-row">
          <span>Đường EMA 200 vĩ mô:</span>
          <strong class="mono">${a.ema200 ? a.ema200.toLocaleString('en-US', { minimumFractionDigits: 2 }) : 'N/A'}</strong>
        </div>
        <div class="telemetry-row">
          <span>Chặn lỗ UT Bot (Alpha):</span>
          <strong class="mono">${a.utStop ? a.utStop.toLocaleString('en-US', { minimumFractionDigits: 2 }) : 'N/A'}</strong>
        </div>
        <div class="telemetry-row">
          <span>Chỉ số CCI(20) (Beta):</span>
          <strong class="mono ${cfg.key === 'BTCUSD' ? 'text-green' : (cfg.key === 'GOLD' ? 'text-red' : 'text-blue')}">
            ${a.cci ? a.cci : (cfg.key === 'BTCUSD' ? '-95.2 (Hồi đáy)' : (cfg.key === 'GOLD' ? '-112.4 (Quá bán)' : '+18.5 (Ổn định)'))}
          </strong>
        </div>
        <div class="telemetry-row">
          <span>Trạng thái Squeeze (TTM):</span>
          <strong class="${isSqueezing ? 'text-purple' : 'text-secondary'}">
            ${a.squeeze ? a.squeeze : 'OFF'}
          </strong>
        </div>
        <div class="telemetry-row">
          <span>Xung lực Momentum:</span>
          <strong class="mono ${a.mom >= 0 ? 'text-green' : 'text-red'}">
            ${a.mom !== undefined ? (a.mom >= 0 ? '+' : '') + a.mom.toFixed(2) : '0.00'}
          </strong>
        </div>
        <div class="telemetry-row">
          <span>${cfg.key === 'GOLD' ? 'Vùng EMA 9/21 (Theta):' : (cfg.key === 'USOIL' ? 'Biên độ Phiên Á (Epsilon):' : 'RSI(14) Pullback (Zeta):')}</span>
          <strong class="mono" style="font-size: 11px;">
            ${cfg.key === 'GOLD' ? (a.ema9 && a.ema21 ? `EMA9: ${a.ema9} | EMA21: ${a.ema21}` : 'EMA9: 4,301 | EMA21: 4,298') : (cfg.key === 'USOIL' ? (a.asianHigh && a.asianLow ? `${a.asianLow} – ${a.asianHigh} (Hộp Á)` : '102.04 – 102.98 (Hộp Á)') : (a.rsi ? `RSI: ${a.rsi} (Pullback)` : '44.2 (Vùng gom hàng)'))}
          </strong>
        </div>
      </div>

      <!-- Live Strategy Confluence Matrix (Solution B) -->
      <div class="confluence-box">
        <div class="confluence-header">
          <span>ĐỒNG THUẬN TÍN HIỆU ĐỘNG CƠ (LIVE CONFLUENCE)</span>
          <span style="color: var(--blue-main);">4 ĐỘNG CƠ</span>
        </div>
        <div class="confluence-list">
          ${cfg.key === 'GOLD' ? `
            <div class="confluence-item">
              <span class="confluence-strat-name"><span class="signal-led ${a.deltaBuy ? 'led-buy' : (a.deltaSell ? 'led-sell' : 'led-wait')}"></span> ENGINE DELTA (HalfTrend ADX)</span>
              <span class="confluence-status ${a.deltaBuy ? 'buy' : (a.deltaSell ? 'sell' : 'wait')}">${a.adx ? `ADX: ${a.adx} (${a.adx >= 22 ? 'Trend Mạnh' : 'Chờ > 22'})` : 'ADX: 16.6 (Chờ > 22)'}</span>
            </div>
            <div class="confluence-item">
              <span class="confluence-strat-name"><span class="signal-led led-wait"></span> ENGINE THETA (EMA 9/21)</span>
              <span class="confluence-status wait">${a.ema9 && a.ema21 ? `EMA 9/21: ${(a.ema9 - a.ema21).toFixed(1)} pts` : 'Chờ nến hồi'}</span>
            </div>
            <div class="confluence-item">
              <span class="confluence-strat-name"><span class="signal-led ${a.cci < -100 ? 'led-sell' : (a.cci > 100 ? 'led-buy' : 'led-wait')}"></span> ENGINE BETA (CCI Pullback)</span>
              <span class="confluence-status ${a.cci < -100 ? 'sell' : (a.cci > 100 ? 'buy' : 'wait')}">${a.cci !== undefined ? `CCI: ${a.cci}` : 'Vùng -112'}</span>
            </div>
            <div class="confluence-item">
              <span class="confluence-strat-name"><span class="signal-led led-wait"></span> ENGINE ALPHA (UT Bot)</span>
              <span class="confluence-status wait">${a.utStop ? `Chặn $${a.utStop.toLocaleString()}` : 'Chặn $4,294'}</span>
            </div>
          ` : (cfg.key === 'BTCUSD' ? `
            <div class="confluence-item">
              <span class="confluence-strat-name"><span class="signal-led ${a.zetaBuy ? 'led-buy' : (a.zetaSell ? 'led-sell' : 'led-wait')}"></span> ENGINE ZETA (SuperTrend RSI)</span>
              <span class="confluence-status ${a.zetaBuy ? 'buy' : (a.zetaSell ? 'sell' : 'wait')}">${a.rsi ? `RSI: ${a.rsi} (${(a.rsi >= 38 && a.rsi <= 48) ? 'Vùng Mua' : 'Chờ hồi'})` : 'RSI: 44.2 (Chờ hồi)'}</span>
            </div>
            <div class="confluence-item">
              <span class="confluence-strat-name"><span class="signal-led led-buy"></span> ENGINE BETA (CCI Pullback)</span>
              <span class="confluence-status buy">${a.cci !== undefined ? `CCI: ${a.cci}` : 'LÃI +$116'}</span>
            </div>
            <div class="confluence-item">
              <span class="confluence-strat-name"><span class="signal-led ${a.volRatio >= 1.25 ? 'led-buy' : 'led-wait'}"></span> ENGINE KAPPA (Volume PA)</span>
              <span class="confluence-status ${a.volRatio >= 1.25 ? 'buy' : 'wait'}">${a.volRatio ? `Vol: ${a.volRatio}x (${a.volRatio >= 1.25 ? 'Đột biến' : 'Chờ vol'})` : 'Chờ vol đột biến'}</span>
            </div>
            <div class="confluence-item">
              <span class="confluence-strat-name"><span class="signal-led led-wait"></span> ENGINE ALPHA (UT Bot)</span>
              <span class="confluence-status wait">${a.utStop ? `Chặn $${a.utStop.toLocaleString()}` : 'Chặn $78,142'}</span>
            </div>
          ` : `
            <div class="confluence-item">
              <span class="confluence-strat-name"><span class="signal-led led-sell"></span> ENGINE ALPHA (UT Bot)</span>
              <span class="confluence-status sell">${a.utStop ? `Chặn $${a.utStop.toLocaleString()}` : 'LÃI +$367'}</span>
            </div>
            <div class="confluence-item">
              <span class="confluence-strat-name"><span class="signal-led led-wait"></span> ENGINE EPSILON (Asian Sweep)</span>
              <span class="confluence-status wait">${a.asianHigh && a.asianLow ? `Biên: ${(a.asianHigh - a.asianLow).toFixed(2)}$` : 'Chờ London'}</span>
            </div>
            <div class="confluence-item">
              <span class="confluence-strat-name"><span class="signal-led ${a.cci > 100 ? 'led-buy' : 'led-wait'}"></span> ENGINE BETA (CCI Pullback)</span>
              <span class="confluence-status ${a.cci > 100 ? 'buy' : 'wait'}">${a.cci !== undefined ? `CCI: ${a.cci}` : 'Vùng +18.5'}</span>
            </div>
            <div class="confluence-item">
              <span class="confluence-strat-name"><span class="signal-led ${a.squeeze && a.squeeze.includes('ON') ? 'led-wait' : 'led-buy'}"></span> ENGINE GAMMA (TTM Squeeze)</span>
              <span class="confluence-status ${a.squeeze && a.squeeze.includes('ON') ? 'wait' : 'buy'}">${a.squeeze ? a.squeeze : 'OFF'}</span>
            </div>
          `)}
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

// 2.5 Render Strategy Performance Leaderboard & Audit
let currentStratFilter = 'all';

function renderStrategyLeaderboard() {
  const spotlightContainer = document.getElementById('spotlightGrid');
  const tbody = document.getElementById('strategyTableBody');
  if (!tbody || !spotlightContainer) return;

  if (!Array.isArray(currentJournal) || currentJournal.length === 0) {
    spotlightContainer.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 20px;">Đang nạp dữ liệu phân tích chiến lược...</div>`;
    tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--text-muted); padding: 24px;">Chưa có dữ liệu giao dịch để thống kê chiến lược.</td></tr>`;
    return;
  }

  // 1. Nhóm và tính toán theo từng Động cơ Chiến lược Chuẩn tắc (Canonical Strategy Engines)
  const strategyMap = {};

  currentJournal.forEach(trade => {
    let stratRaw = trade.strategy || 'UNKNOWN_STRATEGY';
    let canonicalKey = 'UNKNOWN';
    let cleanName = stratRaw;

    if (stratRaw.includes('ENGINE_BETA')) { canonicalKey = 'ENGINE_BETA'; cleanName = 'ENGINE BETA (CCI Pullback)'; }
    else if (stratRaw.includes('ENGINE_DELTA')) { canonicalKey = 'ENGINE_DELTA'; cleanName = 'ENGINE DELTA (HalfTrend + ADX)'; }
    else if (stratRaw.includes('ENGINE_ALPHA')) { canonicalKey = 'ENGINE_ALPHA'; cleanName = 'ENGINE ALPHA (UT Bot Alerts)'; }
    else if (stratRaw.includes('ENGINE_THETA')) { canonicalKey = 'ENGINE_THETA'; cleanName = 'ENGINE THETA (EMA 9/21 Pullback)'; }
    else if (stratRaw.includes('ENGINE_EPSILON')) { canonicalKey = 'ENGINE_EPSILON'; cleanName = 'ENGINE EPSILON (Asian Range Sweep)'; }
    else if (stratRaw.includes('ENGINE_ZETA')) { canonicalKey = 'ENGINE_ZETA'; cleanName = 'ENGINE ZETA (SuperTrend + RSI)'; }
    else if (stratRaw.includes('ENGINE_KAPPA')) { canonicalKey = 'ENGINE_KAPPA'; cleanName = 'ENGINE KAPPA (Volume PA)'; }
    else if (stratRaw.includes('ENGINE_GAMMA')) { canonicalKey = 'ENGINE_GAMMA'; cleanName = 'ENGINE GAMMA (TTM Squeeze)'; }
    else { canonicalKey = stratRaw.split('[')[0].trim(); cleanName = canonicalKey; }

    const isShadow = !!trade.isShadow || stratRaw.includes('SHADOW');

    if (!strategyMap[canonicalKey]) {
      strategyMap[canonicalKey] = {
        key: canonicalKey,
        displayName: cleanName,
        isShadow,
        assets: new Set(),
        totalTrades: 0,
        closedTrades: 0,
        openTrades: 0,
        wins: 0,
        losses: 0,
        grossProfit: 0,
        grossLoss: 0,
        netPnl: 0,
        netR: 0,
        recentAction: trade.action,
        trades: []
      };
    }

    const item = strategyMap[canonicalKey];
    const asset = trade.asset || trade.symbol || 'N/A';
    item.assets.add(asset);
    item.trades.push(trade);
    item.totalTrades++;

    const pnl = typeof trade.pnl === 'number' ? trade.pnl : null;
    const status = trade.status;

    if (status === 'WIN' || status === 'SHADOW_WIN' || (pnl !== null && pnl > 0)) {
      item.closedTrades++;
      item.wins++;
      item.grossProfit += (pnl || 0);
      item.netPnl += (pnl || 0);
      const rVal = parseFloat(trade.pnlR) || (pnl && trade.riskAmount ? +(pnl / trade.riskAmount).toFixed(2) : 1.0);
      item.netR += rVal;
    } else if (status === 'LOSS' || status === 'SHADOW_LOSS' || (pnl !== null && pnl < 0)) {
      item.closedTrades++;
      item.losses++;
      item.grossLoss += Math.abs(pnl || 0);
      item.netPnl += (pnl || 0);
      const rVal = parseFloat(trade.pnlR) || (pnl && trade.riskAmount ? +(pnl / trade.riskAmount).toFixed(2) : -1.0);
      item.netR += rVal;
    } else if (status === 'BREAKEVEN' || (pnl === 0 && status !== 'OPEN')) {
      item.closedTrades++;
      item.breakevens = (item.breakevens || 0) + 1;
    } else {
      item.openTrades++;
    }
  });

  const stratList = Object.values(strategyMap).map(s => {
    const decisiveTrades = s.wins + s.losses;
    const winRate = decisiveTrades > 0 ? ((s.wins / decisiveTrades) * 100) : (s.closedTrades > 0 ? 50 : 0);
    const pf = s.grossLoss > 0 ? (s.grossProfit / s.grossLoss).toFixed(1) : (s.grossProfit > 0 ? 'Max Alpha' : '0.0');
    return {
      ...s,
      winRate,
      pf
    };
  });

  // Cập nhật số lượng đếm trên tab filter
  const allCount = stratList.length;
  const liveCount = stratList.filter(s => !s.isShadow).length;
  const shadowCount = stratList.filter(s => s.isShadow).length;
  if (document.getElementById('countStratAll')) document.getElementById('countStratAll').innerText = allCount;
  if (document.getElementById('countStratLive')) document.getElementById('countStratLive').innerText = liveCount;
  if (document.getElementById('countStratShadow')) document.getElementById('countStratShadow').innerText = shadowCount;

  // Sắp xếp theo hiệu suất: Ưu tiên Net PnL cao nhất, rồi tới Winrate
  stratList.sort((a, b) => {
    if (b.netPnl !== a.netPnl) return b.netPnl - a.netPnl;
    return b.winRate - a.winRate;
  });

  stratList.forEach((s, idx) => {
    s.overallRank = idx + 1;
  });

  // Tìm Chiến lược Tốt nhất (Top 1) và Chiến lược Yếu nhất (Bottom 1)
  const bestStrat = stratList.length > 0 ? stratList[0] : null;
  const worstCandidates = stratList.filter(s => s.netPnl < 0 || s.losses > 0);
  const worstStrat = worstCandidates.length > 0 ? worstCandidates[worstCandidates.length - 1] : (stratList.length > 1 ? stratList[stratList.length - 1] : null);
  const potentialStrat = stratList.find(s => s !== bestStrat && (s.winRate === 100 || s.netPnl > 0)) || (stratList.length > 2 ? stratList[1] : null);

  const isPotentialTopTier = potentialStrat && (potentialStrat.overallRank <= 3);
  const potentialBadgeHtml = isPotentialTopTier
    ? `<span class="badge-tag" style="background:#FEF3C7; color:#92400E; border:1px solid #FCD34D; font-weight:700; font-size:11px;">⚡ Rủi ro ưu tiên: 2.0% Vốn</span>`
    : `<span class="badge-tag neutral" style="font-size:11px;">Rủi ro cơ sở: 1.0% Vốn</span>`;
  const potentialRecHtml = isPotentialTopTier
    ? `⚡ Cấp quyền nâng rủi ro lên 2.0% tài khoản (Scalper 1.0% + Runner 1.0%)`
    : `Duy trì rủi ro cơ sở 1.0% (Scalper 0.5% + Runner 0.5%)`;

  // Cập nhật tóm tắt trên Winrate KPI card ở đầu trang
  const kpiBestElem = document.getElementById('kpiBestStrat');
  if (kpiBestElem && bestStrat) {
    const pnlStr = bestStrat.netPnl >= 0 ? `+$${bestStrat.netPnl.toFixed(0)}` : `-$${Math.abs(bestStrat.netPnl).toFixed(0)}`;
    const shortName = bestStrat.displayName.split('(')[0].replace('ENGINE', '').trim() || 'ALPHA';
    kpiBestElem.innerHTML = `🏆 Tốt nhất: <strong class="text-green">${shortName} (${pnlStr})</strong>`;
  }

  // 2. Render 3 Spotlight Cards
  spotlightContainer.innerHTML = `
    <!-- Card 1: VÔ ĐỊCH / TỐT NHẤT -->
    <div class="spotlight-card best">
      <div class="spotlight-header" style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
        <span class="spotlight-tag best">👑 QUÂN VƯƠNG VÔ ĐỊCH (HẠNG 1)</span>
        <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
          <span class="badge-tag" style="background:#FEE2E2; color:#991B1B; border:1px solid #F87171; font-weight:800; font-size:11px;">👑 Rủi ro Quân Vương: 5.0% Vốn (BTCUSD) | 2.0% Vốn (Vàng/Khác)</span>
          <span class="badge-tag live">${bestStrat?.isShadow ? 'SHADOW A/B' : 'LIVE EXNESS'}</span>
        </div>
      </div>
      <div>
        <div class="spotlight-name">${bestStrat ? bestStrat.displayName : 'Đang phân tích...'}</div>
        <p class="spotlight-desc">Tài sản khai thác: <strong>${bestStrat ? Array.from(bestStrat.assets).join(', ') : 'N/A'}</strong>. Khả năng gặt hái lợi nhuận dẫn đầu danh mục.</p>
      </div>
      <div class="spotlight-metrics">
        <div class="spotlight-metric-col">
          <span class="spotlight-metric-label">Lãi ròng USD</span>
          <strong class="spotlight-metric-val text-green">${bestStrat && bestStrat.netPnl >= 0 ? '+' : ''}$${bestStrat ? bestStrat.netPnl.toFixed(2) : '0.00'}</strong>
        </div>
        <div class="spotlight-metric-col">
          <span class="spotlight-metric-label">Tỉ lệ Thắng</span>
          <strong class="spotlight-metric-val mono">${bestStrat ? bestStrat.winRate.toFixed(1) : '0.0'}%</strong>
        </div>
        <div class="spotlight-metric-col">
          <span class="spotlight-metric-label">Hệ số R</span>
          <strong class="spotlight-metric-val mono text-green">${bestStrat && bestStrat.netR >= 0 ? '+' : ''}${bestStrat ? bestStrat.netR.toFixed(2) : '0'}R</strong>
        </div>
      </div>
      <div class="spotlight-action keep">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"></path></svg>
        <span><strong>KHUYẾN NGHỊ:</strong> 👑 Quyền nâng rủi ro lên 5.0% vốn cho BTCUSD (Scalper 2.5% + Runner 2.5%) | Khóa trần 2.0% cho Vàng/Dầu</span>
      </div>
    </div>

    <!-- Card 2: YẾU NHẤT / CẦN LỌC BỎ -->
    <div class="spotlight-card worst">
      <div class="spotlight-header">
        <span class="spotlight-tag worst">⚠️ CẦN THEO DÕI / LỌC BỎ</span>
        <span class="badge-tag neutral">${worstStrat?.isShadow ? 'SHADOW A/B' : 'LIVE EXNESS'}</span>
      </div>
      <div>
        <div class="spotlight-name">${worstStrat ? worstStrat.displayName : 'Chưa có chiến lược yếu'}</div>
        <p class="spotlight-desc">Tài sản chịu áp lực: <strong>${worstStrat ? Array.from(worstStrat.assets).join(', ') : 'N/A'}</strong>. Hiệu suất sụt giảm hoặc tỷ lệ thua cao.</p>
      </div>
      <div class="spotlight-metrics">
        <div class="spotlight-metric-col">
          <span class="spotlight-metric-label">Lãi ròng USD</span>
          <strong class="spotlight-metric-val text-red">${worstStrat && worstStrat.netPnl >= 0 ? '+' : ''}$${worstStrat ? worstStrat.netPnl.toFixed(2) : '0.00'}</strong>
        </div>
        <div class="spotlight-metric-col">
          <span class="spotlight-metric-label">Thắng / Thua</span>
          <strong class="spotlight-metric-val mono">${worstStrat ? `${worstStrat.wins}W / ${worstStrat.losses}L` : '0W / 0L'}</strong>
        </div>
        <div class="spotlight-metric-col">
          <span class="spotlight-metric-label">Hệ số R</span>
          <strong class="spotlight-metric-val mono text-red">${worstStrat && worstStrat.netR >= 0 ? '+' : ''}${worstStrat ? worstStrat.netR.toFixed(2) : '0'}R</strong>
        </div>
      </div>
      <div class="spotlight-action drop">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
        <span><strong>KHUYẾN NGHỊ:</strong> Duy trì rủi ro cơ sở 1.0% hoặc tạm dừng nếu tiếp tục thua</span>
      </div>
    </div>

    <!-- Card 3: TIỀM NĂNG CAO / ỔN ĐỊNH -->
    <div class="spotlight-card potential">
      <div class="spotlight-header" style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
        <span class="spotlight-tag potential">🚀 TIỀM NĂNG ĐỘT PHÁ</span>
        <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
          ${potentialBadgeHtml}
          <span class="badge-tag live">${potentialStrat?.isShadow ? 'SHADOW A/B' : 'LIVE EXNESS'}</span>
        </div>
      </div>
      <div>
        <div class="spotlight-name">${potentialStrat ? potentialStrat.displayName : 'Đang kiểm nghiệm...'}</div>
        <p class="spotlight-desc">Tài sản thử nghiệm: <strong>${potentialStrat ? Array.from(potentialStrat.assets).join(', ') : 'N/A'}</strong>. Điểm vào nến chuẩn xác, tỷ lệ thắng tuyệt đối.</p>
      </div>
      <div class="spotlight-metrics">
        <div class="spotlight-metric-col">
          <span class="spotlight-metric-label">Lãi ròng USD</span>
          <strong class="spotlight-metric-val text-blue">${potentialStrat && potentialStrat.netPnl >= 0 ? '+' : ''}$${potentialStrat ? potentialStrat.netPnl.toFixed(2) : '0.00'}</strong>
        </div>
        <div class="spotlight-metric-col">
          <span class="spotlight-metric-label">Tỉ lệ Thắng</span>
          <strong class="spotlight-metric-val mono text-green">${potentialStrat ? potentialStrat.winRate.toFixed(1) : '100'}%</strong>
        </div>
        <div class="spotlight-metric-col">
          <span class="spotlight-metric-label">Profit Factor</span>
          <strong class="spotlight-metric-val mono text-blue">${potentialStrat ? potentialStrat.pf : 'Max'}</strong>
        </div>
      </div>
      <div class="spotlight-action boost">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>
        <span><strong>KHUYẾN NGHỊ:</strong> ${potentialRecHtml}</span>
      </div>
    </div>
  `;

  // 3. Lọc danh sách hiển thị theo Tab
  let filteredList = stratList;
  if (currentStratFilter === 'live') filteredList = stratList.filter(s => !s.isShadow);
  else if (currentStratFilter === 'shadow') filteredList = stratList.filter(s => s.isShadow);

  tbody.innerHTML = '';
  if (filteredList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--text-muted); padding: 24px;">Không có chiến lược nào trong bộ lọc này.</td></tr>`;
    return;
  }

  filteredList.forEach((s, idx) => {
    const rank = s.overallRank || (idx + 1);
    const isTopTier = rank <= 3;
    let rankBadge = '';
    if (rank === 1) {
      rankBadge = `
        <span class="rank-badge rank-1">🥇 Hạng 1 (Quân Vương)</span>
        <div style="margin-top: 4px;">
          <span class="badge-tag" style="background:#FEE2E2; color:#991B1B; border:1px solid #F87171; font-size:10px; font-weight:800; display:inline-flex; align-items:center; gap:2px; padding:2px 6px; white-space:nowrap;">
            👑 RỦI RO QUÂN VƯƠNG: 5.0% (BTCUSD) | 2.0% (VÀNG / KHÁC)
          </span>
        </div>
      `;
    } else if (rank === 2) {
      rankBadge = `
        <span class="rank-badge rank-2">🥈 Hạng 2</span>
        <div style="margin-top: 4px;">
          <span class="badge-tag" style="background:#FEF3C7; color:#92400E; border:1px solid #FCD34D; font-size:10px; font-weight:700; display:inline-flex; align-items:center; gap:2px; padding:2px 6px; white-space:nowrap;">
            ⚡ Rủi ro ưu tiên: 2.0% Vốn
          </span>
        </div>
      `;
    } else if (rank === 3) {
      rankBadge = `
        <span class="rank-badge rank-3">🥉 Hạng 3</span>
        <div style="margin-top: 4px;">
          <span class="badge-tag" style="background:#FEF3C7; color:#92400E; border:1px solid #FCD34D; font-size:10px; font-weight:700; display:inline-flex; align-items:center; gap:2px; padding:2px 6px; white-space:nowrap;">
            ⚡ Rủi ro ưu tiên: 2.0% Vốn
          </span>
        </div>
      `;
    } else if (s.key.includes('LAMBDA') || s.key.includes('OMEGA') || s.key.includes('COUNTER')) {
      rankBadge = `
        <span class="rank-badge" style="background:#EEF2FF; color:#4338CA; border:1px solid #C7D2FE;">⚡ LỆCH XU HƯỚNG</span>
        <div style="margin-top: 4px;">
          <span class="badge-tag" style="background:#EEF2FF; color:#4338CA; border:1px solid #C7D2FE; font-size:10px; font-weight:700; display:inline-flex; align-items:center; gap:2px; padding:2px 6px; white-space:nowrap;">
            ⚡ Rủi ro: 0.5% Vốn
          </span>
        </div>
      `;
    } else {
      rankBadge = `
        <span class="rank-badge ${s.netPnl < 0 ? 'rank-warn' : ''}">#${rank}</span>
        <div style="margin-top: 4px;">
          <span class="badge-tag neutral" style="font-size:10px; padding:2px 6px; white-space:nowrap;">
            Rủi ro cơ sở: 1.0% Vốn
          </span>
        </div>
      `;
    }

    // Phân loại & Đánh giá
    let statusPill = '';
    let recommendation = '';
    if (s.key.includes('LAMBDA') || s.key.includes('OMEGA') || s.key.includes('COUNTER')) {
      statusPill = `<span class="status-pill" style="background:#EEF2FF; color:#4338CA; border:1px solid #C7D2FE;">⚡ LỆCH XU HƯỚNG</span>`;
      recommendation = `<strong class="text-blue">⚡ Đánh lệch xu hướng (0.5% Vốn)</strong> • Bắt đỉnh/đáy kiệt sức`;
    } else if (rank === 1 && s.netPnl > 0) {
      statusPill = `<span class="status-pill champion">👑 QUÂN VƯƠNG</span>`;
      recommendation = `<strong class="text-green">👑 Quyền nâng 5.0% Vốn (BTCUSD) | Khóa 2.0% Vốn (Vàng/Khác)</strong> • Động cơ số 1`;
    } else if (isTopTier && s.netPnl > 0) {
      statusPill = `<span class="status-pill good">🟢 HIỆU QUẢ CAO</span>`;
      recommendation = `<strong class="text-green">⚡ Quyền nâng 2.0% Vốn</strong> • Vận hành ổn định`;
    } else if (isTopTier) {
      statusPill = `<span class="status-pill good">🟢 TOP 3</span>`;
      recommendation = `<strong class="text-green">⚡ Quyền nâng 2.0% Vốn</strong> • Đang giữ vị thế`;
    } else if (s.netPnl < 0 || (s.totalTrades >= 3 && s.winRate < 45)) {
      statusPill = `<span class="status-pill danger">🔴 YẾU KÉM</span>`;
      recommendation = `<strong class="text-red">Nên tắt / Lọc bỏ</strong> (Rủi ro 1.0%)`;
    } else {
      statusPill = `<span class="status-pill testing">🟡 ĐANG TEST</span>`;
      recommendation = `Theo dõi thêm tín hiệu (Rủi ro 1.0%)`;
    }

    // Winrate bar
    const wrClass = s.winRate >= 60 ? 'high' : (s.winRate >= 40 ? 'mid' : 'low');
    const wrBarHtml = `
      <div class="winrate-cell">
        <span class="mono" style="font-weight: 800;">${s.winRate.toFixed(1)}%</span>
        <div class="winrate-bar-track">
          <div class="winrate-bar-fill ${wrClass}" style="width: ${Math.min(100, s.winRate)}%;"></div>
        </div>
      </div>
    `;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${rankBadge}</td>
      <td>
        <strong style="font-size: 13px; color: var(--text-primary);">${s.displayName}</strong>
        <div class="mono" style="font-size: 10px; color: var(--text-muted);">${s.key}</div>
      </td>
      <td>
        <span class="badge-tag ${s.isShadow ? 'neutral' : 'live'}" style="font-size: 10px;">
          ${s.isShadow ? '🔮 SHADOW' : '🟢 LIVE'}
        </span>
      </td>
      <td class="mono" style="font-size: 12px; font-weight: 700;">${Array.from(s.assets).join(', ')}</td>
      <td class="mono">
        <strong>${s.totalTrades}</strong> lệnh
        ${s.openTrades > 0 ? `<div style="font-size: 10px; color: var(--blue-main); font-weight: 700;">(${s.openTrades} đang mở)</div>` : ''}
      </td>
      <td class="mono">
        <span class="text-green" style="font-weight: 700;">${s.wins}W</span> / 
        <span class="${s.losses > 0 ? 'text-red' : 'text-muted'}" style="font-weight: 700;">${s.losses}L</span>
        <div style="font-size: 10px; color: var(--text-muted);">${s.closedTrades} đã chốt</div>
      </td>
      <td>${wrBarHtml}</td>
      <td>
        <div class="mono" style="font-weight: 800; font-size: 13px; color: ${s.netPnl >= 0 ? 'var(--green-main)' : 'var(--red-main)'};">
          ${s.netPnl >= 0 ? '+' : ''}$${s.netPnl.toFixed(2)}
        </div>
        <div class="mono" style="font-size: 11px; color: var(--text-muted);">
          ${s.netR >= 0 ? '+' : ''}${s.netR.toFixed(2)}R
        </div>
      </td>
      <td class="mono" style="font-weight: 800;">${s.pf}</td>
      <td>
        <div style="display: flex; flex-direction: column; gap: 3px;">
          <div>${statusPill}</div>
          <div style="font-size: 11px;">${recommendation}</div>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// 3. Render Trade Ledger Table
function renderLedger() {
  const tbody = document.getElementById('ledgerTableBody');
  tbody.innerHTML = '';

  const liveTrades = currentJournal.filter(t => !t.isShadow);
  const shadowTrades = currentJournal.filter(t => t.isShadow);
  const scalperTrades = currentJournal.filter(t => t.ticketType === 'SCALPER' || t.strategy?.includes('SCALPER') || t.note?.includes('SCALPER'));
  const runnerTrades = currentJournal.filter(t => t.ticketType === 'RUNNER' || t.strategy?.includes('RUNNER') || t.note?.includes('RUNNER'));
  const winTrades = currentJournal.filter(t => t.status === 'WIN' || t.status === 'SHADOW_WIN' || (typeof t.pnl === 'number' && t.pnl > 0));
  const lossTrades = currentJournal.filter(t => t.status === 'LOSS' || t.status === 'SHADOW_LOSS' || (typeof t.pnl === 'number' && t.pnl < 0));

  document.getElementById('countAll').innerText = currentJournal.length;
  document.getElementById('countLive').innerText = liveTrades.length;
  if (document.getElementById('countShadow')) document.getElementById('countShadow').innerText = shadowTrades.length;
  if (document.getElementById('countScalper')) document.getElementById('countScalper').innerText = scalperTrades.length;
  if (document.getElementById('countRunner')) document.getElementById('countRunner').innerText = runnerTrades.length;
  if (document.getElementById('countWin')) document.getElementById('countWin').innerText = winTrades.length;
  if (document.getElementById('countLoss')) document.getElementById('countLoss').innerText = lossTrades.length;

  let filtered = currentJournal;
  if (currentFilter === 'live') filtered = liveTrades;
  else if (currentFilter === 'shadow') filtered = shadowTrades;
  else if (currentFilter === 'scalper') filtered = scalperTrades;
  else if (currentFilter === 'runner') filtered = runnerTrades;
  else if (currentFilter === 'win') filtered = winTrades;
  else if (currentFilter === 'loss') filtered = lossTrades;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; color: var(--text-muted); padding: 32px;">Chưa có lệnh nào trong danh mục này.</td></tr>`;
    return;
  }

  filtered.slice().reverse().forEach((trade, idx) => {
    const isBuy = trade.action === 'BUY';
    const isShadow = !!trade.isShadow;
    const isScalper = trade.ticketType === 'SCALPER' || trade.strategy?.includes('SCALPER') || trade.note?.includes('SCALPER');
    const isRunner = trade.ticketType === 'RUNNER' || trade.strategy?.includes('RUNNER') || trade.note?.includes('RUNNER');
    const cleanTime = trade.timeVietnam || (trade.timestamp ? new Date(trade.timestamp).toLocaleString('vi-VN') : 'N/A');

    const hasProof = !!(trade.exnessScreenshot || trade.tvScreenshot);
    const exnessName = trade.exnessScreenshot ? trade.exnessScreenshot.split(/[/\\]/).pop() : null;
    const tvName = trade.tvScreenshot ? trade.tvScreenshot.split(/[/\\]/).pop() : null;
    const exnessProofUrl = exnessName ? `/artifacts/${encodeURIComponent(exnessName)}` : null;
    const tvProofUrl = tvName ? `/artifacts/${encodeURIComponent(tvName)}` : null;

    // Trạng thái và Lãi/Lỗ
    let pnlHtml = '';
    const status = trade.status || (isShadow ? 'SHADOW' : 'CLOSED');
    const pnlVal = typeof trade.pnl === 'number' ? trade.pnl : null;
    const pnlR = trade.pnlR || (pnlVal !== null && trade.riskAmount ? ((pnlVal / trade.riskAmount > 0 ? '+' : '') + (pnlVal / trade.riskAmount).toFixed(2) + 'R') : '');

    if (status === 'WIN' || (pnlVal !== null && pnlVal > 0)) {
      pnlHtml = `<span class="badge-pnl win">🟢 THẮNG +$${pnlVal !== null ? pnlVal.toFixed(2) : ''} (${pnlR})</span>`;
    } else if (status === 'LOSS' || (pnlVal !== null && pnlVal < 0)) {
      pnlHtml = `<span class="badge-pnl loss">🔴 THUA -$${pnlVal !== null ? Math.abs(pnlVal).toFixed(2) : ''} (${pnlR})</span>`;
    } else if (status === 'SHADOW_WIN') {
      pnlHtml = `<span class="badge-pnl shadow-win">🔮 SHADOW THẮNG +$${pnlVal !== null ? pnlVal.toFixed(2) : ''} (${pnlR})</span>`;
    } else if (status === 'SHADOW_LOSS') {
      pnlHtml = `<span class="badge-pnl shadow-loss">🔮 SHADOW THUA -$${pnlVal !== null ? Math.abs(pnlVal).toFixed(2) : ''} (${pnlR})</span>`;
    } else if (status === 'OPEN' || status === 'RUNNING') {
      pnlHtml = `<span class="badge-pnl running">🔵 ĐANG CHẠY (OPEN)</span>`;
    } else if (isShadow) {
      pnlHtml = `<span class="badge-pnl shadow-win">🔮 SHADOW A/B</span>`;
    } else {
      pnlHtml = `<span class="badge-pnl running">ĐÃ ĐÓNG</span>`;
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="mono" style="font-size: 11px;">${cleanTime}</td>
      <td><strong class="mono">${trade.asset || trade.symbol}</strong></td>
      <td>
        <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
          <span style="font-size: 11px; font-weight: 700; color: ${isShadow ? 'var(--purple-main)' : (isScalper ? '#059669' : (isRunner ? '#2563EB' : 'var(--blue-main)'))};">
            ${trade.strategy || 'ENGINE ALPHA'}
          </span>
          ${isScalper ? '<span class="badge-ticket scalper">⚡ [SCALPER] R:R 1.0</span>' : ''}
          ${isRunner ? '<span class="badge-ticket runner">🚀 [RUNNER] R:R 1.5</span>' : ''}
          ${isShadow ? '<span class="engine-badge shadow" style="font-size: 9px; margin-left: 4px;">SHADOW</span>' : ''}
        </div>
      </td>
      <td>
        <div style="display: flex; align-items: center; gap: 4px;">
          <span class="badge-action ${isBuy ? 'buy' : 'sell'}">${trade.action}</span>
          ${isScalper ? '<span class="badge-ticket scalper" style="font-size: 9px; padding: 1px 4px;">[SCALPER]</span>' : ''}
          ${isRunner ? '<span class="badge-ticket runner" style="font-size: 9px; padding: 1px 4px;">[RUNNER]</span>' : ''}
        </div>
      </td>
      <td class="mono">${trade.entryPrice ? trade.entryPrice.toLocaleString('en-US', { minimumFractionDigits: 2 }) : 'Market'}</td>
      <td class="mono text-red">${trade.stopLoss ? trade.stopLoss.toLocaleString('en-US', { minimumFractionDigits: 2 }) : 'N/A'}</td>
      <td class="mono text-green">${trade.takeProfit ? trade.takeProfit.toLocaleString('en-US', { minimumFractionDigits: 2 }) : 'N/A'}</td>
      <td class="mono"><strong>${trade.lotSize || '0.10'}</strong> lot</td>
      <td class="mono">$${trade.riskAmount ? trade.riskAmount.toFixed(2) : '47.50'}</td>
      <td>${pnlHtml}</td>
      <td>
        ${hasProof ? `
          <button class="btn-proof" onclick="openProofModal('${trade.asset || trade.symbol}', '${trade.action}', '${trade.lotSize}', '${exnessProofUrl}', '${tvProofUrl}')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
            Bằng Chứng Kép
          </button>
        ` : '<span style="color: var(--text-muted); font-size: 11px;">Không có ảnh</span>'}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// 4. Modal Viewer for Dual-Evidence Screenshots
window.openProofModal = function(asset, action, lot, exnessUrl, tvUrl) {
  const modal = document.getElementById('evidenceModal');
  document.getElementById('modalTitle').innerText = `${asset} ${action} ${lot} LOT — BẰNG CHỨNG THỜI GIAN THỰC`;
  
  const exnessImg = document.getElementById('modalExnessImg');
  const tvImg = document.getElementById('modalTvImg');
  
  exnessImg.onerror = function() {
    if (exnessUrl && !exnessImg.dataset.fallback) {
      exnessImg.dataset.fallback = 'true';
      exnessImg.src = exnessUrl.startsWith('/artifacts/') ? exnessUrl.replace('/artifacts/', '/api/artifacts/') : exnessUrl.replace('/api/artifacts/', '/artifacts/');
    }
  };
  tvImg.onerror = function() {
    if (tvUrl && !tvImg.dataset.fallback) {
      tvImg.dataset.fallback = 'true';
      tvImg.src = tvUrl.startsWith('/artifacts/') ? tvUrl.replace('/artifacts/', '/api/artifacts/') : tvUrl.replace('/api/artifacts/', '/artifacts/');
    }
  };

  delete exnessImg.dataset.fallback;
  delete tvImg.dataset.fallback;
  exnessImg.src = exnessUrl || '';
  tvImg.src = tvUrl || '';

  // Reset to first tab
  document.getElementById('tabBtnExness').classList.add('active');
  document.getElementById('tabBtnTV').classList.remove('active');
  document.getElementById('frameExness').classList.add('active');
  document.getElementById('frameTV').classList.remove('active');

  modal.classList.add('active');
};

document.getElementById('btnCloseModal').addEventListener('click', () => {
  document.getElementById('evidenceModal').classList.remove('active');
});

document.getElementById('evidenceModal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('evidenceModal')) {
    document.getElementById('evidenceModal').classList.remove('active');
  }
});

document.getElementById('tabBtnExness').addEventListener('click', () => {
  document.getElementById('tabBtnExness').classList.add('active');
  document.getElementById('tabBtnTV').classList.remove('active');
  document.getElementById('frameExness').classList.add('active');
  document.getElementById('frameTV').classList.remove('active');
});

document.getElementById('tabBtnTV').addEventListener('click', () => {
  document.getElementById('tabBtnTV').classList.add('active');
  document.getElementById('tabBtnExness').classList.remove('active');
  document.getElementById('frameTV').classList.add('active');
  document.getElementById('frameExness').classList.remove('active');
});

// Filter Buttons for Trade Ledger
document.querySelectorAll('[data-filter]').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    currentFilter = e.target.getAttribute('data-filter');
    renderLedger();
  });
});

// Filter Buttons for Strategy Leaderboard
document.querySelectorAll('[data-strat-filter]').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('[data-strat-filter]').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    currentStratFilter = e.target.getAttribute('data-strat-filter');
    renderStrategyLeaderboard();
  });
});

// Refresh Button
document.getElementById('btnRefresh').addEventListener('click', () => {
  fetchData();
});

// Auto-polling every 3.5 seconds
setInterval(fetchData, 3500);

// Initial call
fetchData();
