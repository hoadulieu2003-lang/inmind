const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/D8732812EFF8977614EA114107B74D4C');

ws.onopen = () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        const els = Array.from(document.querySelectorAll('*'));
        const matches = els.filter(e => e.innerText && e.innerText.includes('XAU/USD'));
        return matches.map(e => ({
          tag: e.tagName,
          text: e.innerText.slice(0, 30),
          cls: e.className?.toString().slice(0, 30)
        }));
      })()`,
      returnByValue: true
    }
  }));
};

ws.onmessage = (e) => {
  console.log(JSON.stringify(JSON.parse(e.data), null, 2));
  process.exit(0);
};
