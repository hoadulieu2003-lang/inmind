const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/D8732812EFF8977614EA114107B74D4C');

ws.onopen = () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        const buttons = Array.from(document.querySelectorAll('button')).map(b => {
          const r = b.getBoundingClientRect();
          return {
            text: b.innerText.trim().replace(/\\s+/g, ' '),
            cls: b.className?.slice(0, 40),
            x: r.x, y: r.y, w: r.width, h: r.height
          };
        }).filter(b => b.text && b.x > 1000);
        return buttons;
      })()`,
      returnByValue: true
    }
  }));
};

ws.onmessage = (e) => {
  const data = JSON.parse(e.data);
  console.log('Order panel buttons:', JSON.stringify(data.result?.result?.value, null, 2));
  process.exit(0);
};
