const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/D8732812EFF8977614EA114107B74D4C');

ws.onopen = () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        const container = document.querySelector('[data-test="instrument-tabs-container"]');
        if (!container) return 'No container';
        const addBtn = container.querySelector('button');
        if (addBtn) {
          addBtn.click();
          return 'Clicked instrument add button!';
        }
        return 'No button in container';
      })()`,
      returnByValue: true
    }
  }));
};

ws.onmessage = (e) => {
  console.log(JSON.parse(e.data).result?.result?.value);
  process.exit(0);
};
