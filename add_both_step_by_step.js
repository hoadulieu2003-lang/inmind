const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a';

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

  // BƯỚC 1: Mở hộp thoại Indicators
  console.log('BƯỚC 1: Mở hộp thoại Indicators...');
  const openRes = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Indicators'));
      if (btn) {
        btn.click();
        return { clicked: true };
      }
      return { clicked: false };
    })()`,
    returnByValue: true
  });
  console.log('Mở dialog:', openRes.result?.value);
  await delay(1500);

  // BƯỚC 2: Tìm kiếm và click Double EMA
  console.log('BƯỚC 2: Thêm Double EMA...');
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
  await delay(1500);

  const demaClick = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const all = Array.from(document.querySelectorAll('div[role="dialog"] *'));
      const item = all.find(el => el.innerText && el.innerText.trim() === 'Double EMA' && el.children.length <= 1);
      if (item) {
        const clickable = item.closest('[class*="item-"]') || item;
        clickable.click();
        return { success: true, text: item.innerText };
      }
      return { success: false };
    })()`,
    returnByValue: true
  });
  console.log('Thêm DEMA:', demaClick.result?.value);
  await delay(1500);

  // BƯỚC 3: Tìm kiếm và click UT Bot Alerts
  console.log('BƯỚC 3: Thêm UT Bot Alerts...');
  await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const input = document.querySelector('div[role="dialog"] input');
      if (input) {
        input.focus();
        input.value = 'UT Bot Alerts';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`
  });
  await delay(2000);

  const utClick = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const all = Array.from(document.querySelectorAll('div[role="dialog"] *'));
      const qn = all.find(el => el.innerText === 'QuantNomad');
      if (qn) {
        const clickable = qn.closest('[class*="item-"]') || qn.parentElement;
        clickable.click();
        return { success: true, text: 'QuantNomad' };
      }
      const item = all.find(el => el.innerText && el.innerText.trim() === 'UT Bot Alerts' && el.children.length <= 1);
      if (item) {
        const clickable = item.closest('[class*="item-"]') || item;
        clickable.click();
        return { success: true, text: item.innerText };
      }
      return { success: false };
    })()`,
    returnByValue: true
  });
  console.log('Thêm UT Bot:', utClick.result?.value);
  await delay(1500);

  // BƯỚC 4: Đóng dialog
  console.log('BƯỚC 4: Đóng dialog...');
  await cdpCall(ws, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await cdpCall(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await delay(1500);

  // BƯỚC 5: Kiểm tra kết quả
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
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'tv_step_by_step_result.png'), Buffer.from(snap.data, 'base64'));
    console.log('Đã lưu tv_step_by_step_result.png');
  }

  ws.close();
}

main().catch(console.error);
