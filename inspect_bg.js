const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/BA4F0F8FD869CD9C878A2A5A2504F5AA');

ws.onopen = () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        const els = Array.from(document.querySelectorAll('*'));
        const bgs = els.map(e => {
          const s = window.getComputedStyle(e);
          return { tag: e.tagName, id: e.id, cls: e.className?.toString().slice(0, 30), bg: s.backgroundColor, w: e.offsetWidth, h: e.offsetHeight };
        }).filter(x => x.bg && x.bg !== 'rgba(0, 0, 0, 0)' && x.bg !== 'transparent');
        return bgs;
      })()`,
      returnByValue: true
    }
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.id === 1) {
    console.log(data.result.result.value);
    process.exit(0);
  }
};
