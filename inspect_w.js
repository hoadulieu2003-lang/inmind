async function inspectW() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/FBB66DD7C646B5BFAE8DE40058ACCCC6');
  await new Promise(r => ws.onopen = r);

  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        const c = window._exposed_chartWidgetCollection;
        const w = c.activeChartWidget.value();
        
        // inspect prototype methods of w
        let proto = Object.getPrototypeOf(w);
        let protoMethods = [];
        while (proto && proto !== Object.prototype) {
          protoMethods.push(...Object.getOwnPropertyNames(proto));
          proto = Object.getPrototypeOf(proto);
        }

        // Test w.setSymbol
        return {
          symbolVal: w._symbolWV ? w._symbolWV.value() : null,
          hasSetSymbol: typeof w.setSymbol === 'function',
          protoMethods: protoMethods.filter(m => m.toLowerCase().includes('symbol') || m.toLowerCase().includes('set'))
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

inspectW().catch(console.error);
