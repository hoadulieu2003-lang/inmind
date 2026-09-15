const fs = require('fs');

function cdpCall(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const handler = (e) => {
      const res = JSON.parse(e.data);
      if (res.id === id) {
        ws.removeEventListener('message', handler);
        resolve(res.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function testWatchlistSwitch() {
  const tvWs = new WebSocket('ws://127.0.0.1:9222/devtools/page/FBB66DD7C646B5BFAE8DE40058ACCCC6');
  await new Promise(r => tvWs.onopen = r);

  const symbols = ['BTCUSD', 'UKOIL', 'GOLD'];
  const results = [];

  for (const sym of symbols) {
    console.log(`\n--- Switching to ${sym} via Watchlist Click ---`);
    // Click on the watchlist element
    const clickRes = await cdpCall(tvWs, 'Runtime.evaluate', {
      expression: `(() => {
        const item = document.querySelector('[data-symbol-short="${sym}"]');
        if (item) {
          item.click();
          return { clicked: sym, text: item.innerText.replace(/\\s+/g, ' ') };
        }
        return { error: 'Not found ' + sym };
      })()`,
      returnByValue: true
    });
    console.log('Click Result:', clickRes?.result?.value);
    await delay(2000);

    // Read chart data
    const chartRes = await cdpCall(tvWs, 'Runtime.evaluate', {
      expression: `(() => {
        const w = window._exposed_chartWidgetCollection?.activeChartWidget?.value();
        const model = w?.model();
        const ms = model?.mainSeries();
        const sources = model?.dataSources() || [];
        const mainBar = ms?.data()?.last();
        const demaSource = sources.find(s => {
          const desc = s.title ? s.title() : (s.metaInfo ? s.metaInfo().description : '');
          return desc.includes('DEMA');
        });
        const utBotSource = sources.find(s => {
          const desc = s.title ? s.title() : (s.metaInfo ? s.metaInfo().description : '');
          return desc.includes('UT Bot');
        });
        return {
          symbol: ms?.symbol(),
          interval: ms?.interval(),
          candle: mainBar ? {
            close: mainBar.value[4],
            high: mainBar.value[2],
            low: mainBar.value[3]
          } : null,
          dema: demaSource?.data()?.last()?.value[1] || null,
          utBot: utBotSource?.data()?.last()?.value || null
        };
      })()`,
      returnByValue: true
    });

    const data = chartRes?.result?.value;
    console.log(`Chart Data for ${sym}:`, data);
    results.push(data);

    // Snapshot
    const snap = await cdpCall(tvWs, 'Page.captureScreenshot', { format: 'png' });
    if (snap?.data) {
      fs.writeFileSync(`C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a/tv_switch_${sym}.png`, Buffer.from(snap.data, 'base64'));
    }
  }

  tvWs.close();
}

testWatchlistSwitch().catch(console.error);
