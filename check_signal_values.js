async function checkValues() {
  const tabs = await (await fetch('http://127.0.0.1:9222/json')).json();
  const tvTab = tabs.find(t => t.url.includes('tradingview.com/chart'));
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/' + tvTab.id);
  await new Promise(r => ws.onopen = r);

  const res = await new Promise(resolve => {
    ws.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: {
        expression: `(() => {
          const buyEl = document.querySelector('[data-test-id-value-title="Buy"] [class*="valueValue-"]');
          const sellEl = document.querySelector('[data-test-id-value-title="Sell"] [class*="valueValue-"]');
          const allValueItems = Array.from(document.querySelectorAll('[class*="valueItem-"]')).map(el => ({
            title: el.getAttribute('data-test-id-value-title'),
            text: el.innerText?.trim()
          }));
          return {
            buyVal: buyEl ? buyEl.innerText : null,
            sellVal: sellEl ? sellEl.innerText : null,
            allValueItems
          };
        })()`,
        returnByValue: true
      }
    }));
    ws.onmessage = (e) => {
      resolve(JSON.parse(e.data).result?.result?.value);
      ws.close();
    };
  });

  console.log('UT Bot Signal Values:', JSON.stringify(res, null, 2));
}

checkValues().catch(console.error);
