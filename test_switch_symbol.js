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

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function switchSymbol(ws, targetSymbol) {
  console.log(`[SwitchSymbol] Starting switch to: ${targetSymbol}`);
  
  // 1. Click symbol search button
  const clickRes = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const btn = document.querySelector('#header-toolbar-symbol-search');
      if (!btn) return { error: 'Button not found' };
      btn.click();
      return { clicked: true };
    })()`,
    returnByValue: true
  });
  console.log('Clicked search button:', clickRes.result?.value);
  await delay(400);

  // 2. Find search input and type symbol
  const inputRes = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const searchInput = document.querySelector('input[data-role="search"], div[data-name="symbol-search-items-dialog"] input, div[role="dialog"] input[type="text"]');
      if (!searchInput) return { error: 'Search input not found' };
      searchInput.focus();
      searchInput.select();
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, '${targetSymbol}');
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      searchInput.dispatchEvent(new Event('change', { bubbles: true }));
      return { foundInput: true, value: searchInput.value };
    })()`,
    returnByValue: true
  });
  console.log('Typed symbol:', inputRes.result?.value);
  await delay(600);

  // 3. Press Enter on the input or click first search item
  const enterRes = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      // Find first result item
      const firstItem = document.querySelector('div[data-name="symbol-search-dialog-content-item"], [data-role="list-item"], div[class*="item-"][data-item-index="0"]');
      if (firstItem) {
        firstItem.click();
        return { clickedFirstItem: true, text: firstItem.innerText?.replace(/\\s+/g, ' ') };
      }
      return { clickedFirstItem: false };
    })()`,
    returnByValue: true
  });
  console.log('Result selection:', enterRes.result?.value);

  // If firstItem wasn't clicked, dispatch Enter key
  if (!enterRes.result?.value?.clickedFirstItem) {
    await cdpCall(ws, 'Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await cdpCall(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    console.log('Dispatched Enter key');
  }

  await delay(2000);

  // 4. Inspect current symbol and indicators
  const currentStatus = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const symbolBtn = document.querySelector('#header-toolbar-symbol-search');
      const intervalBtn = document.querySelector('#header-toolbar-intervals button[class*="isActive"], button[data-name="header-toolbar-interval"][class*="isActive"]');
      const titles = Array.from(document.querySelectorAll('[data-name="legend-source-title"], div[class*="title-"]')).map(e => e.innerText?.trim()).filter(Boolean);
      return {
        activeSymbol: symbolBtn ? symbolBtn.innerText?.trim() : 'Unknown',
        activeInterval: intervalBtn ? intervalBtn.innerText?.trim() : 'Unknown',
        titles: titles
      };
    })()`,
    returnByValue: true
  });

  return currentStatus.result?.value;
}

async function main() {
  const tabs = await (await fetch('http://127.0.0.1:9222/json')).json();
  const tvTab = tabs.find(t => t.url.includes('tradingview.com/chart') && !t.title.includes('UKOIL'));
  if (!tvTab) {
    console.error('TradingView tab not found');
    return;
  }

  console.log('Connecting to TV tab:', tvTab.id, tvTab.title);
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/' + tvTab.id);
  await new Promise(r => ws.onopen = r);

  // Test 1: Switch to GOLD
  console.log('\n--- TEST 1: SWITCH TO GOLD ---');
  const goldStatus = await switchSymbol(ws, 'GOLD');
  console.log('Gold Status:', goldStatus);
  const snap1 = await cdpCall(ws, 'Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a/test_switch_gold.png', Buffer.from(snap1.data, 'base64'));

  await delay(2000);

  // Test 2: Switch to UKOIL
  console.log('\n--- TEST 2: SWITCH TO UKOIL ---');
  const oilStatus = await switchSymbol(ws, 'UKOIL');
  console.log('Oil Status:', oilStatus);
  const snap2 = await cdpCall(ws, 'Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a/test_switch_oil.png', Buffer.from(snap2.data, 'base64'));

  await delay(2000);

  // Test 3: Switch back to BTCUSD
  console.log('\n--- TEST 3: SWITCH TO BTCUSD ---');
  const btcStatus = await switchSymbol(ws, 'BTCUSD');
  console.log('BTC Status:', btcStatus);
  const snap3 = await cdpCall(ws, 'Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a/test_switch_btc.png', Buffer.from(snap3.data, 'base64'));

  console.log('\n=== ALL SWITCH TESTS COMPLETED ===');
  ws.close();
}

main().catch(console.error);
