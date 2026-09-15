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

  // 1. Inspect input in dialog
  const inputInfo = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const dialog = document.querySelector('div[role="dialog"]');
      if (!dialog) return { error: 'no dialog' };
      const inputs = Array.from(dialog.querySelectorAll('input')).map(i => ({
        placeholder: i.placeholder,
        value: i.value,
        className: i.className,
        type: i.type
      }));
      return { inputs };
    })()`,
    returnByValue: true
  });
  console.log('Inputs found:', inputInfo.result?.value);

  // 2. Focus input and type DEMA
  await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const input = document.querySelector('div[role="dialog"] input');
      if (input) {
        input.focus();
        input.value = 'Double EMA';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`
  });
  await delay(1200);

  // Read list items
  const items = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const dialog = document.querySelector('div[role="dialog"]');
      const els = Array.from(dialog.querySelectorAll('[class*="title-"], [class*="item-"]')).map(e => e.innerText.trim()).filter(Boolean);
      return { count: els.length, sample: els.slice(0, 15) };
    })()`,
    returnByValue: true
  });
  console.log('Items after typing Double EMA:', items.result?.value);

  ws.close();
}

main().catch(console.error);
