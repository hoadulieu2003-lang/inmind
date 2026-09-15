const WebSocket = require('ws');
async function run() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/26DAE05D133F813C47A9523CED23103D');
  await new Promise(r => ws.on('open', r));
  function cdp(method, params) {
    return new Promise(res => {
      const id = Math.floor(Math.random() * 100000);
      const h = (d) => { const m = JSON.parse(d.toString()); if (m.id === id) { ws.off('message', h); res(m.result); } };
      ws.on('message', h);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  const res = await cdp('Runtime.evaluate', {
    expression: `(() => {
      const elements = Array.from(document.querySelectorAll('button, [role="tab"], div[class*="tab"], div[class*="Tab"]'));
      return elements.map(el => ({
        tag: el.tagName,
        role: el.getAttribute('role'),
        text: el.innerText.trim(),
        className: el.className
      })).filter(e => e.text.length > 0 && e.text.length < 50);
    })()`,
    returnByValue: true
  });
  console.log(JSON.stringify(res.result.value, null, 2));
  ws.close();
}
run();
