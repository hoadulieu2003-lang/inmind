async function inspectModelSources() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/FBB66DD7C646B5BFAE8DE40058ACCCC6');
  await new Promise(r => ws.onopen = r);

  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        try {
          const c = window._exposed_chartWidgetCollection;
          const w = c.activeChartWidget.value();
          const model = w.model();
          const mainSeries = model.mainSeries();
          
          return {
            symbol: mainSeries.symbol(),
            hasData: !!mainSeries.data(),
            dataLength: mainSeries.data()?.size(),
            title: mainSeries.title()
          };
        } catch (e) {
          return { error: e.message, stack: e.stack };
        }
      })()`,
      returnByValue: true
    }
  }));

  ws.onmessage = (e) => {
    console.log('Result:', JSON.stringify(JSON.parse(e.data).result?.result?.value, null, 2));
    ws.close();
  };
}

inspectModelSources().catch(console.error);
