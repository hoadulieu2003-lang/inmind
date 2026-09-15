const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/D8732812EFF8977614EA114107B74D4C');

ws.onopen = () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        const orderPanel = document.querySelector('div[class*="OrderPanel"]') || document.body;
        // find text containing 'Cắt lỗ' or 'Chốt lời'
        const slTpElements = Array.from(document.querySelectorAll('*')).filter(el => {
          return el.children.length === 0 && (el.innerText === 'Cắt lỗ' || el.innerText === 'Chốt lời');
        }).map(el => {
          const parent = el.closest('div[class*="Box"]') || el.parentElement?.parentElement;
          return {
            label: el.innerText,
            parentHTML: parent ? parent.outerHTML.slice(0, 500) : null
          };
        });
        return slTpElements;
      })()`,
      returnByValue: true
    }
  }));
};

ws.onmessage = (e) => {
  const res = JSON.parse(e.data);
  console.log(JSON.stringify(res.result.result.value, null, 2));
  process.exit(0);
};
