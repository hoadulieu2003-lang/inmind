const fs = require('fs');

async function main() {
  const tabsRes = await fetch('http://127.0.0.1:9222/json');
  const tabs = await tabsRes.json();
  const tv = tabs.find(t => t.type === 'page' && t.url.includes('tradingview.com'));
  if (!tv) return console.log('No TV tab');

  const ws = new WebSocket(`ws://127.0.0.1:9222/devtools/page/${tv.id}`);
  await new Promise(r => ws.onopen = r);

  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        // Find saved chart layout names if any
        const c = window._exposed_chartWidgetCollection;
        const w = c?.activeChartWidget?.value();
        const model = w?.model();
        
        return {
          currentSymbol: model?.mainSeries()?.symbol(),
          interval: model?.mainSeries()?.interval(),
          dataSources: model?.dataSources()?.map(s => s.title ? s.title() : (s.metaInfo ? s.metaInfo().description : s.name())),
          url: window.location.href
        };
      })()`,
      returnByValue: true
    }
  }));

  ws.onmessage = (e) => {
    console.log(JSON.stringify(JSON.parse(e.data).result?.result?.value, null, 2));
    ws.close();
  };
}

main().catch(console.error);
