async function testNativeSetSymbol() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/FBB66DD7C646B5BFAE8DE40058ACCCC6');
  await new Promise(r => ws.onopen = r);

  console.log('Testing Native API setSymbol to BITSTAMP:BTCUSD...');
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        const w = window._exposed_chartWidgetCollection.activeChartWidget.value();
        w.setSymbol('BITSTAMP:BTCUSD');
        return { called: true, current: w.symbol() };
      })()`,
      returnByValue: true
    }
  }));

  ws.onmessage = async (e) => {
    const d = JSON.parse(e.data);
    if (d.id === 1) {
      console.log('setSymbol result:', d.result?.result?.value);
      // Wait 1.5s and check legend
      setTimeout(() => {
        ws.send(JSON.stringify({
          id: 2,
          method: 'Runtime.evaluate',
          params: {
            expression: `(() => {
              const w = window._exposed_chartWidgetCollection.activeChartWidget.value();
              const legendEls = Array.from(document.querySelectorAll('[data-name="legend-source-item"], [data-name="legend-series-item"], div[class*="item-"]')).map(el => el.innerText?.trim().replace(/\\s+/g, ' ')).filter(Boolean);
              const ohlcText = legendEls.find(l => l.includes('O ') && l.includes('H ') && l.includes('L ') && l.includes('C '));
              const demaText = legendEls.find(l => l.includes('DEMA 200') || l.includes('DEMA'));
              return {
                symbol: w.symbol(),
                ohlcText,
                demaText
              };
            })()`,
            returnByValue: true
          }
        }));
      }, 1500);
    } else if (d.id === 2) {
      console.log('Verification after native switch:', JSON.stringify(d.result?.result?.value, null, 2));
      ws.close();
      process.exit(0);
    }
  };
}

testNativeSetSymbol().catch(console.error);
