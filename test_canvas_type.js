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

  console.log('Testing Canvas Click & Key Typing...');
  // 1. Click in middle of chart canvas to focus
  await cdpCall(ws, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: 500, y: 400, button: 'left', clickCount: 1 });
  await cdpCall(ws, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: 500, y: 400, button: 'left', clickCount: 1 });
  await delay(300);

  // 2. Type 'GOLD'
  for (const char of 'GOLD') {
    await cdpCall(ws, 'Input.dispatchKeyEvent', { type: 'keyDown', text: char, unmodifiedText: char, key: char });
    await cdpCall(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', key: char });
    await delay(100);
  }
  await delay(800);

  // Take screenshot to see if Symbol Search opened
  const snap1 = await cdpCall(ws, 'Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a/canvas_type_test.png', Buffer.from(snap1.data, 'base64'));

  // 3. Press Enter
  await cdpCall(ws, 'Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await cdpCall(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await delay(2500);

  const snap2 = await cdpCall(ws, 'Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a/canvas_after_enter.png', Buffer.from(snap2.data, 'base64'));

  // Inspect page title & main series title
  const info = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const mainTitle = document.querySelector('[data-name="legend-series-item"], [class*="titleWrapper-"][class*="mainTitle-"]')?.innerText;
      return { pageTitle: document.title, mainTitle };
    })()`,
    returnByValue: true
  });
  console.log('Result:', info.result?.value);
  ws.close();
}

main().catch(console.error);
