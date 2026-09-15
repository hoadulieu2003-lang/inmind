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
            const dialog = document.querySelector('div[data-name="indicator-properties-dialog"]') || document.querySelector('div[role="dialog"]');
            if (!dialog) return { error: 'No dialog open' };

            const form = dialog.querySelector('form');
            const submitBtn = dialog.querySelector('button[data-name="submit-button"], button[type="submit"]');

            if (submitBtn) {
              submitBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
              return { formFound: !!form, clickedSubmitBtn: true };
            }

            if (form) {
              form.requestSubmit();
              return { formFound: true, requestedSubmit: true };
            }

            return { error: 'Neither submitBtn nor form found' };
          })()`,
          returnByValue: true
        }
      }));
    };

    ws.onmessage = (e) => {
      const d = JSON.parse(e.data);
      console.log('Submit result:', JSON.stringify(d.result?.result?.value, null, 2));
      ws.close();
      res();
    };
  });
}

main().catch(console.error);
