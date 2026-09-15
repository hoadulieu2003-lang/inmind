const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/D8732812EFF8977614EA114107B74D4C');

ws.onopen = () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        // 1. Click '+' button to open search instrument
        const plusBtn = Array.from(document.querySelectorAll('button, div')).find(b => {
          return b.innerText === '+' || b.getAttribute('aria-label')?.includes('thêm') || b.querySelector('svg[name="plus"]');
        });
        if (plusBtn) {
          plusBtn.click();
          return 'Clicked plus button';
        }
        return 'Plus button not found';
      })()`,
      returnByValue: true
    }
  }));
};

ws.onmessage = (e) => {
  console.log(JSON.parse(e.data).result.result.value);
  process.exit(0);
};
