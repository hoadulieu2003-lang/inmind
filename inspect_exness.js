const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/BA4F0F8FD869CD9C878A2A5A2504F5AA');

ws.onopen = () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        return {
          docW: document.documentElement.clientWidth,
          docH: document.documentElement.clientHeight,
          scrollW: document.documentElement.scrollWidth,
          scrollH: document.documentElement.scrollHeight,
          bodyW: document.body.clientWidth,
          bodyH: document.body.clientHeight,
          computedZoom: window.getComputedStyle(document.body).zoom,
          viewportMeta: document.querySelector('meta[name="viewport"]')?.content,
          rootStyles: {
            html: document.documentElement.getAttribute('style'),
            body: document.body.getAttribute('style')
          },
          children: Array.from(document.body.children).map(c => ({
            tag: c.tagName,
            id: c.id,
            className: c.className,
            w: c.offsetWidth,
            h: c.offsetHeight,
            computedStyleWidth: window.getComputedStyle(c).width,
            computedStyleHeight: window.getComputedStyle(c).height
          }))
        };
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
