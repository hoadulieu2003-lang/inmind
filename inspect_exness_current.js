async function inspectExness() {
  const tabs = await (await fetch('http://127.0.0.1:9222/json')).json();
  const exnessTab = tabs.find(t => t.url.includes('exness.com/webtrading'));
  if (!exnessTab) return console.error('No Exness tab');

  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/' + exnessTab.id);
  await new Promise(r => ws.onopen = r);

  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        // Find open position rows
        const rows = Array.from(document.querySelectorAll('tbody tr, div[role="row"]')).map(r => r.innerText.replace(/\\s+/g, ' '));
        
        // Find watchlist items
        const watchlistElements = Array.from(document.querySelectorAll('*')).filter(el => {
          return el.children.length === 0 && ['BTC', 'XAU/USD', 'USOIL', 'UKOIL'].includes(el.innerText?.trim());
        }).map(el => ({ text: el.innerText.trim(), rect: el.getBoundingClientRect() }));

        const balanceMatch = document.body.innerText.match(/Số dư[\\s\\n]+([\\d,\\.]+)/i);
        const equityMatch = document.body.innerText.match(/Vốn[\\s\\n]+([\\d,\\.]+)/i);
        const pnlMatch = document.body.innerText.match(/Tổng Lãi\\/Lỗ.*?:\\s*([+-]?[\\d,\\.]+)/i) || document.body.innerText.match(/([+-]?[\\d,\\.]+)\\s*USD/);

        return {
          equity: equityMatch ? equityMatch[0] : 'N/A',
          balance: balanceMatch ? balanceMatch[0] : 'N/A',
          pnlText: pnlMatch ? pnlMatch[0] : 'N/A',
          rows: rows.filter(r => r.length > 5 && (r.includes('XAU') || r.includes('BTC') || r.includes('OIL') || r.includes('Mua') || r.includes('Bán'))),
          watchlistElements
        };
      })()`,
      returnByValue: true
    }
  }));

  ws.onmessage = (e) => {
    console.log('Exness Inspection:', JSON.stringify(JSON.parse(e.data).result?.result?.value, null, 2));
    ws.close();
  };
}

inspectExness().catch(console.error);
