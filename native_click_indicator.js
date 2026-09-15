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

  // 1. Mở dialog qua phím /
  console.log('1. Mở dialog...');
  await cdpCall(ws, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', key: '/', code: 'Slash', windowsVirtualKeyCode: 191, text: '/' });
  await cdpCall(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', key: '/', code: 'Slash', windowsVirtualKeyCode: 191 });
  await delay(1200);

  // 2. Tìm tọa độ UT Bot Alerts
  const coordsUT = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const qn = Array.from(document.querySelectorAll('*')).find(el => el.innerText === 'QuantNomad');
      if (qn) {
        const row = qn.closest('[class*="item-"]') || qn.parentElement;
        const rect = (row || qn).getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, text: qn.innerText };
      }
      return null;
    })()`,
    returnByValue: true
  });
  console.log('Tọa độ UT Bot:', coordsUT.result?.value);

  if (coordsUT.result?.value) {
    const { x, y } = coordsUT.result.value;
    console.log(`Click chuột tọa độ (${x}, ${y})...`);
    await cdpCall(ws, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await cdpCall(ws, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await delay(1500);
  }

  // 3. Tìm Double EMA
  console.log('2. Tìm Double EMA...');
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
  await cdpCall(ws, 'Input.insertText', { text: 'Double Exponential' });
  await delay(1500);

  const coordsDEMA = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const el = Array.from(document.querySelectorAll('*')).find(e => e.children.length === 0 && e.innerText && e.innerText.includes('Double Exponential'));
      if (el) {
        const row = el.closest('[class*="item-"]') || el;
        const rect = row.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, text: el.innerText };
      }
      return null;
    })()`,
    returnByValue: true
  });
  console.log('Tọa độ DEMA:', coordsDEMA.result?.value);

  if (coordsDEMA.result?.value) {
    const { x, y } = coordsDEMA.result.value;
    console.log(`Click chuột tọa độ DEMA (${x}, ${y})...`);
    await cdpCall(ws, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await cdpCall(ws, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await delay(1500);
  }

  // 4. Đóng dialog bằng phím Escape
  console.log('3. Đóng dialog...');
  await cdpCall(ws, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await cdpCall(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await delay(1500);

  // 5. Kiểm tra dataSources
  const sources = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const c = window._exposed_chartWidgetCollection;
      const w = c?.activeChartWidget?.value();
      const model = w?.model();
      return model?.dataSources()?.map(s => s.title ? s.title() : (s.metaInfo ? s.metaInfo().description : s.name()));
    })()`,
    returnByValue: true
  });
  console.log('--- KẾT QUẢ DATA SOURCES TRÊN BIỂU ĐỒ ---');
  console.log(sources.result?.value);

  const snap = await cdpCall(ws, 'Page.captureScreenshot', { format: 'png' });
  if (snap?.data) {
    fs.writeFileSync('C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a/tv_indicators_native_clicked.png', Buffer.from(snap.data, 'base64'));
  }

  ws.close();
}

main().catch(console.error);
