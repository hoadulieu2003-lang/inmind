const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/D8732812EFF8977614EA114107B74D4C');

ws.onopen = () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        const matches = [];
        for (const el of document.querySelectorAll('*')) {
          if (el.textContent && el.textContent.includes('XAU')) {
            matches.push({
              tag: el.tagName,
              text: el.textContent.slice(0, 30),
              childCount: el.children.length,
              rect: el.getBoundingClientRect()
            });
          }
        }
        return matches.slice(0, 10);
      })()`,
      returnByValue: true
    }
  }));
};

ws.onmessage = (e) => {
  console.log(JSON.stringify(JSON.parse(e.data).result.result.value, null, 2));
  process.exit(0);
};
