const fs = require('fs');

function cdpCall(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const handler = (e) => {
      const res = JSON.parse(e.data);
      if (res.id === id) {
        ws.removeEventListener('message', handler);
        if (res.error) reject(res.error);
        else resolve(res.result?.result?.value !== undefined ? res.result.result.value : res.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function snapTradingView() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/FBB66DD7C646B5BFAE8DE40058ACCCC6');
  await new Promise(r => ws.onopen = r);

  const snap = await cdpCall(ws, 'Page.captureScreenshot', { format: 'png' });
  if (snap?.data) {
    fs.writeFileSync('C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a/tv_morning_status.png', Buffer.from(snap.data, 'base64'));
    console.log('Saved tv_morning_status.png');
  }

  const chartInfo = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const w = window._exposed_chartWidgetCollection?.activeChartWidget?.value();
      const ms = w?.model()?.mainSeries();
      return {
        symbol: ms?.symbol(),
        interval: ms?.interval()
      };
    })()`,
    returnByValue: true
  });
  console.log('TradingView Chart Info:', chartInfo);

  ws.close();
}

snapTradingView().catch(console.error);
