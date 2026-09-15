const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a';

async function verifyDashboard() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/72E96395FD241E155036B2353A81F2FB');
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });

  function cdp(method, params) {
    return new Promise((resolve) => {
      const id = Math.floor(Math.random() * 1000000);
      const h = (d) => {
        const msg = JSON.parse(d.toString());
        if (msg.id === id) {
          ws.off('message', h);
          resolve(msg.result);
        }
      };
      ws.on('message', h);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  console.log('1. Reloading Vercel Dashboard...');
  await cdp('Page.reload', { ignoreCache: true });
  await new Promise(r => setTimeout(r, 3500));

  console.log('2. Inspecting DOM KPI Cards...');
  const kpiInfo = await cdp('Runtime.evaluate', {
    expression: `(() => {
      return {
        equity: document.getElementById('equityVal')?.innerText,
        balance: document.getElementById('balanceVal')?.innerText,
        roi: document.getElementById('roiVal')?.innerText,
        netPnl: document.getElementById('netPnlVal')?.innerText,
        activePositions: document.getElementById('activePositionsCount')?.innerText,
        openSymbols: document.getElementById('openSymbolsList')?.innerText,
        winRate: document.getElementById('winRateVal')?.innerText,
        winLossCount: document.getElementById('winLossCount')?.innerText,
        lastClosedTrade: document.getElementById('lastClosedTrade')?.innerText,
        profitFactor: document.getElementById('profitFactorVal')?.innerText,
        bestStrat: document.getElementById('kpiBestStrat')?.innerText
      };
    })()`,
    returnByValue: true
  });

  console.log('=== VERIFIED LIVE KPI DATA ===');
  console.log(JSON.stringify(kpiInfo.result.value, null, 2));

  console.log('3. Capturing high-res evidence screenshot...');
  const screenshotRes = await cdp('Page.captureScreenshot', { format: 'png' });
  if (screenshotRes && screenshotRes.data) {
    const filePath = path.join(ARTIFACT_DIR, 'reconciled_kpi_card_live.png');
    fs.writeFileSync(filePath, Buffer.from(screenshotRes.data, 'base64'));
    console.log(`📸 Evidence saved successfully: ${filePath}`);
  }

  ws.close();
}

verifyDashboard().catch(console.error);
