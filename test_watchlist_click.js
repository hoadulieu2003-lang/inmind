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

  // 1. Inspect watchlist items
  const watchlistItems = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const items = Array.from(document.querySelectorAll('div[data-name="watchlist-item"], div[class*="symbol-"], tr[class*="row-"]')).map(el => {
        const text = el.innerText?.replace(/\\s+/g, ' ');
        const r = el.getBoundingClientRect();
        return { text, x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
      }).filter(i => i.w > 0 && i.text && (i.text.includes('GOLD') || i.text.includes('4,36') || i.text.includes('UKOIL') || i.text.includes('BT')));
      return items;
    })()`,
    returnByValue: true
  });

  console.log('Watchlist items found:', watchlistItems.result?.value);

  // Find GOLD in watchlist
  const goldItem = watchlistItems.result?.value?.find(i => i.text.includes('4,36') || i.text.includes('GOLD'));
  if (goldItem) {
    console.log('Clicking GOLD in watchlist at:', goldItem);
    await cdpCall(ws, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: goldItem.x, y: goldItem.y, button: 'left', clickCount: 1 });
    await cdpCall(ws, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: goldItem.x, y: goldItem.y, button: 'left', clickCount: 1 });
    
    await delay(2000);

    const snap = await cdpCall(ws, 'Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a/watchlist_click_gold.png', Buffer.from(snap.data, 'base64'));

    const seriesTitle = await cdpCall(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const titleEl = document.querySelector('[class*="titleWrapper-"][class*="mainTitle-"], [data-name="legend-series-item"]');
        return titleEl ? titleEl.innerText?.replace(/\\s+/g, ' ') : null;
      })()`,
      returnByValue: true
    });
    console.log('Series title after clicking watchlist GOLD:', seriesTitle.result?.value);
  }

  ws.close();
}

main().catch(console.error);
