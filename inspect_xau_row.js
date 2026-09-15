const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/D8732812EFF8977614EA114107B74D4C');

ws.onopen = () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        const row = Array.from(document.querySelectorAll('.watchlist-table-row_row__3a44e')).find(r => r.innerText.includes('XAU/USD'));
        if (!row) return 'Row not found';
        const interactive = Array.from(row.querySelectorAll('*')).map(el => ({
          tag: el.tagName,
          text: el.innerText.trim(),
          role: el.getAttribute('role'),
          cls: el.className?.toString().slice(0, 30)
        }));
        return interactive;
      })()`,
      returnByValue: true
    }
  }));
};

ws.onmessage = (e) => {
  console.log(JSON.stringify(JSON.parse(e.data).result.result.value, null, 2));
  process.exit(0);
};
