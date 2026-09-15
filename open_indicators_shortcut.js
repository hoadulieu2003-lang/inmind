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

  // Focus chart and press '/'
  await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const canvas = document.querySelector('canvas');
      if (canvas) canvas.focus();
    })()`
  });
  await delay(300);

  console.log('Pressing / shortcut...');
  await cdpCall(ws, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', key: '/', code: 'Slash', windowsVirtualKeyCode: 191, text: '/' });
  await cdpCall(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', key: '/', code: 'Slash', windowsVirtualKeyCode: 191 });
  await delay(1500);

  const dialogStatus = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const dialog = document.querySelector('div[role="dialog"]');
      const input = document.querySelector('input[data-role="search"]');
      return {
        hasDialog: !!dialog,
        hasInput: !!input,
        dialogTitle: dialog ? dialog.innerText.slice(0, 50) : null
      };
    })()`,
    returnByValue: true
  });
  console.log('Dialog status:', dialogStatus.result?.value);

  const snap = await cdpCall(ws, 'Page.captureScreenshot', { format: 'png' });
  if (snap?.data) {
    fs.writeFileSync('C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a/tv_slash_dialog.png', Buffer.from(snap.data, 'base64'));
  }

  ws.close();
}

main().catch(console.error);
