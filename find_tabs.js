const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/D8732812EFF8977614EA114107B74D4C');

ws.onopen = () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        // Find elements with text 'BTC' or 'EUR/USD' or 'ETH'
        const tabs = Array.from(document.querySelectorAll('*')).filter(el => {
          return (el.innerText === 'BTC' || el.innerText === 'EUR/USD' || el.innerText === 'ETH') && el.children.length === 0;
        }).map(el => {
          const parent = el.closest('button') || el.closest('div[role="tab"]') || el.parentElement;
          return {
            text: el.innerText,
            tag: parent.tagName,
            cls: parent.className,
            parentHTML: parent.outerHTML.slice(0, 200)
          };
        });
        return tabs;
      })()`,
      returnByValue: true
    }
  }));
};

ws.onmessage = (e) => {
  const res = JSON.parse(e.data);
  console.log('Tabs:', JSON.stringify(res.result?.result?.value, null, 2));
  process.exit(0);
};
