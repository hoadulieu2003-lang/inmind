const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/D8732812EFF8977614EA114107B74D4C');

ws.onopen = () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        const row = document.querySelector('.watchlist-table-row_row__3a44e:nth-child(2)') || 
                    Array.from(document.querySelectorAll('.watchlist-table-row_row__3a44e')).find(r => r.innerText.includes('XAU/USD'));
        if (row) {
          row.click();
          row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
          return 'Clicked XAU/USD row';
        }
        return 'Row not found';
      })()`,
      returnByValue: true
    }
  }));
};

ws.onmessage = (e) => {
  console.log(JSON.parse(e.data).result.result.value);
  process.exit(0);
};
