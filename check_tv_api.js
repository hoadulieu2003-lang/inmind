async function testLocation() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/FBB66DD7C646B5BFAE8DE40058ACCCC6');
  await new Promise(r => ws.onopen = r);

  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        // In TradingView, how does the chart change symbol programmatically?
        // Check window.TradingViewApi or window.tvWidget
        const keys = Object.keys(window).filter(k => k.toLowerCase().includes('trading') || k.toLowerCase().includes('chart'));
        return {
          keys,
          hasTradingView: !!window.TradingView,
          hasWidget: !!window.tvWidget
        };
      })()`,
      returnByValue: true
    }
  }));

  ws.onmessage = (e) => {
    console.log('Window keys:', JSON.stringify(JSON.parse(e.data).result?.result?.value, null, 2));
    ws.close();
  };
}

testLocation().catch(console.error);
