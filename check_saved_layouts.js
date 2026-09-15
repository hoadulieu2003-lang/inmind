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

async function checkLayouts() {
  const tabsRes = await fetch('http://127.0.0.1:9222/json');
  const tabs = await tabsRes.json();
  const tv = tabs.find(t => t.type === 'page' && t.url.includes('tradingview.com'));
  if (!tv) return;

  const ws = new WebSocket(`ws://127.0.0.1:9222/devtools/page/${tv.id}`);
  await new Promise(r => ws.onopen = r);

  // Close any open dialogs first
  await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const closeBtn = document.querySelector('button[data-name="close"]');
      if (closeBtn) closeBtn.click();
    })()`
  });
  await delay(800);

  // Click the load/save layout button
  const clickRes = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const menuBtn = document.querySelector('[data-name="save-load-menu"]') || 
                      Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Save') || b.getAttribute('aria-label')?.includes('layout'));
      if (menuBtn) {
        menuBtn.click();
        return { clicked: true, text: menuBtn.innerText };
      }
      return { clicked: false };
    })()`,
    returnByValue: true
  });
  console.log('Menu Click:', clickRes);
  await delay(1000);

  // Read items in dropdown
  const items = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const menuItems = Array.from(document.querySelectorAll('[data-role="menuitem"], [class*="menuItem-"]')).map(el => el.innerText.trim());
      return { menuItems };
    })()`,
    returnByValue: true
  });
  console.log('Layout menu items:', items.result?.value);

  ws.close();
}

checkLayouts().catch(console.error);
