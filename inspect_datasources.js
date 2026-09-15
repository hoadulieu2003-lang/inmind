async function inspectDataSources() {
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
        
        const sources = model.dataSources().map(s => {
          const desc = s.title ? s.title() : (s.metaInfo ? s.metaInfo().description : 'Unknown');
          let lastVal = null;
          if (s.data && typeof s.data === 'function') {
            const d = s.data();
            if (d && typeof d.last === 'function') {
              lastVal = d.last();
            }
          }
          return {
            desc,
            id: s.id ? s.id() : null,
            lastVal
          };
        });

        return sources;
      })()`,
      returnByValue: true
    }
  }));

  ws.onmessage = (e) => {
    console.log('Data Sources:', JSON.stringify(JSON.parse(e.data).result?.result?.value, null, 2));
    ws.close();
  };
}

inspectDataSources().catch(console.error);
