async function inspectExnessSymbols() {
  const tabs = await (await fetch('http://127.0.0.1:9222/json')).json();
  const exnessTab = tabs.find(t => t.url.includes('exness.com/webtrading'));
  if (!exnessTab) return console.log('No Exness tab');

  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/' + exnessTab.id);
  await new Promise(r => ws.onopen = r);

  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        // Find watchlist rows in Exness
        const rows = Array.from(document.querySelectorAll('div[data-testid*="symbol"], div[class*="symbol-row"], tr, div[role="row"]')).map(el => {
          const text = el.innerText?.replace(/\\s+/g, ' ');
          const r = el.getBoundingClientRect();
          return { text, x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
        }).filter(r => r.w > 0 && r.text && (r.text.includes('XAU') || r.text.includes('BTC') || r.text.includes('OIL')));

        // Check top tabs
        const topTabs = Array.from(document.querySelectorAll('div[role="tab"], button[role="tab"], div[class*="tab-"]')).map(el => ({
          text: el.innerText?.replace(/\\s+/g, ' '),
          rect: el.getBoundingClientRect()
        })).filter(t => t.text && (t.text.includes('XAU') || t.text.includes('BTC') || t.text.includes('OIL')));

        // Check current active header symbol
        const currentHeader = document.querySelector('div[class*="SymbolTitle"], span[class*="symbolTitle"], h1, [class*="Header_symbol"]')?.innerText;

        return { currentHeader, topTabs, rows: rows.slice(0, 5) };
      })()`,
      returnByValue: true
    }
  }));

  ws.onmessage = (e) => {
    console.log('Exness Symbols Info:', JSON.stringify(JSON.parse(e.data).result?.result?.value, null, 2));
    ws.close();
  };
}

inspectExnessSymbols().catch(console.error);
