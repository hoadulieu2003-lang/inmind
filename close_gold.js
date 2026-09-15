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

async function closeOpenGold() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/D8732812EFF8977614EA114107B74D4C');
  await new Promise(r => ws.onopen = r);

  const res = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const rows = Array.from(document.querySelectorAll('[role="row"]'));
      if (rows.length < 2) return { error: 'No open row' };
      const dataRow = rows[1];
      const actionCol = dataRow.children[11];
      if (!actionCol) return { error: 'No action col' };
      const buttons = Array.from(actionCol.querySelectorAll('button'));
      // The second button is the Close (X) button
      const closeBtn = buttons[buttons.length - 1];
      if (closeBtn) {
        closeBtn.click();
        return { clicked: true };
      }
      return { error: 'No close button' };
    })()`,
    returnByValue: true
  });
  console.log('Close button clicked:', res);

  await delay(1000);

  // Check if a confirmation modal appears and click confirm if so
  const confirmRes = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const confirmBtn = Array.from(document.querySelectorAll('button')).find(b => {
        return b.innerText.includes('Xác nhận') || b.innerText.includes('Đóng vị thế') || b.innerText.includes('Đóng');
      });
      if (confirmBtn) {
        confirmBtn.click();
        return { confirmed: confirmBtn.innerText.trim() };
      }
      return { noConfirmNeeded: true };
    })()`,
    returnByValue: true
  });
  console.log('Confirm Close:', confirmRes);

  await delay(1500);

  const snap = await cdpCall(ws, 'Page.captureScreenshot', { format: 'png' });
  if (snap?.data) {
    fs.writeFileSync('C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a/exness_after_close_gold.png', Buffer.from(snap.data, 'base64'));
  }

  ws.close();
}

closeOpenGold().catch(console.error);
