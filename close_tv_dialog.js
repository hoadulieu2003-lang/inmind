const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/B319A6A7C133DE20350E64CC9175762A');

ws.onopen = () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        const closeBtn = document.querySelector('button[data-name="close"]') || 
                         Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Đóng') || b.getAttribute('aria-label') === 'Đóng');
        if (closeBtn) {
          closeBtn.click();
          return 'Dialog closed';
        }
        return 'Close button not found';
      })()`,
      returnByValue: true
    }
  }));
};

ws.onmessage = (e) => {
  console.log(JSON.parse(e.data).result.result.value);
  process.exit(0);
};
