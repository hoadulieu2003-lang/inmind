const fs = require('fs');

async function cdpCall(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
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
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/FBB66DD7C646B5BFAE8DE40058ACCCC6');
  await new Promise(r => ws.onopen = r);

  console.log('Testing switch to GOLD...');
  // 1. Click Search
  const r1 = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const btn = document.querySelector('#header-toolbar-symbol-search');
      if (btn) { btn.click(); return 'Clicked button'; }
      return 'Btn not found';
    })()`,
    returnByValue: true
  });
  console.log('Step 1 (Click):', r1.result?.value);
  await delay(500);

  // 2. Type GOLD
  const r2 = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const input = document.querySelector('input[data-role="search"], div[data-name="symbol-search-items-dialog"] input, div[role="dialog"] input[type="text"]');
      if (input) {
        input.focus();
        input.select();
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, 'GOLD');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return { typed: input.value };
      }
      return 'Input not found';
    })()`,
    returnByValue: true
  });
  console.log('Step 2 (Type):', r2.result?.value);
  await delay(800);

  // 3. Find list item or press enter
  const r3 = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const firstItem = document.querySelector('div[data-name="symbol-search-dialog-content-item"], [data-role="list-item"], div[class*="item-"][data-item-index="0"]');
      if (firstItem) {
        firstItem.click();
        return { clickedFirst: true, text: firstItem.innerText?.replace(/\\s+/g, ' ') };
      }
      return { clickedFirst: false };
    })()`,
    returnByValue: true
  });
  console.log('Step 3 (Select item):', r3.result?.value);

  // Also dispatch Enter
  await cdpCall(ws, 'Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await cdpCall(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await delay(2000);

  // Check new symbol
  const r4 = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => ({
      title: document.title,
      symbolBtn: document.querySelector('#header-toolbar-symbol-search')?.innerText
    }))()`,
    returnByValue: true
  });
  console.log('Step 4 (Result):', r4.result?.value);
  ws.close();
}

main().catch(console.error);
