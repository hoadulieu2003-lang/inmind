const WebSocket = require('ws');
async function run() {
  const tabs = await fetch('http://127.0.0.1:9222/json').then(r => r.json());
  const exTab = tabs.find(t => t.url.includes('exness.com/webtrading'));
  if (!exTab) { console.log('Exness tab not found'); return; }
  const ws = new WebSocket(exTab.webSocketDebuggerUrl);
  ws.on('open', () => {
    ws.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: {
        expression: `(() => {
          try {
            const rows = Array.from(document.querySelectorAll('div, tr, span')).filter(el => {
              const t = el.innerText || '';
              return t.includes('USD') && (t.includes('Equity') || t.includes('Balance') || t.includes('Vốn') || t.includes('Số dư'));
            }).slice(0, 5).map(e => e.innerText.trim());

            return {
              title: document.title,
              url: window.location.href,
              sampleText: document.body.innerText.substring(0, 500)
            };
          } catch(e) {
            return { err: e.message };
          }
        })()`,
        returnByValue: true
      }
    }));
  });
  ws.on('message', d => {
    const res = JSON.parse(d);
    console.log('Result:', res.result?.value?.sampleText);
    ws.close();
    process.exit(0);
  });
}
run();
