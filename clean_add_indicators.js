const fs = require('fs');

function cdpCall(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const timeout = setTimeout(() => {
      ws.removeEventListener('message', handler);
      reject(new Error(`CDP Timeout for ${method}`));
    }, 15000);

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

  // 1. Gõ "Double EMA" vào ô tìm kiếm
  console.log('1. Tìm Double EMA...');
  await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const input = document.querySelector('input[data-role="search"]') || document.querySelector('div[role="dialog"] input');
      if (input) {
        input.focus();
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`
  });
  await delay(300);

  await cdpCall(ws, 'Input.insertText', { text: 'Double EMA' });
  await delay(1500);

  // Click vào kết quả Double Exponential Moving Average
  const demaClick = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const items = Array.from(document.querySelectorAll('*')).filter(el => {
        return (el.children.length === 0 || el.children.length === 1) && 
               (el.innerText === 'Double Exponential Moving Average' || el.innerText === 'Double EMA');
      });
      if (items.length > 0) {
        items[0].click();
        return { clicked: items[0].innerText };
      }
      return { error: 'Not found Double EMA' };
    })()`,
    returnByValue: true
  });
  console.log('Kết quả DEMA:', demaClick.result?.value);
  await delay(1000);

  // 2. Gõ "UT Bot Alerts" vào ô tìm kiếm
  console.log('2. Tìm UT Bot Alerts...');
  await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const input = document.querySelector('input[data-role="search"]') || document.querySelector('div[role="dialog"] input');
      if (input) {
        input.focus();
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`
  });
  await delay(300);

  await cdpCall(ws, 'Input.insertText', { text: 'UT Bot Alerts' });
  await delay(2000);

  // Click vào kết quả UT Bot Alerts
  const utClick = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const items = Array.from(document.querySelectorAll('*')).filter(el => {
        return el.innerText && el.innerText.includes('UT Bot Alerts') && el.children.length <= 2;
      });
      if (items.length > 0) {
        items[0].click();
        return { clicked: items[0].innerText };
      }
      return { error: 'Not found UT Bot' };
    })()`,
    returnByValue: true
  });
  console.log('Kết quả UT Bot:', utClick.result?.value);
  await delay(1000);

  // 3. Đóng dialog bằng phím Escape
  console.log('3. Đóng dialog...');
  await cdpCall(ws, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await cdpCall(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await delay(1000);

  // 4. Kiểm tra dataSources
  const sources = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const c = window._exposed_chartWidgetCollection;
      const w = c?.activeChartWidget?.value();
      const model = w?.model();
      return model?.dataSources()?.map(s => s.title ? s.title() : (s.metaInfo ? s.metaInfo().description : s.name()));
    })()`,
    returnByValue: true
  });
  console.log('Các chỉ báo hiện có:', sources.result?.value);

  const snap = await cdpCall(ws, 'Page.captureScreenshot', { format: 'png' });
  if (snap?.data) {
    fs.writeFileSync('C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a/tv_final_indicators.png', Buffer.from(snap.data, 'base64'));
  }

  ws.close();
}

main().catch(console.error);
