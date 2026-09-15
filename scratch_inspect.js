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
          // 1. Read balance & equity elements
          const allText = document.body.innerText;
          const rows = Array.from(document.querySelectorAll('[role="row"], tr, div[class*="Row"]'));
          const openRows = rows.filter(r => {
            const t = r.innerText || '';
            return (t.includes('Buy') || t.includes('Sell') || t.includes('Mua') || t.includes('Bán')) &&
                   !t.includes('Close time') && !t.includes('Thời gian đóng') && !t.includes('Đã đóng');
          }).map(r => (r.innerText || '').replace(/\s+/g, ' ').trim());

          // Check tab buttons
          const buttons = Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim());

          return {
            openRowsCount: openRows.length,
            openRows,
            buttons: buttons.filter(b => b.includes('Open') || b.includes('Closed') || b.includes('Mở') || b.includes('Đã đóng'))
          };
        })()`,
        returnByValue: true
      }
    }));
  });
  ws.on('message', d => {
    const res = JSON.parse(d);
    console.log('Result:', JSON.stringify(res.result?.value, null, 2));
    ws.close();
    process.exit(0);
  });
}
run();
