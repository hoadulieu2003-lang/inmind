const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/B319A6A7C133DE20350E64CC9175762A');

ws.onopen = () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        const btn = document.querySelector('button[data-name="open-indicators-dialog"]');
        if (btn) {
          btn.click();
          return 'Indicator dialog clicked';
        }
        return 'Not found';
      })()`,
      returnByValue: true
    }
  }));
};

ws.onmessage = (e) => {
  const res = JSON.parse(e.data);
  console.log(res.result.result.value);
  setTimeout(() => {
    // Check if dialog opened
    ws.send(JSON.stringify({
      id: 2,
      method: 'Runtime.evaluate',
      params: {
        expression: `(() => {
          const dialog = document.querySelector('[data-name="indicators-dialog"]') || document.querySelector('div[role="dialog"]');
          const searchInput = document.querySelector('input[data-role="search"]') || document.querySelector('input[type="text"]');
          return {
            hasDialog: !!dialog,
            searchInput: searchInput ? searchInput.placeholder : null
          };
        })()`,
        returnByValue: true
      }
    }));
  }, 1000);
  if (JSON.parse(e.data).id === 2) {
    console.log('Dialog status:', JSON.parse(e.data).result.result.value);
    process.exit(0);
  }
};
