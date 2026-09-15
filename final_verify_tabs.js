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
      reject(new Error('CDP Timeout'));
    }, 10000);
  });
}

async function capture(tabId, filename) {
  const result = await cdpCall(tabId, 'Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(result.data, 'base64');
  const fullPath = path.join(ARTIFACT_DIR, filename);
  fs.writeFileSync(fullPath, buf);
  return fullPath;
}

async function getLegendAndInterval(tabId) {
  const res = await cdpCall(tabId, 'Runtime.evaluate', {
    expression: `(() => {
      const titles = Array.from(document.querySelectorAll('[data-name="legend-source-title"], div[class*="title-"]')).map(e => e.innerText?.trim()).filter(Boolean);
      const activeBtn = document.querySelector('#header-toolbar-intervals button[class*="isActive"], button[data-name="header-toolbar-interval"][class*="isActive"]')?.innerText?.trim();
      return {
        title: document.title,
        interval: activeBtn || 'N/A',
        titles: titles
      };
    })()`,
    returnByValue: true
  });
  return res?.result?.value;
}

async function main() {
  const tabs = await (await fetch('http://127.0.0.1:9222/json')).json();
  const tvGold = tabs.find(t => t.title.includes('GOLD') || (t.url.includes('GOLD') && !t.title.includes('BTC') && !t.title.includes('UKOIL')));
  const tvBtc = tabs.find(t => t.title.includes('BTC') || t.url.includes('BTC'));
  const tvOil = tabs.find(t => t.title.includes('UKOIL') || t.url.includes('UKOIL'));
  const exness = tabs.find(t => t.url.includes('exness.com/webtrading'));

  console.log('--- VERIFYING TRADINGVIEW TABS ---');
  if (tvGold) {
    const goldInfo = await getLegendAndInterval(tvGold.id);
    await capture(tvGold.id, 'tv_gold_verified_final.png');
    console.log('GOLD:', goldInfo);
  }
  if (tvBtc) {
    const btcInfo = await getLegendAndInterval(tvBtc.id);
    await capture(tvBtc.id, 'tv_btc_verified_final.png');
    console.log('BTC:', btcInfo);
  }
  if (tvOil) {
    const oilInfo = await getLegendAndInterval(tvOil.id);
    await capture(tvOil.id, 'tv_oil_verified_final.png');
    console.log('OIL:', oilInfo);
  }
  if (exness) {
    await capture(exness.id, 'exness_verified_final.png');
    const exnessInfo = await cdpCall(exness.id, 'Runtime.evaluate', {
      expression: `(() => {
        const text = document.body.innerText;
        const balance = text.match(/Số dư[\\s\\n]+([\\d,\\.]+)/i);
        const equity = text.match(/Vốn[\\s\\n]+([\\d,\\.]+)/i);
        return {
          title: document.title,
          balance: balance ? balance[0] : 'N/A',
          equity: equity ? equity[0] : 'N/A'
        };
      })()`,
      returnByValue: true
    });
    console.log('EXNESS:', exnessInfo?.result?.value);
  }
}

main().catch(console.error);
