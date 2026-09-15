const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/D8732812EFF8977614EA114107B74D4C');

ws.onopen = () => {
  // 1. Get coordinates of XAU/USD
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        const els = Array.from(document.querySelectorAll('*'));
        const el = els.find(e => e.children.length === 0 && e.innerText.trim() === 'XAU/USD');
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
      })()`,
      returnByValue: true
    }
  }));
};

ws.onmessage = (e) => {
  const data = JSON.parse(e.data);
  if (data.id === 1) {
    const coords = data.result?.result?.value;
    console.log('Coordinates:', coords);
    if (!coords) {
      console.log('Coords not found');
      process.exit(1);
    }
    // Dispatch native click via CDP
    ws.send(JSON.stringify({
      id: 2,
      method: 'Input.dispatchMouseEvent',
      params: { type: 'mousePressed', x: coords.x, y: coords.y, button: 'left', clickCount: 1 }
    }));
    setTimeout(() => {
      ws.send(JSON.stringify({
        id: 3,
        method: 'Input.dispatchMouseEvent',
        params: { type: 'mouseReleased', x: coords.x, y: coords.y, button: 'left', clickCount: 1 }
      }));
    }, 50);
  } else if (data.id === 3) {
    console.log('Native click dispatched successfully!');
    setTimeout(() => process.exit(0), 500);
  }
};
