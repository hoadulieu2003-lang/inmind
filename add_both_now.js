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
  const tv = tabs.find(t => t.type === 'page' && t.url.includes('tradingview.com'));
  const ws = new WebSocket(`ws://127.0.0.1:9222/devtools/page/${tv.id}`);
  await new Promise(r => ws.onopen = r);

  // 1. Click Double EMA
  console.log('1. Click Double EMA...');
  const clickDema = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const item = Array.from(document.querySelectorAll('*')).find(el => el.innerText && el.innerText.trim() === 'Double EMA' && el.children.length <= 1);
      if (item) {
        (item.closest('[class*="item-"]') || item).click();
        return { clicked: 'Double EMA' };
      }
      return { error: 'Not found Double EMA' };
    })()`,
    returnByValue: true
  });
  console.log('DEMA click result:', clickDema.result?.value);
  await delay(1200);

  // 2. Tìm và gõ "UT Bot Alerts"
  console.log('2. Search UT Bot Alerts...');
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
  await delay(1500);

  // Click UT Bot Alerts by QuantNomad
  const clickUt = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const qn = Array.from(document.querySelectorAll('*')).find(el => el.innerText === 'QuantNomad');
      if (qn) {
        const row = qn.closest('[class*="item-"]') || qn.parentElement;
        (row || qn).click();
        return { clicked: 'UT Bot Alerts by QuantNomad' };
      }
      // Dự phòng tìm theo text
      const ut = Array.from(document.querySelectorAll('*')).find(el => el.innerText && el.innerText.trim() === 'UT Bot Alerts' && el.children.length <= 1);
      if (ut) {
        (ut.closest('[class*="item-"]') || ut).click();
        return { clicked: 'UT Bot Alerts' };
      }
      return { error: 'Not found UT Bot Alerts' };
    })()`,
    returnByValue: true
  });
  console.log('UT Bot click result:', clickUt.result?.value);
  await delay(1500);

  // 3. Đóng dialog bằng nút X hoặc phím Escape
  console.log('3. Close dialog...');
  await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const closeBtn = document.querySelector('button[data-name="close"]') || document.querySelector('div[role="dialog"] button');
      if (closeBtn) closeBtn.click();
    })()`
  });
  await delay(500);
  await cdpCall(ws, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await cdpCall(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await delay(1500);

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
  console.log('--- DANH SÁCH DATA SOURCES MỚI NHẤT ---');
  console.log(sources.result?.value);

  const snap = await cdpCall(ws, 'Page.captureScreenshot', { format: 'png' });
  if (snap?.data) {
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'tv_with_both_verified.png'), Buffer.from(snap.data, 'base64'));
    console.log('Đã lưu tv_with_both_verified.png');
  }

  ws.close();
}

main().catch(console.error);
