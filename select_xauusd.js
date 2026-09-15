const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/D8732812EFF8977614EA114107B74D4C');

ws.onopen = () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        // Find search input in instrument modal
        const searchInput = Array.from(document.querySelectorAll('input')).find(i => {
          return i.placeholder && (i.placeholder.includes('Tìm kiếm') || i.placeholder.includes('Search'));
        }) || document.querySelector('input[type="search"]');

        if (searchInput) {
          searchInput.value = 'XAUUSD';
          searchInput.dispatchEvent(new Event('input', { bubbles: true }));
          return 'Typed XAUUSD in search';
        }

        // Or find XAU/USD directly in the list
        const xauItem = Array.from(document.querySelectorAll('*')).find(el => {
          return el.children.length === 0 && (el.innerText === 'XAU/USD' || el.innerText === 'XAUUSD');
        });
        if (xauItem) {
          xauItem.click();
          return 'Clicked XAU/USD directly';
        }

        return 'Neither input nor item found';
      })()`,
      returnByValue: true
    }
  }));
};

ws.onmessage = (e) => {
  console.log(JSON.parse(e.data).result.result.value);
  process.exit(0);
};
