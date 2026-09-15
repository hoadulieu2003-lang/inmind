async function checkOpenOrder() {
  const tabs = await (await fetch('http://127.0.0.1:9222/json')).json();
  const exnessTab = tabs.find(t => t.url.includes('exness.com/webtrading'));
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/' + exnessTab.id);
  await new Promise(r => ws.onopen = r);

  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        // Click "Mở" tab if needed
        const openTab = Array.from(document.querySelectorAll('div[role="tab"], button')).find(b => b.innerText && b.innerText.trim() === 'Mở');
        if (openTab) openTab.click();

        const rows = Array.from(document.querySelectorAll('tbody tr, div[role="row"]')).map(r => r.innerText.replace(/\\s+/g, ' '));
        return {
          rows: rows.filter(r => r.includes('XAU/USD') || r.includes('0.33') || r.includes('Mua'))
        };
      })()`,
      returnByValue: true
    }
  }));

  ws.onmessage = (e) => {
    console.log('Open Positions:', JSON.stringify(JSON.parse(e.data).result?.result?.value, null, 2));
    ws.close();
  };
}

checkOpenOrder().catch(console.error);
