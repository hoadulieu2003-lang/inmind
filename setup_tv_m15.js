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

async function setupTV() {
  const tabsRes = await fetch('http://127.0.0.1:9222/json');
  const tabs = await tabsRes.json();
  const tv = tabs.find(t => t.type === 'page' && t.url.includes('tradingview.com'));
  if (!tv) return console.log('Không tìm thấy tab TradingView');

  const ws = new WebSocket(`ws://127.0.0.1:9222/devtools/page/${tv.id}`);
  await new Promise(r => ws.onopen = r);

  console.log('Đang thiết lập biểu đồ TradingView sang Vàng (TVC:GOLD) khung M15...');

  const res = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const c = window._exposed_chartWidgetCollection;
      const w = c?.activeChartWidget?.value();
      const model = w?.model();
      if (!model) return { error: 'No model' };

      // Đổi sang Vàng
      model.setSymbol(model.mainSeries(), 'TVC:GOLD');
      
      // Đổi sang M15
      if (typeof w.setResolution === 'function') {
        w.setResolution('15');
      }

      return {
        symbol: model.mainSeries()?.symbol(),
        interval: model.mainSeries()?.interval()
      };
    })()`,
    returnByValue: true
  });

  console.log('Kết quả cấu hình ban đầu:', res);
  await delay(2000);

  const snap = await cdpCall(ws, 'Page.captureScreenshot', { format: 'png' });
  if (snap?.data) {
    fs.writeFileSync('C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a/tv_setup_live.png', Buffer.from(snap.data, 'base64'));
    console.log('Đã lưu ảnh chụp: tv_setup_live.png');
  }

  ws.close();
}

setupTV().catch(console.error);
