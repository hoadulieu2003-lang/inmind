async function main() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/FBB66DD7C646B5BFAE8DE40058ACCCC6');

  await new Promise((resolve) => {
    ws.onopen = () => {
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: {
          expression: `(() => {
            const legendItems = Array.from(document.querySelectorAll('[data-name="legend-source-item"], [data-name="legend-series-item"], div[class*="item-"]')).map(el => el.innerText?.trim().replace(/\\s+/g, ' '));
            const allStudies = Array.from(document.querySelectorAll('[data-qa-id*="legend"], [class*="study-"]')).map(el => el.innerText?.trim().replace(/\\s+/g, ' '));
            return { legendItems, allStudies };
          })()`,
          returnByValue: true
        }
      }));
    };

    ws.onmessage = (e) => {
      const d = JSON.parse(e.data);
      console.log('Legend check:', JSON.stringify(d.result?.result?.value, null, 2));
      ws.close();
      resolve();
    };
  });
}

main().catch(console.error);
