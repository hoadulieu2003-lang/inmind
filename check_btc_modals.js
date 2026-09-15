async function main() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/FBB66DD7C646B5BFAE8DE40058ACCCC6');

  await new Promise(res => {
    ws.onopen = () => {
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: {
          expression: `(() => {
            const modals = Array.from(document.querySelectorAll('[class*="dialog-"], [class*="modal-"], [data-dialog-name], [role="dialog"]')).map(d => ({
              tag: d.tagName,
              class: d.className,
              text: d.innerText?.slice(0, 100),
              name: d.getAttribute('data-dialog-name') || d.getAttribute('data-name')
            }));
            return modals;
          })()`,
          returnByValue: true
        }
      }));
    };

    ws.onmessage = (e) => {
      const r = JSON.parse(e.data);
      console.log('Modals on BTC page:', JSON.stringify(r.result?.result?.value, null, 2));
      ws.close();
      res();
    };
  });
}

main().catch(console.error);
