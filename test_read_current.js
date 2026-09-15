async function testRead() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/FBB66DD7C646B5BFAE8DE40058ACCCC6');
  await new Promise(r => ws.onopen = r);

  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        const symbolBtn = document.querySelector('#header-toolbar-symbol-search')?.innerText?.trim();
        const legendEls = Array.from(document.querySelectorAll('[data-name="legend-source-item"], [data-name="legend-series-item"], div[class*="item-"]')).map(el => el.innerText?.trim().replace(/\\s+/g, ' ')).filter(Boolean);

        const ohlcText = legendEls.find(l => l.includes('O ') && l.includes('H ') && l.includes('L ') && l.includes('C '));
        const demaText = legendEls.find(l => l.includes('DEMA 200') || l.includes('DEMA'));
        
        const buyEl = document.querySelector('[data-test-id-value-title="Buy"] [class*="valueValue-"]');
        const sellEl = document.querySelector('[data-test-id-value-title="Sell"] [class*="valueValue-"]');

        return {
          symbolBtn,
          ohlcText,
          demaText,
          buyVal: buyEl ? buyEl.innerText : null,
          sellVal: sellEl ? sellEl.innerText : null
        };
      })()`,
      returnByValue: true
    }
  }));

  ws.onmessage = (e) => {
    console.log('Read result:', JSON.stringify(JSON.parse(e.data).result?.result?.value, null, 2));
    ws.close();
  };
}

testRead().catch(console.error);
