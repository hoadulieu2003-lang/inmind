const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/B319A6A7C133DE20350E64CC9175762A');

ws.onopen = () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        const dialog = document.querySelector('div[data-name="indicator-properties-dialog"]') || 
                       document.querySelector('div[role="dialog"]');
        if (!dialog) return 'No dialog';
        const okBtn = Array.from(dialog.querySelectorAll('button')).find(b => b.innerText.trim().toLowerCase() === 'ok');
        if (okBtn) {
          okBtn.click();
          return 'Closed UT Bot dialog with OK';
        }
        return 'OK button not found';
      })()`,
      returnByValue: true
    }
  }));
};

ws.onmessage = (e) => {
  console.log(JSON.parse(e.data).result?.result?.value);
  process.exit(0);
};
