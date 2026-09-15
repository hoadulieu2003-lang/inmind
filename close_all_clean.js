const fs = require('fs');

function cdpCall(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const handler = (e) => {
      const res = JSON.parse(e.data);
      if (res.id === id) {
        ws.removeEventListener('message', handler);
        if (res.error) reject(res.error);
        else resolve(res.result?.result?.value !== undefined ? res.result.result.value : res.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function closeXAUGroup() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/D8732812EFF8977614EA114107B74D4C');
  await new Promise(r => ws.onopen = r);

  // Click the (x) button on the XAU/USD row
  const closeRes = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const row = document.querySelector('[role="row"]:has(span)');
      // Find the (x) button in the row or close all
      const closeAllBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Đóng tất cả'));
      if (closeAllBtn) {
        closeAllBtn.click();
        return { clicked: 'Đóng tất cả' };
      }
      return { error: 'Not found' };
    })()`,
    returnByValue: true
  });
  console.log('Close All Button:', closeRes);

  await delay(600);

  // If there's a dropdown or confirm modal
  const confirmRes = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const items = Array.from(document.querySelectorAll('*')).filter(el => {
        return el.children.length === 0 && (el.innerText === 'Tất cả các vị thế' || el.innerText === 'Đóng' || el.innerText === 'Xác nhận');
      });
      if (items.length > 0) {
        items[0].click();
        return { clickedItem: items[0].innerText };
      }
      return { noItem: true };
    })()`,
    returnByValue: true
  });
  console.log('Confirm dropdown:', confirmRes);

  await delay(1200);

  // Also check if any confirm modal popped up
  await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Xác nhận' || b.innerText.trim() === 'Đóng');
      if (btn) btn.click();
    })()`
  });

  await delay(1000);

  const snap = await cdpCall(ws, 'Page.captureScreenshot', { format: 'png' });
  if (snap?.data) {
    fs.writeFileSync('C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a/exness_after_close_all.png', Buffer.from(snap.data, 'base64'));
  }

  ws.close();
}

closeXAUGroup().catch(console.error);
