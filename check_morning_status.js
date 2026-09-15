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

async function checkExnessNow() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/D8732812EFF8977614EA114107B74D4C');
  await new Promise(r => ws.onopen = r);

  // 1. Capture current open positions view
  const snap = await cdpCall(ws, 'Page.captureScreenshot', { format: 'png' });
  if (snap?.data) {
    fs.writeFileSync('C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a/exness_morning_status.png', Buffer.from(snap.data, 'base64'));
    console.log('Saved exness_morning_status.png');
  }

  // 2. Read open positions
  const openInfo = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const balanceMatch = document.body.innerText.match(/Số dư[\\s\\n]+([\\d,\\.]+)/i);
      const equityMatch = document.body.innerText.match(/Vốn[\\s\\n]+([\\d,\\.]+)/i);
      const rows = Array.from(document.querySelectorAll('[role="row"], tr, div[class*="Row"]')).map(r => r.innerText.replace(/\\s+/g, ' '));
      return {
        balance: balanceMatch ? balanceMatch[1] : null,
        equity: equityMatch ? equityMatch[1] : null,
        rows: rows.slice(0, 15)
      };
    })()`,
    returnByValue: true
  });
  console.log('Open Positions Info:', JSON.stringify(openInfo, null, 2));

  // 3. Click 'Đã đóng' tab to see closed positions history
  await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const tabs = Array.from(document.querySelectorAll('button, div[role="tab"]'));
      const closedTab = tabs.find(t => t.innerText && t.innerText.includes('Đã đóng'));
      if (closedTab) closedTab.click();
    })()`
  });
  await delay(1200);

  const closedSnap = await cdpCall(ws, 'Page.captureScreenshot', { format: 'png' });
  if (closedSnap?.data) {
    fs.writeFileSync('C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a/exness_closed_history.png', Buffer.from(closedSnap.data, 'base64'));
    console.log('Saved exness_closed_history.png');
  }

  const closedInfo = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const rows = Array.from(document.querySelectorAll('[role="row"], tr, div[class*="Row"]')).map(r => r.innerText.replace(/\\s+/g, ' '));
      return { closedRows: rows.slice(0, 20) };
    })()`,
    returnByValue: true
  });
  console.log('Closed History Info:', JSON.stringify(closedInfo, null, 2));

  ws.close();
}

checkExnessNow().catch(console.error);
