const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/D8732812EFF8977614EA114107B74D4C');

ws.onopen = () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        // Find left sidebar icons
        const sidebarButtons = Array.from(document.querySelectorAll('button, div[role="button"]')).filter(b => {
          const rect = b.getBoundingClientRect();
          return rect.left < 50 && rect.top > 60 && rect.top < 400;
        });
        
        if (sidebarButtons.length > 0) {
          sidebarButtons[0].click();
          return { clicked: true, count: sidebarButtons.length };
        }
        return { clicked: false };
      })()`,
      returnByValue: true
    }
  }));
};

ws.onmessage = (e) => {
  console.log(JSON.parse(e.data).result.result.value);
  process.exit(0);
};
