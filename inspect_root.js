const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/BA4F0F8FD869CD9C878A2A5A2504F5AA');

ws.onopen = () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        const root = document.getElementById('root');
        function getTree(el, depth=0) {
          if (!el || depth > 4) return null;
          return {
            tag: el.tagName,
            cls: el.className,
            w: el.offsetWidth,
            h: el.offsetHeight,
            style: el.getAttribute('style'),
            computed: {
              display: window.getComputedStyle(el).display,
              width: window.getComputedStyle(el).width,
              maxWidth: window.getComputedStyle(el).maxWidth,
              flex: window.getComputedStyle(el).flex,
              gridTemplateColumns: window.getComputedStyle(el).gridTemplateColumns
            },
            children: Array.from(el.children).map(c => getTree(c, depth+1))
          };
        }
        return getTree(root);
      })()`,
      returnByValue: true
    }
  }));
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.id === 1) {
    console.log(JSON.stringify(data.result.result.value, null, 2));
    process.exit(0);
  }
};
