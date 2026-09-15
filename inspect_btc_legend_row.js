async function main() {
  const tabs = await (await fetch('http://127.0.0.1:9222/json')).json();
  const tvBtc = tabs.find(t => t.title.includes('BTC') || t.url.includes('BTC'));
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/' + tvBtc.id);

  await new Promise(res => {
    ws.onopen = () => {
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: {
          expression: `(() => {
            const utEl = Array.from(document.querySelectorAll('*')).find(el => el.children.length === 0 && el.innerText && el.innerText.trim() === 'UT Bot Alerts');
            const parentRow = utEl ? (utEl.closest('[class*="item-"]') || utEl.parentElement?.parentElement) : null;
            return {
              text: parentRow ? parentRow.innerText : null,
              html: parentRow ? parentRow.innerHTML : null
            };
          })()`,
          returnByValue: true
        }
      }));
    };

    ws.onmessage = (e) => {
      const d = JSON.parse(e.data);
      console.log('BTC Legend Row:', JSON.stringify(d.result?.result?.value, null, 2));
      ws.close();
      res();
    };
  });
}

main().catch(console.error);
