const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/D8732812EFF8977614EA114107B74D4C');

ws.onopen = () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        // Find row or cell with text 'XAU/USD'
        const all = Array.from(document.querySelectorAll('*'));
        const target = all.find(el => el.children.length === 0 && el.innerText.trim() === 'XAU/USD');
        if (target) {
          const clickable = target.closest('tr') || target.closest('div[role="row"]') || target.parentElement;
          (clickable || target).click();
          return 'Clicked XAU/USD row successfully!';
        }
        return 'XAU/USD element not found';
      })()`,
      returnByValue: true
    }
  }));
};

ws.onmessage = (e) => {
  console.log(JSON.parse(e.data).result.result.value);
  process.exit(0);
};
