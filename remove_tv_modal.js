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

async function removeModal() {
  const tabsRes = await fetch('http://127.0.0.1:9222/json');
  const tabs = await tabsRes.json();
  const tv = tabs.find(t => t.type === 'page' && t.url.includes('tradingview.com'));
  const ws = new WebSocket(`ws://127.0.0.1:9222/devtools/page/${tv.id}`);
  await new Promise(r => ws.onopen = r);

  const res = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      // 1. Click 'Got it!' on tooltip if any
      const gotIt = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Got it'));
      if (gotIt) gotIt.click();

      // 2. Tìm và đóng/gỡ bỏ modal "Look first / Then leap"
      let removed = 0;
      const modals = Array.from(document.querySelectorAll('*')).filter(el => {
        return el.innerText && el.innerText.includes('Look first / Then leap') && el.parentElement === document.body;
      });
      
      // Hoặc tìm trong overlap-manager-root
      const overlapRoots = Array.from(document.querySelectorAll('[data-role="dialog"], [class*="dialog-"], [class*="modal-"]')).filter(el => {
        return el.innerText && el.innerText.includes('Look first / Then leap');
      });

      [...modals, ...overlapRoots].forEach(el => {
        let p = el;
        while (p && p.parentElement && p.parentElement !== document.body && !p.classList.contains('overlap-manager-root')) {
          p = p.parentElement;
        }
        if (p) {
          p.remove();
          removed++;
        }
      });

      return { removed };
    })()`,
    returnByValue: true
  });
  console.log('Remove modal result:', res);
  await delay(800);

  const snap = await cdpCall(ws, 'Page.captureScreenshot', { format: 'png' });
  if (snap?.data) {
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'tv_clean_chart.png'), Buffer.from(snap.data, 'base64'));
    console.log('Đã lưu tv_clean_chart.png');
  }

  ws.close();
}

removeModal().catch(console.error);
