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

async function closePopups() {
  const tabsRes = await fetch('http://127.0.0.1:9222/json');
  const tabs = await tabsRes.json();
  const tv = tabs.find(t => t.type === 'page' && t.url.includes('tradingview.com'));
  if (!tv) return;

  const ws = new WebSocket(`ws://127.0.0.1:9222/devtools/page/${tv.id}`);
  await new Promise(r => ws.onopen = r);

  console.log('Đang dọn dẹp các popup và panel trợ giúp trên TradingView...');

  // 1. Nhấn nút X của modal "Look first / Then leap" và Help Center
  await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      // Tìm tất cả nút đóng (X)
      const closeButtons = Array.from(document.querySelectorAll('button')).filter(b => {
        const name = b.getAttribute('data-name') || '';
        const label = b.getAttribute('aria-label') || '';
        const text = b.innerText?.trim() || '';
        return name.includes('close') || label.includes('close') || label.includes('Close') || text === 'Close' || text === 'Đóng';
      });
      closeButtons.forEach(b => b.click());

      // Nhấn Escape
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
      return { closedCount: closeButtons.length };
    })()`
  });
  await delay(1000);

  // 2. Chụp ảnh kiểm tra
  const snap = await cdpCall(ws, 'Page.captureScreenshot', { format: 'png' });
  if (snap?.data) {
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'tv_after_popup_clean.png'), Buffer.from(snap.data, 'base64'));
    console.log('Đã lưu tv_after_popup_clean.png');
  }

  ws.close();
}

closePopups().catch(console.error);
