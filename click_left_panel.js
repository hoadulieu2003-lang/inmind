const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a';

function cdpCall(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const timeout = setTimeout(() => {
      ws.removeEventListener('message', handler);
      reject(new Error(`CDP Timeout for ${method}`));
    }, 10000);

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

const delay = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const tabs = await (await fetch('http://127.0.0.1:9222/json')).json();
  const exness = tabs.find(t => t.type === 'page' && t.url.includes('my.exness.com/webtrading'));
  const ws = new WebSocket(`ws://127.0.0.1:9222/devtools/page/${exness.id}`);
  await new Promise(r => ws.onopen = r);

  // Click the yellow tab or bottom panel toggle
  const clickRes = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      // Find element with yellow color or bottom expander
      const yellow = document.querySelector('[style*="rgb(255, 213, 0)"], [style*="yellow"], [class*="badge"], [class*="indicator"]');
      const bottomBtns = Array.from(document.querySelectorAll('button, div[role="button"]')).map(b => ({
        tag: b.tagName,
        aria: b.getAttribute('aria-label'),
        title: b.getAttribute('title'),
        text: b.innerText.slice(0, 30),
        rect: b.getBoundingClientRect()
      })).filter(b => b.rect.bottom > window.innerHeight - 80 || b.rect.left < 50);

      // Try to find the portfolio / order history button
      const historyBtn = Array.from(document.querySelectorAll('button, div[role="button"]')).find(b => {
        const aria = (b.getAttribute('aria-label') || '').toLowerCase();
        const text = (b.innerText || '').toLowerCase();
        return aria.includes('portfolio') || aria.includes('history') || aria.includes('danh mục') || aria.includes('lịch sử') || text.includes('danh mục');
      });

      if (historyBtn) {
        historyBtn.click();
        return { clicked: historyBtn.getAttribute('aria-label') || historyBtn.innerText };
      }

      // If not found, click at bottom left where the yellow tab is (x: 60, y: window.innerHeight - 20)
      return { bottomBtns: bottomBtns.slice(0, 15) };
    })()`,
    returnByValue: true
  });

  console.log('Result:', JSON.stringify(clickRes.result?.value, null, 2));
  await delay(1200);

  const snap = await cdpCall(ws, 'Page.captureScreenshot', { format: 'png' });
  if (snap?.data) {
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'exness_panel_toggled.png'), Buffer.from(snap.data, 'base64'));
    console.log('Saved exness_panel_toggled.png');
  }

  ws.close();
}

main().catch(console.error);
