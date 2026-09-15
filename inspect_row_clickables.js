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

async function inspectRow() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/D8732812EFF8977614EA114107B74D4C');
  await new Promise(r => ws.onopen = r);

  const res = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const rows = Array.from(document.querySelectorAll('[role="row"], tr, [class*="Row_row"]'));
      if (rows.length < 2) return 'Not enough rows';
      const r = rows[1];
      const children = Array.from(r.children).map((c, idx) => ({
        idx,
        text: c.innerText.replace(/\s+/g, ' '),
        tag: c.tagName,
        buttons: Array.from(c.querySelectorAll('button, svg, [role="button"]')).map(b => ({
          tag: b.tagName,
          ariaLabel: b.getAttribute('aria-label'),
          title: b.getAttribute('title'),
          text: b.innerText ? b.innerText.trim() : '',
          class: b.className
        }))
      }));
      return children;
    })()`,
    returnByValue: true
  });
  console.log('Row elements:', JSON.stringify(res, null, 2));
  ws.close();
}

inspectRow().catch(console.error);
