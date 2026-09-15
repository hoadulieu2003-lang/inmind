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

async function inspectTVWatchlist() {
  const tvWs = new WebSocket('ws://127.0.0.1:9222/devtools/page/FBB66DD7C646B5BFAE8DE40058ACCCC6');
  await new Promise(r => tvWs.onopen = r);

  const res = await cdpCall(tvWs, 'Runtime.evaluate', {
    expression: `(() => {
      // Find elements on the right panel
      const allWithText = Array.from(document.querySelectorAll('*')).filter(el => {
        return el.children.length === 0 && (el.innerText === 'BTCUSD' || el.innerText === 'UKOIL' || el.innerText === 'GOLD');
      });

      return allWithText.map(el => {
        const rect = el.getBoundingClientRect();
        return {
          text: el.innerText,
          tagName: el.tagName,
          className: el.className,
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          parentTag: el.parentElement?.tagName,
          parentClass: el.parentElement?.className
        };
      });
    })()`,
    returnByValue: true
  });

  console.log('Watchlist DOM elements:', JSON.stringify(res, null, 2));
  tvWs.close();
}

inspectTVWatchlist().catch(console.error);
