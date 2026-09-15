async function inspectLeftSidebar() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/D8732812EFF8977614EA114107B74D4C');
  await new Promise(r => ws.onopen = r);

  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        const all = Array.from(document.querySelectorAll('*')).map(el => {
          const r = el.getBoundingClientRect();
          return {
            tag: el.tagName,
            id: el.id,
            className: el.className,
            text: el.innerText?.slice(0, 20),
            x: r.x, y: r.y, w: r.width, h: r.height
          };
        }).filter(e => e.w > 0 && e.h > 0 && e.x < 50 && e.y < 300);

        return all.slice(0, 20);
      })()`,
      returnByValue: true
    }
  }));

  ws.onmessage = (e) => {
    console.log('Left Elements:', JSON.stringify(JSON.parse(e.data).result?.result?.value, null, 2));
    ws.close();
  };
}

inspectLeftSidebar().catch(console.error);
