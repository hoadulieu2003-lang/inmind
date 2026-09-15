const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/D8732812EFF8977614EA114107B74D4C');

ws.onopen = () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        const input = document.querySelector('input[type="text"]') || document.querySelector('input');
        return {
          val: input ? input.value : null,
          placeholder: input ? input.placeholder : null
        };
      })()`,
      returnByValue: true
    }
  }));
};

ws.onmessage = (e) => {
  const res = JSON.parse(e.data);
  console.log(res.result.result.value);
  process.exit(0);
};
