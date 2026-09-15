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

async function main() {
  const tabs = await (await fetch('http://127.0.0.1:9222/json')).json();
  const tv = tabs.find(t => t.type === 'page' && t.url.includes('tradingview.com'));
  const ws = new WebSocket(`ws://127.0.0.1:9222/devtools/page/${tv.id}`);
  await new Promise(r => ws.onopen = r);

  const res = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const c = window._exposed_chartWidgetCollection;
      const w = c?.activeChartWidget?.value();
      const model = w?.model();
      const ms = model?.mainSeries();
      const lastBar = ms?.data()?.last();
      const sources = model?.dataSources() || [];
      const dema = sources.find(s => s.title && s.title().includes('DEMA'))?.data()?.last();
      const utBot = sources.find(s => s.title && s.title().includes('UT Bot'))?.data()?.last();

      return {
        symbol: ms?.symbol(),
        interval: ms?.interval(),
        lastCandle: lastBar ? {
          time: new Date(lastBar.value[0] * 1000).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
          open: lastBar.value[1],
          high: lastBar.value[2],
          low: lastBar.value[3],
          close: lastBar.value[4]
        } : null,
        demaVal: dema ? dema.value[1] : null,
        utBotVal: utBot ? utBot.value : null
      };
    })()`,
    returnByValue: true
  });

  console.log('--- TRADINGVIEW MONDAY MORNING STATUS ---');
  console.log(JSON.stringify(res.result?.value, null, 2));

  const snap = await cdpCall(ws, 'Page.captureScreenshot', { format: 'png' });
  if (snap?.data) {
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'tv_monday_morning_live.png'), Buffer.from(snap.data, 'base64'));
    console.log('Saved tv_monday_morning_live.png');
  }

  ws.close();
}

main().catch(console.error);
