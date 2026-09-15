async function testSetSymbol() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/FBB66DD7C646B5BFAE8DE40058ACCCC6');
  await new Promise(r => ws.onopen = r);

  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        const c = window._exposed_chartWidgetCollection;
        const w = c.activeChartWidget ? c.activeChartWidget.value() : null;
        
        // Find setSymbol in c or w or activeChartWidget
        let results = {};
        for (const k of Object.keys(c)) {
          if (k.toLowerCase().includes('symbol') || typeof c[k] === 'function') {
            results['c.' + k] = typeof c[k];
          }
        }

        if (w) {
          for (const k of Object.keys(w)) {
            if (k.toLowerCase().includes('symbol') || typeof w[k] === 'function') {
              results['w.' + k] = typeof w[k];
            }
          }
        }

        return {
          results,
          wExists: !!w
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

testSetSymbol().catch(console.error);
