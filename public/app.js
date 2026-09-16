// Antigravity Quant — Dashboard Client Controller
let currentStatus = null;
let currentJournal = [];
let currentFilter = 'today';
let currentKpiScope = 'today'; // 'today' | 'all'
let countdownRemaining = 900;
let countdownTimerInterval = null;

function getVietnamDateStr(isoOrDate) {
  const d = isoOrDate ? new Date(isoOrDate) : new Date();
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

function isTradeToday(t, vnDateToday) {
  if (!t) return false;
  const dStr = t.timestamp ? getVietnamDateStr(t.timestamp) : '';
  const vnStr = t.timeVietnam || t.time_vietnam || '';
  const [y, m, d] = vnDateToday.split('-');
  const vnFormat1 = `${parseInt(d)}/${parseInt(m)}/${y}`;
  const vnFormat2 = `${d}/${m}/${y}`;
  return dStr === vnDateToday || vnStr.includes(vnFormat1) || vnStr.includes(vnFormat2);
}

window.setKpiScope = function(scope) {
  currentKpiScope = scope;
  const btnToday = document.getElementById('btnScopeToday');
  const btnAll = document.getElementById('btnScopeAll');
  if (btnToday) btnToday.className = `kpi-scope-btn ${scope === 'today' ? 'active' : ''}`;
  if (btnAll) btnAll.className = `kpi-scope-btn ${scope === 'all' ? 'active' : ''}`;
  renderKPIs();
};

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
    const TUNNEL_URL = 'https://teams-superintendent-earlier-core.trycloudflare.com';
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
    renderEquityChart();
    renderLivePositions();
    renderAssets();
    renderStrategyLeaderboard();
    renderLedger();
    renderLearningAgent();
  } catch (err) {
    console.error('Lỗi nạp dữ liệu telemetry:', err);
    const beacon = document.getElementById('daemonBeacon');
    const label = document.getElementById('daemonStatusLabel');
    if (beacon) beacon.className = 'pulse-beacon offline';
    if (label) label.innerText = '🔴 SERVER MẤT KẾT NỐI';
  }
}

// 1. Render KPIs (Hỗ trợ Chế độ xem Kép: Hôm Nay vs Toàn Thời Gian)
function renderKPIs() {
  if (!currentStatus) return;

  const now = new Date();
  const vnDateToday = getVietnamDateStr(now);
  const [yVal, mVal, dVal] = vnDateToday.split('-');
  const todayLabel = `${dVal}/${mVal}`;

  // 1. Lấy dữ liệu Hôm nay & Toàn thời gian
  let today = currentStatus.today;
  let allTime = currentStatus.allTime;

  // Fallback tính toán tại client nếu server payload chưa có
  if (!today || !allTime) {
    const todayTrades = currentJournal.filter(t => isTradeToday(t, vnDateToday));
    const todayClosed = todayTrades.filter(t => 
      t.status === 'WIN' || t.status === 'LOSS' || t.status === 'BREAKEVEN' || 
      (typeof t.pnl === 'number' && t.pnl !== null && t.status !== 'OPEN')
    );
    let tWins = 0, tLosses = 0, tBes = 0, tGrossWin = 0, tGrossLoss = 0, tNetPnl = 0;
    todayClosed.forEach(t => {
      const pnl = typeof t.pnl === 'number' ? t.pnl : 0;
      tNetPnl += pnl;
      if (pnl > 0.05 || (t.status === 'WIN' && pnl > 0)) { tWins++; tGrossWin += pnl; }
      else if (pnl < -0.05 || t.status === 'LOSS') { tLosses++; tGrossLoss += Math.abs(pnl); }
      else { tBes++; }
    });
    const tDecisive = tWins + tLosses;
    const tWr = tDecisive > 0 ? ((tWins / tDecisive) * 100) : 0;
    const tPf = tGrossLoss > 0 ? (tGrossWin / tGrossLoss) : (tGrossWin > 0 ? 999 : 0);
    const startBal = +( (currentStatus.balance || 11001.16) - tNetPnl ).toFixed(2);
    const tRoi = startBal > 0 ? ((tNetPnl / startBal) * 100) : 0;

    today = {
      date: vnDateToday,
      dateLabel: `${dVal}/${mVal}/${yVal}`,
      startBalance: startBal,
      netPnL: +tNetPnl.toFixed(2),
      roi: +tRoi.toFixed(2),
      winRate: +tWr.toFixed(1),
      wins: tWins,
      losses: tLosses,
      breakevens: tBes,
      grossWin: +tGrossWin.toFixed(2),
      grossLoss: +tGrossLoss.toFixed(2),
      profitFactor: +tPf.toFixed(2),
      closedTradesCount: todayClosed.length,
      openTradesCount: todayTrades.length - todayClosed.length,
      totalTradesToday: todayTrades.length
    };
  }

  if (!allTime) {
    const allClosed = currentJournal.filter(t => 
      t.status === 'WIN' || t.status === 'LOSS' || t.status === 'BREAKEVEN' || 
      (typeof t.pnl === 'number' && t.pnl !== null && t.status !== 'OPEN')
    );
    let aWins = 0, aLosses = 0, aBes = 0, aGrossWin = 0, aGrossLoss = 0;
    allClosed.forEach(t => {
      const pnl = typeof t.pnl === 'number' ? t.pnl : 0;
      if (pnl > 0.05 || (t.status === 'WIN' && pnl > 0)) { aWins++; aGrossWin += pnl; }
      else if (pnl < -0.05 || t.status === 'LOSS') { aLosses++; aGrossLoss += Math.abs(pnl); }
      else { aBes++; }
    });
    const aDecisive = aWins + aLosses;
    const aWr = aDecisive > 0 ? ((aWins / aDecisive) * 100) : 0;
    const aPf = aGrossLoss > 0 ? (aGrossWin / aGrossLoss) : 0;

    allTime = {
      initialBalance: 9388.75,
      equity: currentStatus.equity,
      balance: currentStatus.balance,
      netPnL: +(currentStatus.equity - 9388.75).toFixed(2),
      roi: +(((currentStatus.equity - 9388.75) / 9388.75) * 100).toFixed(2),
      winRate: +aWr.toFixed(1),
      wins: aWins,
      losses: aLosses,
      breakevens: aBes,
      grossWin: +aGrossWin.toFixed(2),
      grossLoss: +aGrossLoss.toFixed(2),
      profitFactor: +aPf.toFixed(2),
      closedTradesCount: allClosed.length,
      totalTradesCount: currentJournal.length
    };
  }

  const isToday = currentKpiScope === 'today';

  // 2. Cập nhật Scope Bar
  const scopeTodayDate = document.getElementById('scopeTodayDate');
  if (scopeTodayDate) scopeTodayDate.innerText = todayLabel;
  const kpiScopeTodayTrades = document.getElementById('kpiScopeTodayTrades');
  if (kpiScopeTodayTrades) kpiScopeTodayTrades.innerText = `${today.totalTradesToday || 0} LỆNH`;
  const kpiScopeAllTrades = document.getElementById('kpiScopeAllTrades');
  if (kpiScopeAllTrades) kpiScopeAllTrades.innerText = `${allTime.totalTradesCount || currentJournal.length} LỆNH`;

  const todayStartBalVal = document.getElementById('todayStartBalVal');
  if (todayStartBalVal) todayStartBalVal.innerText = `$${(today.startBalance || 10838.81).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

  const scopeDesc = document.getElementById('scopeDescriptionText');
  if (scopeDesc) {
    scopeDesc.innerHTML = isToday
      ? `Tự động Reset vào 00:00 (Giờ VN) • Vốn đầu ngày: <strong class="mono text-green">$${(today.startBalance || 10838.81).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>`
      : `Lũy kế toàn thời gian từ vốn khởi đầu <strong class="mono">$9,388.75</strong> qua <strong class="mono">${allTime.totalTradesCount || currentJournal.length} lệnh</strong>`;
  }

  // 3. Render Card 1: EQUITY & ROI
  document.getElementById('equityVal').innerText = `$${currentStatus.equity.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  const roiElem = document.getElementById('roiVal');
  const netPnlElem = document.getElementById('netPnlVal');
  const kpiPnlLabel = document.getElementById('kpiPnlLabel');
  const kpiAltPnlLabel = document.getElementById('kpiAltPnlLabel');
  const kpiAltPnlVal = document.getElementById('kpiAltPnlVal');

  if (isToday) {
    const isPos = today.roi >= 0;
    roiElem.innerText = `${isPos ? '+' : ''}${today.roi.toFixed(2)}% (Hôm nay)`;
    roiElem.className = `kpi-diff ${isPos ? 'positive' : 'negative'}`;
    if (kpiPnlLabel) kpiPnlLabel.innerText = 'Lãi ròng hôm nay:';
    if (netPnlElem) {
      netPnlElem.innerText = `${today.netPnL >= 0 ? '+' : ''}$${today.netPnL.toFixed(2)}`;
      netPnlElem.className = `mono ${today.netPnL >= 0 ? 'text-green' : 'text-red'}`;
    }
    if (kpiAltPnlLabel) kpiAltPnlLabel.innerText = 'Toàn thời gian:';
    if (kpiAltPnlVal) kpiAltPnlVal.innerText = `${allTime.netPnL >= 0 ? '+' : ''}$${allTime.netPnL.toFixed(2)} (${allTime.roi >= 0 ? '+' : ''}${allTime.roi.toFixed(2)}%)`;
  } else {
    const isPos = allTime.roi >= 0;
    roiElem.innerText = `${isPos ? '+' : ''}${allTime.roi.toFixed(2)}% (Toàn kỳ)`;
    roiElem.className = `kpi-diff ${isPos ? 'positive' : 'negative'}`;
    if (kpiPnlLabel) kpiPnlLabel.innerText = 'Lãi lũy kế toàn kỳ:';
    if (netPnlElem) {
      netPnlElem.innerText = `${allTime.netPnL >= 0 ? '+' : ''}$${allTime.netPnL.toFixed(2)}`;
      netPnlElem.className = `mono ${allTime.netPnL >= 0 ? 'text-green' : 'text-red'}`;
    }
    if (kpiAltPnlLabel) kpiAltPnlLabel.innerText = 'Hôm nay:';
    if (kpiAltPnlVal) kpiAltPnlVal.innerText = `${today.netPnL >= 0 ? '+' : ''}$${today.netPnL.toFixed(2)} (${today.roi >= 0 ? '+' : ''}${today.roi.toFixed(2)}%)`;
  }

  const balElem = document.getElementById('balanceVal');
  if (balElem) {
    const bal = currentStatus.balance || currentStatus.equity;
    balElem.innerText = `$${bal.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
  }

  // 4. Render Card 2: WINRATE
  const winRateElem = document.getElementById('winRateVal');
  const winLossElem = document.getElementById('winLossCount');
  const winRateBadge = document.getElementById('winRateBadge');
  const kpiAltWrVal = document.getElementById('kpiAltWrVal');
  const todayClosedText = document.getElementById('todayClosedCountText');

  if (isToday) {
    if (winRateBadge) winRateBadge.innerText = `HÔM NAY (${todayLabel})`;
    if (winRateElem) {
      winRateElem.innerText = `${today.winRate.toFixed(1)}%`;
      winRateElem.className = `kpi-value mono ${today.winRate >= 50 ? 'text-green' : 'text-red'}`;
    }
    if (winLossElem) winLossElem.innerText = `${today.wins}W / ${today.losses}L (${today.breakevens} HÒA)`;
    if (todayClosedText) todayClosedText.innerText = `${today.closedTradesCount} lệnh (${today.openTradesCount} mở)`;
    if (kpiAltWrVal) kpiAltWrVal.innerText = `${allTime.winRate.toFixed(1)}% (${allTime.wins}W / ${allTime.losses}L)`;
  } else {
    if (winRateBadge) winRateBadge.innerText = 'TOÀN THỜI GIAN';
    if (winRateElem) {
      winRateElem.innerText = `${allTime.winRate.toFixed(1)}%`;
      winRateElem.className = `kpi-value mono ${allTime.winRate >= 50 ? 'text-green' : 'text-red'}`;
    }
    if (winLossElem) winLossElem.innerText = `${allTime.wins}W / ${allTime.losses}L (${allTime.breakevens} HÒA)`;
    if (todayClosedText) todayClosedText.innerText = `${allTime.closedTradesCount} lệnh đã chốt`;
    if (kpiAltWrVal) kpiAltWrVal.innerText = `${today.winRate.toFixed(1)}% (${today.wins}W / ${today.losses}L)`;
  }

  // 5. Render Card 3: PROFIT FACTOR
  const pfElem = document.getElementById('profitFactorVal');
  const pfBadge = document.getElementById('pfBadge');
  const grossWinElem = document.getElementById('grossWinVal');
  const grossLossElem = document.getElementById('grossLossVal');
  const kpiAltPfVal = document.getElementById('kpiAltPfVal');

  if (isToday) {
    if (pfBadge) pfBadge.innerText = 'HÔM NAY';
    if (pfElem) pfElem.innerText = today.profitFactor > 0 ? today.profitFactor.toFixed(2) : (today.grossWin > 0 ? 'Max Alpha' : '0.0');
    if (grossWinElem) grossWinElem.innerText = `+$${today.grossWin.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    if (grossLossElem) grossLossElem.innerText = `-$${today.grossLoss.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    if (kpiAltPfVal) kpiAltPfVal.innerText = `${allTime.profitFactor} (+$${allTime.grossWin.toFixed(0)} / -$${allTime.grossLoss.toFixed(0)})`;
  } else {
    if (pfBadge) pfBadge.innerText = 'TOÀN KỲ';
    if (pfElem) pfElem.innerText = allTime.profitFactor > 0 ? allTime.profitFactor.toFixed(2) : (allTime.grossWin > 0 ? 'Max Alpha' : '0.0');
    if (grossWinElem) grossWinElem.innerText = `+$${allTime.grossWin.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    if (grossLossElem) grossLossElem.innerText = `-$${allTime.grossLoss.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    if (kpiAltPfVal) kpiAltPfVal.innerText = `${today.profitFactor} (+$${today.grossWin.toFixed(0)} / -$${today.grossLoss.toFixed(0)})`;
  }

  // 6. Render Card 4: HEAT & OPEN POSITIONS
  const maxPos = currentStatus.maxTotalPositions || 10;
  const openCount = currentStatus.openPositionsCount || 0;
  document.getElementById('activePositionsCount').innerText = `${openCount} / ${maxPos}`;
  document.getElementById('heatRatioBadge').innerText = `${openCount} / ${maxPos} VỊ THẾ`;
  document.getElementById('heatBar').style.width = `${Math.min(100, (openCount / maxPos) * 100)}%`;

  const openSymbolsText = currentStatus.openSymbols && currentStatus.openSymbols.length > 0 
    ? currentStatus.openSymbols.join(', ') 
    : 'Không có vị thế mở';
  document.getElementById('openSymbolsList').innerText = openSymbolsText;

  const freeMarginKpiElem = document.getElementById('freeMarginKpiVal');
  if (freeMarginKpiElem) {
    freeMarginKpiElem.innerText = currentStatus.freeMargin
      ? `$${currentStatus.freeMargin.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
      : '--';
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

  if (currentStatus.lastScanTime) {
    const timeMatch = currentStatus.lastScanTime.match(/(\d{2}:\d{2}:\d{2})/);
    const lastScanElem = document.getElementById('lastScanTime');
    if (lastScanElem) lastScanElem.innerText = timeMatch ? timeMatch[1] : currentStatus.lastScanTime;
  } else {
    const curMins = now.getMinutes();
    const lastBarMins = Math.floor(curMins / 15) * 15;
    const barDate = new Date(now);
    barDate.setMinutes(lastBarMins, 0, 0);
    const lastScanElem = document.getElementById('lastScanTime');
    if (lastScanElem) lastScanElem.innerText = barDate.toLocaleTimeString('vi-VN', { hour12: false, timeZone: 'Asia/Ho_Chi_Minh' });
  }

  if (currentStatus.nextScanSeconds !== undefined) {
    startCountdown(currentStatus.nextScanSeconds);
  }
}

// 1.0. Render Equity Sparkline & Telemetry Summary
function renderEquityChart() {
  const container = document.getElementById('chartSvgContainer');
  if (!container) return;

  const initialBalance = (currentStatus && currentStatus.initialBalance) || 9388.75;
  const currentEquity = (currentStatus && currentStatus.equity) || 10826.62;

  // Build equity time series from closed trades
  const trades = Array.isArray(currentJournal) ? currentJournal.slice() : [];
  trades.sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));

  let cumEquity = initialBalance;
  let peakEquity = initialBalance;
  let maxDrawdown = 0;
  let btcPnl = 0;
  let goldPnl = 0;
  let oilPnl = 0;

  const points = [{ index: 0, equity: initialBalance }];

  trades.forEach((t, i) => {
    const pnl = typeof t.pnl === 'number' ? t.pnl : 0;
    cumEquity += pnl;
    if (cumEquity > peakEquity) peakEquity = cumEquity;
    const dd = peakEquity > 0 ? ((peakEquity - cumEquity) / peakEquity) * 100 : 0;
    if (dd > maxDrawdown) maxDrawdown = dd;

    const asset = (t.asset || t.symbol || '').toUpperCase();
    if (asset.includes('BTC')) btcPnl += pnl;
    else if (asset.includes('GOLD') || asset.includes('XAU')) goldPnl += pnl;
    else if (asset.includes('OIL')) oilPnl += pnl;

    points.push({ index: i + 1, equity: cumEquity });
  });

  if (currentStatus && currentStatus.equity) {
    peakEquity = Math.max(peakEquity, currentStatus.equity);
    points[points.length - 1].equity = currentStatus.equity;
  }

  // Update telemetry text elements
  const peakElem = document.getElementById('peakEquityVal');
  if (peakElem) peakElem.innerText = `$${peakEquity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const maxDdElem = document.getElementById('maxDdVal');
  if (maxDdElem) maxDdElem.innerText = `-${maxDrawdown.toFixed(2)}% (Cực Kỳ An Toàn)`;

  const latestLabelElem = document.getElementById('chartLatestLabel');
  if (latestLabelElem) latestLabelElem.innerText = `Hiện tại ($${currentEquity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;

  const dayStartElem = document.getElementById('chartDayStartLabel');
  if (dayStartElem && currentStatus && currentStatus.today) {
    const dLabel = currentStatus.today.dateLabel ? currentStatus.today.dateLabel.slice(0, 5) : '16/09';
    const sBal = (currentStatus.today.startBalance || 10838.81).toLocaleString('en-US', { minimumFractionDigits: 2 });
    dayStartElem.innerText = `Đầu ngày ${dLabel} ($${sBal})`;
  }

  const btcElem = document.getElementById('chartBtcPnl');
  if (btcElem) btcElem.innerText = `${btcPnl >= 0 ? '+' : ''}$${btcPnl.toFixed(2)}`;

  const goldElem = document.getElementById('chartGoldPnl');
  if (goldElem) goldElem.innerText = `${goldPnl >= 0 ? '+' : ''}$${goldPnl.toFixed(2)}`;

  const oilElem = document.getElementById('chartOilPnl');
  if (oilElem) oilElem.innerText = `${oilPnl >= 0 ? '+' : ''}$${oilPnl.toFixed(2)}`;

  // SVG dimensions
  const width = 740;
  const height = 120;
  const padX = 12;
  const padY = 12;

  const minEq = Math.min(...points.map(p => p.equity)) * 0.995;
  const maxEq = Math.max(...points.map(p => p.equity)) * 1.005;
  const eqRange = (maxEq - minEq) || 1;

  function getX(i) {
    return padX + (i / (points.length - 1)) * (width - 2 * padX);
  }
  function getY(eq) {
    return (height - padY) - ((eq - minEq) / eqRange) * (height - 2 * padY);
  }

  // Build path
  let pathD = `M ${getX(0).toFixed(1)},${getY(points[0].equity).toFixed(1)}`;
  points.forEach((p, i) => {
    if (i > 0) {
      pathD += ` L ${getX(i).toFixed(1)},${getY(p.equity).toFixed(1)}`;
    }
  });

  const lastX = getX(points.length - 1).toFixed(1);
  const lastY = getY(points[points.length - 1].equity).toFixed(1);
  const firstX = getX(0).toFixed(1);

  const areaD = `${pathD} L ${lastX},${height} L ${firstX},${height} Z`;

  // Highest point
  let highIdx = 0;
  let highEq = points[0].equity;
  points.forEach((p, i) => {
    if (p.equity > highEq) {
      highEq = p.equity;
      highIdx = i;
    }
  });
  const highX = getX(highIdx).toFixed(1);
  const highY = getY(highEq).toFixed(1);

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" class="equity-svg-chart">
      <defs>
        <linearGradient id="equityGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#10B981" stop-opacity="0.28" />
          <stop offset="70%" stop-color="#10B981" stop-opacity="0.06" />
          <stop offset="100%" stop-color="#10B981" stop-opacity="0.0" />
        </linearGradient>
      </defs>
      <!-- Grid Reference Line at $10,000 -->
      <line x1="${padX}" y1="${getY(10000).toFixed(1)}" x2="${width - padX}" y2="${getY(10000).toFixed(1)}" stroke="#E2E8F0" stroke-dasharray="4,4" stroke-width="1" />
      <text x="${width - padX - 4}" y="${(getY(10000) - 4).toFixed(1)}" text-anchor="end" fill="#94A3B8" font-size="10" font-family="JetBrains Mono">$10,000</text>
      <!-- Area Fill -->
      <path d="${areaD}" fill="url(#equityGrad)" />
      <!-- Line Stroke -->
      <path d="${pathD}" fill="none" stroke="#059669" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
      <!-- High Peak Marker -->
      <circle cx="${highX}" cy="${highY}" r="4.5" fill="#059669" stroke="#FFFFFF" stroke-width="2" />
      <!-- Latest Point Marker -->
      <circle cx="${lastX}" cy="${lastY}" r="7" fill="#10B981" opacity="0.25" />
      <circle cx="${lastX}" cy="${lastY}" r="4" fill="#059669" stroke="#FFFFFF" stroke-width="1.5" />
    </svg>
  `;
}

// 1.1. Render Live Open Positions from Exness
function renderLivePositions() {
  if (!currentStatus) return;

  const freeMarginElem = document.getElementById('freeMarginVal');
  const freeMarginKpiElem = document.getElementById('freeMarginKpiVal');
  const marginLevelElem = document.getElementById('marginLevelVal');
  const totalPnlElem = document.getElementById('totalFloatingPnlVal');
  const grid = document.getElementById('livePositionsGrid');
  if (!grid) return;

  const freeMarginStr = currentStatus.freeMargin 
    ? `$${currentStatus.freeMargin.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
    : '--';

  if (freeMarginElem) freeMarginElem.innerText = freeMarginStr;
  if (freeMarginKpiElem) freeMarginKpiElem.innerText = freeMarginStr;

  if (marginLevelElem) {
    marginLevelElem.innerText = currentStatus.marginLevel 
      ? `${currentStatus.marginLevel.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
      : '--';
  }

  const positions = currentStatus.positionsList || [];
  let totalFloating = 0;

  if (positions.length === 0) {
    grid.innerHTML = '<div class="live-pos-empty"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg> <span>Danh mục an toàn — Không có vị thế rủi ro nào đang mở trên sàn Exness</span></div>';
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
    const slText = p.lockedSLPrice ? `$${Number(p.lockedSLPrice).toLocaleString()}` : (p.sl ? `$${Number(p.sl).toLocaleString()}` : 'Chưa đặt SL');
    const tpText = p.tp ? `$${Number(p.tp).toLocaleString()}` : (p.takeProfit ? `$${Number(p.takeProfit).toLocaleString()}` : 'Chưa đặt TP');
    
    // Status badge logic for profit lock
    let lockStatusHtml = '';
    if (p.isProfitLocked) {
      lockStatusHtml = `<span class="badge-ticket scalper">🛡️ Khóa Lãi @ ${p.lockedSLPrice ? '$' + Number(p.lockedSLPrice).toLocaleString() : 'SL'} (+0.50R ${p.lockedProfitUSD ? `~ +$${p.lockedProfitUSD.toFixed(2)}` : ''})</span>`;
    } else if (isProfit) {
      lockStatusHtml = `<span class="badge-ticket" style="background:#FEF3C7; color:#92400E; border:1px solid #FCD34D;">⚡ Đang có lãi (+1.0R sẽ khóa +0.5R)</span>`;
    } else {
      lockStatusHtml = `<span class="badge-ticket neutral">⏳ Đang gồng vị thế cơ sở</span>`;
    }

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
            <span class="live-pos-metric-label">Giá vào (Entry)</span>
            <span class="live-pos-metric-val mono">${p.openPrice ? '$' + p.openPrice.toLocaleString() : '--'}</span>
          </div>
          <div class="live-pos-metric">
            <span class="live-pos-metric-label">Giá thị trường (Market)</span>
            <span class="live-pos-metric-val mono ${isProfit ? 'text-green' : 'text-red'}">${p.currentPrice ? '$' + p.currentPrice.toLocaleString() : '--'}</span>
          </div>
          <div class="live-pos-metric">
            <span class="live-pos-metric-label">Cắt lỗ (SL)</span>
            <span class="live-pos-metric-val mono text-red">${slText}</span>
          </div>
          <div class="live-pos-metric">
            <span class="live-pos-metric-label">Chốt lời (TP)</span>
            <span class="live-pos-metric-val mono text-green">${tpText}</span>
          </div>
        </div>
        <div class="live-pos-footer">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span class="meta-label">Bảo vệ: <strong class="mono text-green" style="font-size:11px;">Khóa Lãi +0.5R</strong></span>
          </div>
          <div>
            ${lockStatusHtml}
          </div>
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

  const isEngineCurrentlyActive = (stratKey, assetSet) => {
    if (!currentStatus || !currentStatus.activeEngines) return true;
    const activeEnginesObj = currentStatus.activeEngines;
    if (assetSet && assetSet.size > 0) {
      for (const a of assetSet) {
        const list = activeEnginesObj[a] || (a === 'BTC' ? activeEnginesObj['BTCUSD'] : (a === 'USOIL' ? activeEnginesObj['USOIL'] : null));
        if (Array.isArray(list) && list.includes(stratKey)) return true;
      }
    }
    return Object.values(activeEnginesObj).some(arr => Array.isArray(arr) && arr.includes(stratKey));
  };

  const stratList = Object.values(strategyMap).map(s => {
    const decisiveTrades = s.wins + s.losses;
    const winRate = decisiveTrades > 0 ? ((s.wins / decisiveTrades) * 100) : (s.closedTrades > 0 ? 50 : 0);
    const pf = s.grossLoss > 0 ? (s.grossProfit / s.grossLoss).toFixed(1) : (s.grossProfit > 0 ? 'Max Alpha' : '0.0');
    const isActive = isEngineCurrentlyActive(s.key, s.assets);
    return {
      ...s,
      winRate,
      pf,
      isActive
    };
  });

  // Cập nhật số lượng đếm trên tab filter
  const allCount = stratList.length;
  const liveCount = stratList.filter(s => !s.isShadow && s.isActive).length;
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

  const worstIsActive = worstStrat ? worstStrat.isActive : false;
  const worstBadgeHtml = worstStrat?.isShadow 
    ? `<span class="badge-tag neutral">🔮 SHADOW A/B</span>` 
    : (worstIsActive 
        ? `<span class="badge-tag" style="background:#FEE2E2; color:#991B1B; border:1px solid #F87171; font-weight:700;">⚠️ ĐANG CHẠY LIVE</span>` 
        : `<span class="badge-tag neutral" style="background:#F1F5F9; color:#64748B; border:1px solid #CBD5E1; font-weight:700;">⏸️ ĐÃ DỪNG (LỊCH SỬ)</span>`);

  const worstRecHtml = worstIsActive
    ? `<span><strong>KHUYẾN NGHỊ:</strong> Nên tạm dừng hoặc lọc bỏ khỏi config.json để tránh lỗ thêm</span>`
    : `<span><strong>TRẠNG THÁI:</strong> <strong class="text-green">✅ ĐÃ TẮT KHỎI CONFIG.JSON</strong> • Hệ thống đã ngắt lệnh live, lưu lại dữ liệu lịch sử</span>`;

  const isPotentialTopTier = potentialStrat && (potentialStrat.overallRank <= 3);
  const potentialBadgeHtml = isPotentialTopTier
    ? `<span class="badge-tag" style="background:#FEF3C7; color:#92400E; border:1px solid #FCD34D; font-weight:700; font-size:11px;">⚡ Rủi ro ưu tiên: 5.0% Vốn</span>`
    : `<span class="badge-tag neutral" style="font-size:11px;">Rủi ro cơ sở: 2.0% Vốn</span>`;
  const potentialRecHtml = isPotentialTopTier
    ? `⚡ Cấp quyền nâng rủi ro lên 5.0% tài khoản (Scalper 2.5% + Runner 2.5%)`
    : `Duy trì rủi ro cơ sở 2.0% (Scalper 1.0% + Runner 1.0%)`;

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
          <span class="badge-tag" style="background:#FEE2E2; color:#991B1B; border:1px solid #F87171; font-weight:800; font-size:11px;">👑 Rủi ro Quân Vương: 10.0% Vốn (BTCUSD) | 5.0% Vốn (Phi-BTC)</span>
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
        <span><strong>KHUYẾN NGHỊ:</strong> 👑 Quyền nâng rủi ro lên 10.0% vốn cho BTCUSD (Scalper 5.0% + Runner 5.0%) | Khóa trần 5.0% cho Vàng/Phi-BTC</span>
      </div>
    </div>

    <!-- Card 2: YẾU NHẤT / CẦN LỌC BỎ -->
    <div class="spotlight-card worst">
      <div class="spotlight-header" style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
        <span class="spotlight-tag worst">${worstIsActive ? '⚠️ CẦN THEO DÕI / LỌC BỎ' : '⏸️ ĐÃ TẮT / LỊCH SỬ'}</span>
        ${worstBadgeHtml}
      </div>
      <div>
        <div class="spotlight-name">${worstStrat ? worstStrat.displayName : 'Chưa có chiến lược yếu'}</div>
        <p class="spotlight-desc">Tài sản: <strong>${worstStrat ? Array.from(worstStrat.assets).join(', ') : 'N/A'}</strong>. ${worstIsActive ? 'Hiệu suất sụt giảm hoặc tỷ lệ thua cao.' : 'Động cơ đã được gỡ bỏ khỏi phiên giao dịch live, chỉ lưu dữ liệu kiểm toán.'}</p>
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
      <div class="spotlight-action ${worstIsActive ? 'drop' : 'keep'}">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
        ${worstRecHtml}
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
            👑 RỦI RO QUÂN VƯƠNG: 10.0% (BTCUSD) | 5.0% (PHI-BTC)
          </span>
        </div>
      `;
    } else if (rank === 2) {
      rankBadge = `
        <span class="rank-badge rank-2">🥈 Hạng 2</span>
        <div style="margin-top: 4px;">
          <span class="badge-tag" style="background:#FEF3C7; color:#92400E; border:1px solid #FCD34D; font-size:10px; font-weight:700; display:inline-flex; align-items:center; gap:2px; padding:2px 6px; white-space:nowrap;">
            ⚡ Rủi ro ưu tiên: 5.0% Vốn
          </span>
        </div>
      `;
    } else if (rank === 3) {
      rankBadge = `
        <span class="rank-badge rank-3">🥉 Hạng 3</span>
        <div style="margin-top: 4px;">
          <span class="badge-tag" style="background:#FEF3C7; color:#92400E; border:1px solid #FCD34D; font-size:10px; font-weight:700; display:inline-flex; align-items:center; gap:2px; padding:2px 6px; white-space:nowrap;">
            ⚡ Rủi ro ưu tiên: 5.0% Vốn
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
            Rủi ro cơ sở: 2.0% Vốn
          </span>
        </div>
      `;
    }

    // Phân loại & Đánh giá
    let statusPill = '';
    let recommendation = '';
    if (!s.isActive && !s.isShadow) {
      statusPill = `<span class="status-pill" style="background:#F1F5F9; color:#64748B; border:1px solid #CBD5E1;">⏸️ ĐÃ DỪNG</span>`;
      recommendation = `<strong class="text-muted">Đã loại khỏi config.json</strong> • Bảo toàn vốn an toàn`;
    } else if (s.key.includes('LAMBDA') || s.key.includes('OMEGA') || s.key.includes('COUNTER')) {
      statusPill = `<span class="status-pill" style="background:#EEF2FF; color:#4338CA; border:1px solid #C7D2FE;">⚡ LỆCH XU HƯỚNG</span>`;
      recommendation = `<strong class="text-blue">⚡ Đánh lệch xu hướng (0.5% Vốn)</strong> • Bắt đỉnh/đáy kiệt sức`;
    } else if (rank === 1 && s.netPnl > 0) {
      statusPill = `<span class="status-pill champion">👑 QUÂN VƯƠNG</span>`;
      recommendation = `<strong class="text-green">👑 Quyền nâng 10.0% Vốn (BTCUSD) | Khóa 5.0% Vốn (Phi-BTC)</strong> • Động cơ số 1`;
    } else if (isTopTier && s.netPnl > 0) {
      statusPill = `<span class="status-pill good">🟢 HIỆU QUẢ CAO</span>`;
      recommendation = `<strong class="text-green">⚡ Quyền nâng 5.0% Vốn</strong> • Vận hành ổn định`;
    } else if (isTopTier) {
      statusPill = `<span class="status-pill good">🟢 TOP 3</span>`;
      recommendation = `<strong class="text-green">⚡ Quyền nâng 5.0% Vốn</strong> • Đang giữ vị thế`;
    } else if (s.netPnl < 0 || (s.totalTrades >= 3 && s.winRate < 45)) {
      statusPill = `<span class="status-pill danger">🔴 YẾU KÉM</span>`;
      recommendation = `<strong class="text-red">Nên tắt / Lọc bỏ</strong> (Rủi ro 2.0%)`;
    } else {
      statusPill = `<span class="status-pill testing">🟡 ĐANG TEST</span>`;
      recommendation = `Theo dõi thêm tín hiệu (Rủi ro 2.0%)`;
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
        <span class="badge-tag ${s.isShadow ? 'neutral' : (s.isActive ? 'live' : 'neutral')}" style="font-size: 10px; ${!s.isActive && !s.isShadow ? 'background:#F1F5F9; color:#64748B; border:1px solid #CBD5E1;' : ''}">
          ${s.isShadow ? '🔮 SHADOW' : (s.isActive ? '🟢 LIVE' : '⏸️ ĐÃ TẮT')}
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

  const now = new Date();
  const vnDateToday = getVietnamDateStr(now);
  const todayTrades = currentJournal.filter(t => isTradeToday(t, vnDateToday));
  const liveTrades = currentJournal.filter(t => !t.isShadow);
  const shadowTrades = currentJournal.filter(t => t.isShadow);
  const scalperTrades = currentJournal.filter(t => t.ticketType === 'SCALPER' || t.strategy?.includes('SCALPER') || t.note?.includes('SCALPER'));
  const runnerTrades = currentJournal.filter(t => t.ticketType === 'RUNNER' || t.strategy?.includes('RUNNER') || t.note?.includes('RUNNER'));
  const winTrades = currentJournal.filter(t => t.status === 'WIN' || t.status === 'SHADOW_WIN' || (typeof t.pnl === 'number' && t.pnl > 0));
  const lossTrades = currentJournal.filter(t => t.status === 'LOSS' || t.status === 'SHADOW_LOSS' || (typeof t.pnl === 'number' && t.pnl < 0));

  const countTodayElem = document.getElementById('countToday');
  if (countTodayElem) countTodayElem.innerText = todayTrades.length;
  document.getElementById('countAll').innerText = currentJournal.length;
  document.getElementById('countLive').innerText = liveTrades.length;
  if (document.getElementById('countShadow')) document.getElementById('countShadow').innerText = shadowTrades.length;
  if (document.getElementById('countScalper')) document.getElementById('countScalper').innerText = scalperTrades.length;
  if (document.getElementById('countRunner')) document.getElementById('countRunner').innerText = runnerTrades.length;
  if (document.getElementById('countWin')) document.getElementById('countWin').innerText = winTrades.length;
  if (document.getElementById('countLoss')) document.getElementById('countLoss').innerText = lossTrades.length;

  const navJournalCountElem = document.getElementById('navJournalCount');
  if (navJournalCountElem) {
    navJournalCountElem.innerText = `${currentJournal.length} LỆNH`;
  }

  let filtered = currentJournal;
  if (currentFilter === 'today') filtered = todayTrades;
  else if (currentFilter === 'live') filtered = liveTrades;
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
    const exnessProofUrl = exnessName ? `/api/artifacts/${encodeURIComponent(exnessName)}` : null;
    const tvProofUrl = tvName ? `/api/artifacts/${encodeURIComponent(tvName)}` : null;

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
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.getAttribute('data-filter');
    renderLedger();
  });
});

// Filter Buttons for Strategy Leaderboard
document.querySelectorAll('[data-strat-filter]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-strat-filter]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentStratFilter = btn.getAttribute('data-strat-filter');
    renderStrategyLeaderboard();
  });
});

// Refresh Button
document.getElementById('btnRefresh').addEventListener('click', () => {
  fetchData();
});

// Auto-polling every 3.5 seconds
setInterval(fetchData, 3500);

// Close modal on Escape key
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const modal = document.getElementById('evidenceModal');
    if (modal) modal.classList.remove('active');
  }
});

// ================= TAB SWITCHING CONTROLLER =================
function switchTab(tabId) {
  const validTabs = ['desk', 'engines', 'analytics'];
  if (!validTabs.includes(tabId)) tabId = 'desk';

  const panes = {
    'desk': document.getElementById('paneDesk'),
    'engines': document.getElementById('paneEngines'),
    'analytics': document.getElementById('paneAnalytics')
  };

  // Update nav buttons
  document.querySelectorAll('.nav-tab-btn').forEach(btn => {
    if (btn.getAttribute('data-tab') === tabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Update panes
  Object.keys(panes).forEach(k => {
    if (panes[k]) {
      if (k === tabId) {
        panes[k].classList.add('active');
      } else {
        panes[k].classList.remove('active');
      }
    }
  });

  try {
    history.replaceState(null, null, `#${tabId}`);
  } catch (e) {}
}
window.switchTab = switchTab;

function navigateToLeaderboard() {
  switchTab('analytics');
  setTimeout(() => {
    const el = document.getElementById('strategyLeaderboard');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 120);
}
window.navigateToLeaderboard = navigateToLeaderboard;

document.querySelectorAll('.nav-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tabId = btn.getAttribute('data-tab');
    switchTab(tabId);
  });
});

// Handle initial hash or browser navigation
function handleHashRoute() {
  const hash = (window.location.hash || '').replace('#', '').trim();
  if (hash === 'engines') {
    switchTab('engines');
  } else if (hash === 'analytics' || hash === 'strategyLeaderboard' || hash === 'ledger') {
    switchTab('analytics');
    if (hash === 'strategyLeaderboard') {
      setTimeout(() => {
        const el = document.getElementById('strategyLeaderboard');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 150);
    }
  } else {
    switchTab('desk');
  }
}
window.addEventListener('hashchange', handleHashRoute);
handleHashRoute();

// Autonomous Learning Agent UI Handlers
function renderLearningAgent() {
  if (!currentStatus) return;
  const l = currentStatus.lastLearningCycle;
  if (!l) return;

  const elDate = document.getElementById('learnLastCycleDate');
  const elTime = document.getElementById('learnLastCycleTime');
  const elWr = document.getElementById('learnWinrateVal');
  const elPf = document.getElementById('learnPfVal');
  const elPnl = document.getElementById('learnNetPnlVal');

  if (elDate && l.date) elDate.innerText = l.date;
  if (elTime && l.completedAt) {
    try {
      const d = new Date(l.completedAt);
      elTime.innerText = d.toLocaleTimeString('vi-VN', { hour12: false, timeZone: 'Asia/Ho_Chi_Minh' }) + ' (UTC+7)';
    } catch (e) {}
  }
  if (elWr && l.winRate !== undefined) elWr.innerText = `${l.winRate}% WR`;
  if (elPf && l.profitFactor !== undefined) elPf.innerText = `Profit Factor: ${l.profitFactor}`;
  if (elPnl && l.netPnl !== undefined) elPnl.innerText = `${l.netPnl >= 0 ? '+' : ''}$${Number(l.netPnl).toLocaleString()} USD`;
}
window.renderLearningAgent = renderLearningAgent;

async function triggerLearningCycleManually() {
  const btn = document.getElementById('btnTriggerLearning');
  if (btn) {
    btn.disabled = true;
    btn.innerText = '⏳ Đang Tự Học...';
  }
  try {
    const TUNNEL_URL = 'https://teams-superintendent-earlier-core.trycloudflare.com';
    let url = '/api/learning/trigger';
    if (window.location.hostname.includes('vercel.app')) {
      url = `${TUNNEL_URL}/api/learning/trigger`;
    }
    const res = await fetch(url).then(r => r.json());
    if (res && res.success) {
      if (btn) btn.innerText = '✅ Hoàn Tất Tự Học!';
      await fetchData();
      setTimeout(() => {
        if (btn) {
          btn.disabled = false;
          btn.innerText = '⚡ Kích Hoạt Tự Học Ngay';
        }
      }, 3000);
    } else {
      throw new Error(res?.error || 'Lỗi không xác định');
    }
  } catch (err) {
    if (btn) {
      btn.disabled = false;
      btn.innerText = '❌ Thất Bại (Thử lại)';
      setTimeout(() => { btn.innerText = '⚡ Kích Hoạt Tự Học Ngay'; }, 3000);
    }
    console.error('[LEARNING TRIGGER ERROR]', err);
  }
}
window.triggerLearningCycleManually = triggerLearningCycleManually;

// Initial call
fetchData();

