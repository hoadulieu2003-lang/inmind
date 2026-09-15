const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/D8732812EFF8977614EA114107B74D4C');

ws.onopen = () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        // Find search input in opened dialog
        const modal = document.querySelector('div[role="dialog"]') || document.body;
        const inputs = Array.from(modal.querySelectorAll('input'));
        const searchInput = inputs.find(i => i.placeholder && (i.placeholder.includes('Tìm kiếm') || i.placeholder.includes('Search'))) || inputs[0];
        
        if (searchInput) {
          // Set value
          searchInput.value = 'XAUUSD';
          searchInput.dispatchEvent(new Event('input', { bubbles: true }));
          return { foundInput: true, placeholder: searchInput.placeholder };
        }
        return { foundInput: false, inputsCount: inputs.length };
      })()`,
      returnByValue: true
    }
  }));
};

ws.onmessage = (e) => {
  console.log(JSON.parse(e.data).result?.result?.value);
  process.exit(0);
};
