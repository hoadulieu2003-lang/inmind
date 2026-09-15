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

  // 1. Click button Indicators
  await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const btn = document.querySelector('button[data-name="open-indicators-dialog"]') || 
                  document.querySelector('#header-toolbar-indicators');
      if (btn) btn.click();
    })()`
  });
  await delay(1000);

  // 2. Focus and type 'DEMA'
  await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const input = document.querySelector('input[data-role="search"]');
      if (input) {
        input.focus();
        input.value = 'DEMA';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`
  });
  await delay(1500);

  // 3. Inspect what elements appeared
  const items = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const all = Array.from(document.querySelectorAll('*')).filter(el => {
        return el.innerText && el.innerText.includes('Double Exponential') && el.children.length === 0;
      }).map(el => ({ tag: el.tagName, text: el.innerText, class: el.className }));
      return { found: all };
    })()`,
    returnByValue: true
  });
  console.log('Found elements for DEMA:', JSON.stringify(items.result?.value, null, 2));

  // Screenshot
  const snap = await cdpCall(ws, 'Page.captureScreenshot', { format: 'png' });
  if (snap?.data) {
    fs.writeFileSync('C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a/tv_dialog_dema.png', Buffer.from(snap.data, 'base64'));
  }

  // Close dialog
  await cdpCall(ws, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await cdpCall(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });

  ws.close();
}

main().catch(console.error);
