const fs = require('fs');

async function cdpCall(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const handler = (e) => {
      const res = JSON.parse(e.data);
      if (res.id === id) {
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

async function readInternalChart(ws) {
  const res = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const c = window._exposed_chartWidgetCollection;
      const w = c.activeChartWidget.value();
      const model = w.model();
      const ms = model.mainSeries();
      const sources = model.dataSources();

      const mainBar = ms.data()?.last();
      const demaSource = sources.find(s => {
        const desc = s.title ? s.title() : (s.metaInfo ? s.metaInfo().description : '');
        return desc.includes('DEMA');
      });
      const utBotSource = sources.find(s => {
        const desc = s.title ? s.title() : (s.metaInfo ? s.metaInfo().description : '');
        return desc.includes('UT Bot');
      });

      const demaLast = demaSource?.data()?.last();
      const utBotLast = utBotSource?.data()?.last();

      return {
        symbol: ms.symbol(),
        interval: ms.interval(),
        candle: mainBar ? {
          time: new Date(mainBar.value[0] * 1000).toISOString(),
          open: mainBar.value[1],
          high: mainBar.value[2],
          low: mainBar.value[3],
          close: mainBar.value[4],
          volume: mainBar.value[5]
        } : null,
        dema: demaLast ? demaLast.value[1] : null,
        utBot: utBotLast ? utBotLast.value : null
      };
    })()`,
    returnByValue: true
  });
  return res?.result?.value;
}

async function setSymbolInternal(ws, symbolStr) {
  await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const c = window._exposed_chartWidgetCollection;
      const w = c.activeChartWidget.value();
      const model = w.model();
      model.setSymbol(model.mainSeries(), '${symbolStr}');
    })()`
  });
  await delay(2000);
}

async function main() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/FBB66DD7C646B5BFAE8DE40058ACCCC6');
  await new Promise(r => ws.onopen = r);

  console.log('--- 1. SCAN GOLD ---');
  await setSymbolInternal(ws, 'TVC:GOLD');
  const gold = await readInternalChart(ws);
  console.log('GOLD:', gold);

  console.log('\n--- 2. SCAN BITCOIN ---');
  await setSymbolInternal(ws, 'BITSTAMP:BTCUSD');
  const btc = await readInternalChart(ws);
  console.log('BTC:', btc);

  console.log('\n--- 3. SCAN OIL ---');
  await setSymbolInternal(ws, 'TVC:UKOIL');
  const oil = await readInternalChart(ws);
  console.log('OIL:', oil);

  ws.close();
}

main().catch(console.error);
