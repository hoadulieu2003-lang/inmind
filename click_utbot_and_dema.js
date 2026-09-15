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

  // 0. Mở hộp thoại Indicators
  console.log('0. Mở hộp thoại Indicators...');
  await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const btn = document.querySelector('button[data-name="open-indicators-dialog"]') || 
                  document.querySelector('#header-toolbar-indicators');
      if (btn) btn.click();
    })()`
  });
  await delay(1200);

  // 1. Click row containing QuantNomad
  console.log('1. Click UT Bot Alerts by QuantNomad...');
  const utRes = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const qn = Array.from(document.querySelectorAll('*')).find(el => el.innerText === 'QuantNomad');
      if (qn) {
        const row = qn.closest('[class*="item-"]') || qn.parentElement;
        (row || qn).click();
        return { clicked: 'UT Bot Alerts by QuantNomad' };
      }
      return { error: 'QuantNomad not found' };
    })()`,
    returnByValue: true
  });
  console.log('UT Bot Click:', utRes.result?.value);
  await delay(1200);

  // 2. Clear input and type EMA
  console.log('2. Search Double EMA...');
  await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const input = document.querySelector('input[data-role="search"]');
      if (input) {
        input.focus();
        input.value = 'Double Exponential Moving Average';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`
  });
  await delay(1500);

  // Click built-in Double EMA
  const demaRes = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const item = Array.from(document.querySelectorAll('*')).find(el => {
        return (el.children.length === 0) && (el.innerText === 'Double Exponential Moving Average' || el.innerText === 'Đường trung bình hàm mũ đôi');
      });
      if (item) {
        item.click();
        return { clicked: item.innerText };
      }
      return { error: 'DEMA not found' };
    })()`,
    returnByValue: true
  });
  console.log('DEMA Click:', demaRes.result?.value);
  await delay(1000);

  // 3. Close dialog
  console.log('3. Close dialog...');
  await cdpCall(ws, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await cdpCall(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await delay(1500);

  // 4. Inspect active sources on chart
  const sources = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const c = window._exposed_chartWidgetCollection;
      const w = c?.activeChartWidget?.value();
      const model = w?.model();
      return model?.dataSources()?.map(s => s.title ? s.title() : (s.metaInfo ? s.metaInfo().description : s.name()));
    })()`,
    returnByValue: true
  });
  console.log('Chỉ báo sau khi thêm:', sources.result?.value);

  const snap = await cdpCall(ws, 'Page.captureScreenshot', { format: 'png' });
  if (snap?.data) {
    fs.writeFileSync('C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a/tv_with_both_indicators.png', Buffer.from(snap.data, 'base64'));
    console.log('Saved tv_with_both_indicators.png');
  }

  ws.close();
}

main().catch(console.error);
