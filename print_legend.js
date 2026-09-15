async function printAllLegend() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/FBB66DD7C646B5BFAE8DE40058ACCCC6');
  await new Promise(r => ws.onopen = r);

  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        const legendEls = Array.from(document.querySelectorAll('[data-name="legend-source-item"], [data-name="legend-series-item"], div[class*="item-"]')).map(el => el.innerText?.trim().replace(/\\s+/g, ' ')).filter(Boolean);
        return legendEls;
      })()`,
      returnByValue: true
    }
  }));

  ws.onmessage = (e) => {
    console.log('ALL LEGEND ELEMENTS:', JSON.stringify(JSON.parse(e.data).result?.result?.value, null, 2));
    ws.close();
  };
}

printAllLegend().catch(console.error);
