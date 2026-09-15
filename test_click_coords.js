const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a';

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
  const exness = tabs.find(t => t.type === 'page' && t.url.includes('my.exness.com/webtrading'));
  const ws = new WebSocket(`ws://127.0.0.1:9222/devtools/page/${exness.id}`);
  await new Promise(r => ws.onopen = r);

  // 1. Click on the yellow tab at bottom-left
  // Find its exact element via document.elementsFromPoint or selector
  const yellowInfo = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const el = document.elementFromPoint(62, 855);
      return { tag: el?.tagName, className: el?.className, outerHTML: el?.outerHTML?.slice(0, 100) };
    })()`,
    returnByValue: true
  });
  console.log('Yellow element:', yellowInfo.result?.value);

  // Click it
  await cdpCall(ws, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: 62, y: 855, button: 'left', clickCount: 1 });
  await cdpCall(ws, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: 62, y: 855, button: 'left', clickCount: 1 });
  await delay(1500);

  const snap = await cdpCall(ws, 'Page.captureScreenshot', { format: 'png' });
  if (snap?.data) {
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'exness_after_yellow_click.png'), Buffer.from(snap.data, 'base64'));
    console.log('Saved exness_after_yellow_click.png');
  }

  ws.close();
}

main().catch(console.error);
