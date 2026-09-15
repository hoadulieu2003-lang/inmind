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

  // 1. Click vào "UT Bot Alerts" đang hiển thị
  console.log('1. Click vào UT Bot Alerts...');
  const utClick = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const dialog = document.querySelector('div[role="dialog"]');
      const all = Array.from(dialog.querySelectorAll('*'));
      const utEl = all.find(el => el.children.length === 0 && el.innerText.trim() === 'UT Bot Alerts');
      if (utEl) {
        (utEl.closest('[class*="item-"]') || utEl).click();
        return { clicked: 'UT Bot Alerts' };
      }
      return { error: 'Not found UT Bot Alerts' };
    })()`,
    returnByValue: true
  });
  console.log('UT Bot Click:', utClick.result?.value);
  await delay(1200);

  // 2. Xóa và gõ "EMA" để thêm DEMA
  console.log('2. Tìm và thêm DEMA...');
  await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const input = document.querySelector('div[role="dialog"] input');
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
      const dialog = document.querySelector('div[role="dialog"]');
      const all = Array.from(dialog.querySelectorAll('*'));
      const el = all.find(e => e.children.length === 0 && (e.innerText.includes('Double Exponential') || e.innerText.includes('Double EMA')));
      if (el) {
        (el.closest('[class*="item-"]') || el).click();
        return { clicked: el.innerText };
      }
      return { error: 'Not found DEMA' };
    })()`,
    returnByValue: true
  });
  console.log('DEMA Click:', demaClick.result?.value);
  await delay(1200);

  // 3. Đóng dialog bằng phím Escape
  console.log('3. Đóng dialog...');
  await cdpCall(ws, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await cdpCall(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await delay(1500);

  // 4. Kiểm tra danh sách nguồn dữ liệu trên Chart
  const sources = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const c = window._exposed_chartWidgetCollection;
      const w = c?.activeChartWidget?.value();
      const model = w?.model();
      return model?.dataSources()?.map(s => s.title ? s.title() : (s.metaInfo ? s.metaInfo().description : s.name()));
    })()`,
    returnByValue: true
  });
  console.log('--- CÁC CHỈ BÁO TRÊN BIỂU ĐỒ SAU KHI THÊM ---');
  console.log(sources.result?.value);

  const snap = await cdpCall(ws, 'Page.captureScreenshot', { format: 'png' });
  if (snap?.data) {
    fs.writeFileSync('C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a/tv_indicators_added_success.png', Buffer.from(snap.data, 'base64'));
    console.log('Đã lưu ảnh chụp xác nhận: tv_indicators_added_success.png');
  }

  ws.close();
}

main().catch(console.error);
