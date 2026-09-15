const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/D8732812EFF8977614EA114107B74D4C');

ws.onopen = () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        // Find XAU/USD in the open watchlist
        const items = Array.from(document.querySelectorAll('*')).filter(el => {
          return el.children.length === 0 && (el.innerText === 'XAU/USD' || el.innerText === 'XAUUSD');
        });
        
        if (items.length > 0) {
          items[0].click();
          return { selected: true, text: items[0].innerText };
        }

        // List top items in watchlist
        const rows = Array.from(document.querySelectorAll('div[role="row"], tr, div[class*="Item"], div[class*="Row"]'))
          .map(r => r.innerText?.replace(/\\s+/g, ' ').slice(0, 30))
          .filter(Boolean);

        return { selected: false, rows: rows.slice(0, 10) };
      })()`,
      returnByValue: true
    }
  }));
};

ws.onmessage = (e) => {
  console.log(JSON.parse(e.data).result.result.value);
  process.exit(0);
};
