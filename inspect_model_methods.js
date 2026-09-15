async function inspectModelMethods() {
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
        
        let proto = Object.getPrototypeOf(model);
        let methods = [];
        while (proto && proto !== Object.prototype) {
          methods.push(...Object.getOwnPropertyNames(proto));
          proto = Object.getPrototypeOf(proto);
        }

        return {
          studyMethods: methods.filter(m => m.toLowerCase().includes('study') || m.toLowerCase().includes('source') || m.toLowerCase().includes('indicator'))
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

inspectModelMethods().catch(console.error);
