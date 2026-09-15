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

async function verify() {
  const res = await fetch('http://127.0.0.1:9222/json');
  const tabs = await res.json();
  const pages = tabs.filter(t => t.type === 'page');

  const tv = pages.find(p => p.url.includes('tradingview.com'));
  const exness = pages.find(p => p.url.includes('my.exness.com/webtrading'));

  console.log('--- PHÁT HIỆN TABS ---');
  console.log('TradingView:', tv ? `${tv.id} (${tv.url})` : 'KHÔNG TÌM THẤY');
  console.log('Exness:', exness ? `${exness.id} (${exness.url})` : 'KHÔNG TÌM THẤY');

  if (!tv || !exness) {
    console.log('Chưa đủ 2 tab! Vui lòng kiểm tra lại trình duyệt.');
    return;
  }

  // 1. Kiểm tra Exness
  const exWs = new WebSocket(`ws://127.0.0.1:9222/devtools/page/${exness.id}`);
  await new Promise(r => exWs.onopen = r);

  const exData = await cdpCall(exWs, 'Runtime.evaluate', {
    expression: `(() => {
      const text = document.body.innerText;
      const balanceMatch = text.match(/Số dư[\\s\\n]+([\\d,\\.]+)/i);
      const equityMatch = text.match(/Vốn[\\s\\n]+([\\d,\\.]+)/i);
      const rows = Array.from(document.querySelectorAll('[role="row"]')).map(r => r.innerText.replace(/\\s+/g, ' ')).filter(r => r.includes('Mua') || r.includes('Bán'));
      return {
        balance: balanceMatch ? balanceMatch[1] : 'N/A',
        equity: equityMatch ? equityMatch[1] : 'N/A',
        rows
      };
    })()`,
    returnByValue: true
  });

  const exSnap = await cdpCall(exWs, 'Page.captureScreenshot', { format: 'png' });
  if (exSnap?.data) {
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'exness_live_check.png'), Buffer.from(exSnap.data, 'base64'));
  }
  exWs.close();

  console.log('--- THÔNG TIN TÀI KHOẢN EXNESS ---');
  console.log('Số dư:', exData.result?.value?.balance);
  console.log('Vốn:', exData.result?.value?.equity);
  console.log('Các vị thế đang mở:', exData.result?.value?.rows);

  // 2. Kiểm tra TradingView
  const tvWs = new WebSocket(`ws://127.0.0.1:9222/devtools/page/${tv.id}`);
  await new Promise(r => tvWs.onopen = r);

  const tvData = await cdpCall(tvWs, 'Runtime.evaluate', {
    expression: `(() => {
      const w = window._exposed_chartWidgetCollection?.activeChartWidget?.value();
      const model = w?.model();
      const ms = model?.mainSeries();
      return {
        hasModel: !!model,
        symbol: ms?.symbol() || 'N/A',
        interval: ms?.interval() || 'N/A'
      };
    })()`,
    returnByValue: true
  });

  const tvSnap = await cdpCall(tvWs, 'Page.captureScreenshot', { format: 'png' });
  if (tvSnap?.data) {
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'tv_live_check.png'), Buffer.from(tvSnap.data, 'base64'));
  }
  tvWs.close();

  console.log('--- THÔNG TIN BIỂU ĐỒ TRADINGVIEW ---');
  console.log('Trạng thái Model:', tvData.result?.value);
}

verify().catch(console.error);
