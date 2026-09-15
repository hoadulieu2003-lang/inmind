const fs = require('fs');

function cdpCall(ws, method, params = {}) {
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

async function inspect() {
  // 1. TradingView
  const tvWs = new WebSocket('ws://127.0.0.1:9222/devtools/page/FBB66DD7C646B5BFAE8DE40058ACCCC6');
  await new Promise((res, rej) => {
    tvWs.onopen = res;
    tvWs.onerror = rej;
  });

  const tvRes = await cdpCall(tvWs, 'Runtime.evaluate', {
    expression: `(() => {
      const w = window._exposed_chartWidgetCollection?.activeChartWidget?.value();
      const symbol = w?.model()?.mainSeries()?.symbol();
      const watchlistItems = Array.from(document.querySelectorAll('[data-symbol-short]')).map(el => ({
        symbol: el.getAttribute('data-symbol-short'),
        text: el.innerText.replace(/\\s+/g, ' ')
      }));
      return { symbol, watchlistCount: watchlistItems.length, watchlistItems: watchlistItems.slice(0, 10) };
    })()`,
    returnByValue: true
  });
  console.log('TradingView Data:', JSON.stringify(tvRes?.result?.value, null, 2));

  const tvSnap = await cdpCall(tvWs, 'Page.captureScreenshot', { format: 'png' });
  if (tvSnap?.data) {
    fs.writeFileSync('C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a/tv_watchlist_opened.png', Buffer.from(tvSnap.data, 'base64'));
    console.log('Saved TV screenshot');
  }
  tvWs.close();

  // 2. Exness
  const exWs = new WebSocket('ws://127.0.0.1:9222/devtools/page/D8732812EFF8977614EA114107B74D4C');
  await new Promise((res, rej) => {
    exWs.onopen = res;
    exWs.onerror = rej;
  });

  const exRes = await cdpCall(exWs, 'Runtime.evaluate', {
    expression: `(() => {
      const rows = Array.from(document.querySelectorAll('tbody tr, div[role="row"]')).map(r => r.innerText.replace(/\\s+/g, ' '));
      const balanceMatch = document.body.innerText.match(/Số dư[\\s\\n]+([\\d,\\.]+)/i);
      const equityMatch = document.body.innerText.match(/Vốn[\\s\\n]+([\\d,\\.]+)/i);
      const tabs = Array.from(document.querySelectorAll('[role="tab"], [class*="tab"]')).map(t => t.innerText.trim()).filter(Boolean);
      const activeInstrument = document.querySelector('[class*="InstrumentHeader"], [data-testid*="instrument-name"]')?.innerText || '';
      return {
        rows: rows.filter(r => r.length > 5).slice(0, 10),
        balance: balanceMatch ? balanceMatch[1] : null,
        equity: equityMatch ? equityMatch[1] : null,
        tabs: tabs.slice(0, 15),
        activeInstrument
      };
    })()`,
    returnByValue: true
  });
  console.log('Exness Data:', JSON.stringify(exRes?.result?.value, null, 2));

  const exSnap = await cdpCall(exWs, 'Page.captureScreenshot', { format: 'png' });
  if (exSnap?.data) {
    fs.writeFileSync('C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a/exness_current_state.png', Buffer.from(exSnap.data, 'base64'));
    console.log('Saved Exness screenshot');
  }
  exWs.close();
}

inspect().catch(console.error);
