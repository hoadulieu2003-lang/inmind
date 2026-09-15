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
        const buttons = Array.from(dialog.querySelectorAll('button')).map(b => b.innerText.trim());
        return buttons;
      })()`,
      returnByValue: true
    }
  }));
};

ws.onmessage = (e) => {
  console.log(JSON.parse(e.data).result?.result?.value);
  process.exit(0);
};
