async function main() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/FBB66DD7C646B5BFAE8DE40058ACCCC6');

  await new Promise(res => {
    ws.onopen = () => {
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: {
          expression: `(() => {
            const dialog = document.querySelector('div[data-name="indicator-properties-dialog"]') || document.querySelector('div[role="dialog"]');
            if (!dialog) return { error: 'Dialog not found' };

            const buttons = Array.from(dialog.querySelectorAll('button')).map(b => ({
              text: b.innerText?.trim(),
              name: b.getAttribute('data-name'),
              rect: b.getBoundingClientRect()
            }));

            // Find OK button
            const okBtn = Array.from(dialog.querySelectorAll('button')).find(b => {
              const t = b.innerText?.trim().toLowerCase();
              return t === 'ok' || b.getAttribute('data-name') === 'submit-button';
            });

            if (okBtn) {
              okBtn.click();
              return { clicked: true, okText: okBtn.innerText, buttons };
            }

            return { clicked: false, buttons };
          })()`,
          returnByValue: true
        }
      }));
    };

    ws.onmessage = (e) => {
      const r = JSON.parse(e.data);
      console.log('Result:', JSON.stringify(r.result?.result?.value, null, 2));
      ws.close();
      res();
    };
  });
}

main().catch(console.error);
