async function inspectApi() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/FBB66DD7C646B5BFAE8DE40058ACCCC6');
  await new Promise(r => ws.onopen = r);

  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        const c = window._exposed_chartWidgetCollection;
        const api = window.TradingViewApi;
        
        let chartMethods = [];
        let activeChart = null;
        if (c && typeof c.activeChartWidget === 'function') {
          activeChart = c.activeChartWidget();
          chartMethods = Object.keys(activeChart || {}).filter(k => typeof activeChart[k] === 'function');
        }

        return {
          cMethods: Object.keys(c || {}),
          apiMethods: Object.keys(api || {}),
          activeChartMethods: chartMethods.slice(0, 30),
          hasSetSymbol: chartMethods.includes('setSymbol') || (activeChart && typeof activeChart.model === 'function'),
          currentSymbol: activeChart ? (activeChart.symbol ? activeChart.symbol() : null) : null
        };
      })()`,
      returnByValue: true
    }
  }));

  ws.onmessage = (e) => {
    console.log('API inspection:', JSON.stringify(JSON.parse(e.data).result?.result?.value, null, 2));
    ws.close();
  };
}

inspectApi().catch(console.error);
