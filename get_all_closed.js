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

async function getAllClosed() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/D8732812EFF8977614EA114107B74D4C');
  await new Promise(r => ws.onopen = r);

  const res = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const rows = Array.from(document.querySelectorAll('[role="row"], tr, div[class*="Row"]')).map(r => r.innerText.replace(/\\s+/g, ' '));
      return rows;
    })()`,
    returnByValue: true
  });

  console.log('All Closed Rows:', JSON.stringify(res, null, 2));
  ws.close();
}

getAllClosed().catch(console.error);
