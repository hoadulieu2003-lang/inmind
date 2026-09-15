const fs = require('fs');

async function cdpCall(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 100000);
    const handler = (e) => {
      const res = JSON.parse(e.data);
      if (res.id === id) {
        ws.removeEventListener('message', handler);
        if (res.error) reject(res.error);
        else resolve(res.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

const delay = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const tabs = await (await fetch('http://127.0.0.1:9222/json')).json();
  const tvTab = tabs.find(t => t.url.includes('tradingview.com/chart') && !t.title.includes('UKOIL'));
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/' + tvTab.id);
  await new Promise(r => ws.onopen = r);

  console.log('Testing Page.navigate to TVC:GOLD...');
  const t0 = Date.now();
  await cdpCall(ws, 'Page.navigate', { url: 'https://vn.tradingview.com/chart/dNNsGVXp/?symbol=TVC%3AGOLD' });
  
  // Wait for load
  await delay(3500);
  console.log('Navigation completed in:', Date.now() - t0, 'ms');

  const snap = await cdpCall(ws, 'Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a/navigate_gold.png', Buffer.from(snap.data, 'base64'));

  const status = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const title = document.title;
      const titles = Array.from(document.querySelectorAll('[data-name="legend-source-title"], div[class*="title-"]')).map(e => e.innerText?.trim()).filter(Boolean);
      return { title, titles };
    })()`,
    returnByValue: true
  });
  console.log('Page status:', status.result?.value);

  ws.close();
}

main().catch(console.error);
