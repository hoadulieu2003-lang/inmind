async function inspectSetSymbol() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/FBB66DD7C646B5BFAE8DE40058ACCCC6');
  await new Promise(r => ws.onopen = r);

  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        const w = window._exposed_chartWidgetCollection.activeChartWidget.value();
        return {
          fnStr: w.setSymbol.toString().slice(0, 500),
          symbolValue: w.symbol().value()
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

inspectSetSymbol().catch(console.error);
