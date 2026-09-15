async function testSetSymbolDirect() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/FBB66DD7C646B5BFAE8DE40058ACCCC6');
  await new Promise(r => ws.onopen = r);

  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        const c = window._exposed_chartWidgetCollection;
        const w = c.activeChartWidget.value();
        const model = w.model();
        const mainSeries = model.mainSeries();
        
        // Call model.setSymbol
        model.setSymbol(mainSeries, 'BTCUSD');

        return {
          mainSeriesSymbol: mainSeries.symbol(),
          actualSymbol: mainSeries.actualSymbol()
        };
      })()`,
      returnByValue: true
    }
  }));

  ws.onmessage = async (e) => {
    const d = JSON.parse(e.data);
    console.log('Result:', JSON.stringify(d.result?.result?.value, null, 2));
    
    // Wait 3s and inspect legend again
    setTimeout(() => {
      ws.send(JSON.stringify({
        id: 2,
        method: 'Runtime.evaluate',
        params: {
          expression: `(() => {
            const legendEls = Array.from(document.querySelectorAll('[data-name="legend-source-item"], [data-name="legend-series-item"], div[class*="item-"]')).map(el => el.innerText?.trim().replace(/\\s+/g, ' ')).filter(Boolean);
            return legendEls;
          })()`,
          returnByValue: true
        }
      }));
    }, 3000);

    ws.onmessage = (e2) => {
      const d2 = JSON.parse(e2.data);
      console.log('Legend after 3s:', JSON.stringify(d2.result?.result?.value, null, 2));
      ws.close();
    };
  };
}

testSetSymbolDirect().catch(console.error);
