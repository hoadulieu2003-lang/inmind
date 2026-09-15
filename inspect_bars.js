async function inspectDataBars() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/FBB66DD7C646B5BFAE8DE40058ACCCC6');
  await new Promise(r => ws.onopen = r);

  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        try {
          const c = window._exposed_chartWidgetCollection;
          const w = c.activeChartWidget.value();
          const model = w.model();
          const ms = model.mainSeries();
          const data = ms.data();

          // Find bar methods
          const proto = Object.getPrototypeOf(data);
          const methods = Object.getOwnPropertyNames(proto);

          // Get last bar
          let lastBar = null;
          if (typeof data.last === 'function') lastBar = data.last();
          else if (typeof data.bars === 'function') lastBar = data.bars().last();

          // Also check studies data (DEMA & UT Bot)
          const studies = model.allStudies ? model.allStudies().map(s => ({
            meta: s.metaInfo().description,
            hasData: !!s.data(),
            dataSize: s.data()?.size()
          })) : [];

          return {
            methods: methods.slice(0, 20),
            lastBar: lastBar,
            studies
          };
        } catch (e) {
          return { error: e.message, stack: e.stack };
        }
      })()`,
      returnByValue: true
    }
  }));

  ws.onmessage = (e) => {
    console.log('Bars & Studies:', JSON.stringify(JSON.parse(e.data).result?.result?.value, null, 2));
    ws.close();
  };
}

inspectDataBars().catch(console.error);
