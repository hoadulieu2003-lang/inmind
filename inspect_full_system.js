const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a';

async function cdpCall(tabId, method, params = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/' + tabId);
    let id = 1;
    ws.onopen = () => {
      ws.send(JSON.stringify({ id: id++, method, params }));
    };
    ws.onmessage = (e) => {
      const res = JSON.parse(e.data);
      if (res.error) {
        ws.close();
        return reject(res.error);
      }
      ws.close();
      resolve(res.result);
    };
    ws.onerror = reject;
    setTimeout(() => {
      ws.close();
      reject(new Error('CDP Timeout for ' + method));
    }, 10000);
  });
}

async function captureScreenshot(tabId, filename) {
  const result = await cdpCall(tabId, 'Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(result.data, 'base64');
  fs.writeFileSync(filename, buf);
  const artifactPath = path.join(ARTIFACT_DIR, path.basename(filename));
  fs.writeFileSync(artifactPath, buf);
  return artifactPath;
}

async function evaluate(tabId, expression) {
  const result = await cdpCall(tabId, 'Runtime.evaluate', {
    expression,
    returnByValue: true
  });
  return result?.result?.value;
}

async function main() {
  const tabsRes = await fetch('http://127.0.0.1:9222/json');
  const tabs = await tabsRes.json();
  console.log('--- FOUND TABS ---');

  const tvTabs = {
    gold: tabs.find(t => t.title.includes('GOLD') || (t.url.includes('GOLD') && !t.title.includes('BTC') && !t.title.includes('UKOIL'))),
    btc: tabs.find(t => t.title.includes('BTC') || t.url.includes('BTC')),
    oil: tabs.find(t => t.title.includes('UKOIL') || t.url.includes('UKOIL') || t.title.includes('Dầu') || t.url.includes('OIL')),
    exness: tabs.find(t => t.url.includes('exness.com/webtrading'))
  };

  const report = {};

  // 1. Inspect Exness
  if (tvTabs.exness) {
    console.log('Inspecting Exness Tab:', tvTabs.exness.id);
    const exnessData = await evaluate(tvTabs.exness.id, `(() => {
      // Find balance / equity
      const allText = document.body.innerText;
      const balanceMatch = allText.match(/Số dư[\\s\\n]+([\\d,\\.]+)/i);
      const equityMatch = allText.match(/Vốn[\\s\\n]+([\\d,\\.]+)/i) || allText.match(/Vốn chủ sở hữu[\\s\\n]+([\\d,\\.]+)/i);

      // Open positions table / rows
      const rows = Array.from(document.querySelectorAll('tr, div[role="row"]')).map(r => r.innerText.trim().replace(/\\s+/g, ' '));
      const positionRows = rows.filter(r => r.includes('XAU/USD') || r.includes('BTC') || r.includes('OIL') || r.includes('Lệnh'));

      // Check current open position in bottom table
      const positionElements = Array.from(document.querySelectorAll('div[data-testid*="position"], tr[data-testid*="position"], tbody tr')).map(tr => tr.innerText.trim().replace(/\\s+/g, ' '));

      return {
        title: document.title,
        balanceText: balanceMatch ? balanceMatch[0] : 'N/A',
        equityText: equityMatch ? equityMatch[0] : 'N/A',
        positionsFound: positionElements.filter(p => p.length > 5 && (p.includes('XAU') || p.includes('43') || p.includes('Mua') || p.includes('Bán'))),
        rawRows: positionRows.slice(0, 5)
      };
    })()`);
    await captureScreenshot(tvTabs.exness.id, 'exness_status_live.png');
    report.exness = exnessData;
  }

  // 2. Inspect TradingView tabs
  for (const [key, tab] of Object.entries(tvTabs)) {
    if (key === 'exness' || !tab) continue;
    console.log('Inspecting TV ' + key.toUpperCase() + ' Tab:', tab.id);
    const tvData = await evaluate(tab.id, `(() => {
      // Get symbol & interval
      const headerTitle = document.title;
      const intervalBtn = document.querySelector('#header-toolbar-intervals button, button[data-name="header-toolbar-interval"]')?.innerText?.trim();

      // Legend items
      const legendEls = Array.from(document.querySelectorAll('[data-name="legend-source-item"], [data-name="legend-series-item"], [class*="legendItem"]'));
      const legendTexts = legendEls.map(el => el.innerText?.trim().replace(/\\s+/g, ' ')).filter(Boolean);

      // Indicator titles
      const titles = Array.from(document.querySelectorAll('[data-name="legend-source-title"], div[class*="title-"]')).map(e => e.innerText?.trim()).filter(Boolean);

      return {
        pageTitle: headerTitle,
        interval: intervalBtn || 'N/A',
        legendItems: legendTexts,
        titles: titles
      };
    })()`);
    await captureScreenshot(tab.id, 'tv_' + key + '_status_live.png');
    report[key] = tvData;
  }

  console.log('=== FULL INSPECTION REPORT ===');
  console.log(JSON.stringify(report, null, 2));
}

main().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
