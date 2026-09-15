const fs = require('fs');

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
  const tv = tabs.find(t => t.type === 'page' && t.url.includes('tradingview.com'));
  const ws = new WebSocket(`ws://127.0.0.1:9222/devtools/page/${tv.id}`);
  await new Promise(r => ws.onopen = r);

  // Click Save menu first
  await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const menuBtn = document.querySelector('[data-name="save-load-menu"]') || 
                      Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Save'));
      if (menuBtn) menuBtn.click();
    })()`
  });
  await delay(800);

  // Click Open layout...
  const clickRes = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const item = Array.from(document.querySelectorAll('[data-role="menuitem"], [class*="menuItem-"]')).find(el => el.innerText.includes('Open layout'));
      if (item) {
        item.click();
        return 'clicked open layout';
      }
      return 'not found';
    })()`,
    returnByValue: true
  });
  console.log('Open Layout Item Click:', clickRes.result?.value);
  await delay(1200);

  // Read layouts in dialog
  const layouts = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const dialog = document.querySelector('div[role="dialog"]');
      const rows = Array.from(document.querySelectorAll('[data-role="list-item"], [class*="item-"]')).map(el => el.innerText.trim()).filter(t => t.length > 0 && t.length < 50);
      return {
        hasDialog: !!dialog,
        rows: rows.slice(0, 20)
      };
    })()`,
    returnByValue: true
  });
  console.log('Saved layouts found:', layouts.result?.value);

  const snap = await cdpCall(ws, 'Page.captureScreenshot', { format: 'png' });
  if (snap?.data) {
    fs.writeFileSync('C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a/tv_layout_dialog.png', Buffer.from(snap.data, 'base64'));
  }

  ws.close();
}

main().catch(console.error);
