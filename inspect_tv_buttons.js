const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/B319A6A7C133DE20350E64CC9175762A');

ws.onopen = () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        const buttons = Array.from(document.querySelectorAll('button, div[role="button"]')).map(b => ({
          text: b.innerText?.trim().replace(/\\s+/g, ' '),
          id: b.id,
          dataName: b.getAttribute('data-name'),
          ariaLabel: b.getAttribute('aria-label'),
          title: b.getAttribute('title')
        }));
        return buttons.filter(b => b.text || b.dataName || b.ariaLabel || b.title).slice(0, 40);
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
