const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/D8732812EFF8977614EA114107B74D4C');

ws.onopen = () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        const matches = [];
        for (const el of document.querySelectorAll('*')) {
          if (el.textContent && el.textContent.includes('XAU') && el.children.length === 0) {
            const r = el.getBoundingClientRect();
            matches.push({
              tag: el.tagName,
              text: el.textContent.trim(),
              rect: { x: r.x, y: r.y, w: r.width, h: r.height }
            });
          }
        }
        return matches;
      })()`,
      returnByValue: true
    }
  }));
};

ws.onmessage = (e) => {
  const res = JSON.parse(e.data);
  console.log(JSON.stringify(res.result.result.value, null, 2));
  process.exit(0);
};
