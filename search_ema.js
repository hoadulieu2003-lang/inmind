const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/B319A6A7C133DE20350E64CC9175762A');

ws.onopen = () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        const dialog = document.querySelector('div[role="dialog"]');
        if (!dialog) return 'No dialog';
        const input = dialog.querySelector('input');
        if (input) {
          input.value = 'Đường trung bình trượt hàm mũ';
          input.dispatchEvent(new Event('input', { bubbles: true }));
          return 'Typed search query';
        }
        return 'No input in dialog';
      })()`,
      returnByValue: true
    }
  }));
};

ws.onmessage = (e) => {
  const data = JSON.parse(e.data);
  console.log(data.result.result.value);
  process.exit(0);
};
