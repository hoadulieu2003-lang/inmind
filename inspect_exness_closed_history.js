const WebSocket = require('ws');

async function inspectClosedHistory() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/26DAE05D133F813C47A9523CED23103D');
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });

  function cdpCall(method, params) {
    return new Promise((resolve) => {
      const id = Math.floor(Math.random() * 1000000);
      const handler = (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.id === id) {
          ws.off('message', handler);
          resolve(msg.result);
        }
      };
      ws.on('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  // Click Closed tab
  await cdpCall('Runtime.evaluate', {
    expression: `(() => {
      const closedTab = Array.from(document.querySelectorAll('button, div[role="tab"]')).find(b => {
        const t = b.innerText.trim().toLowerCase();
        return t === 'closed' || t === 'đã đóng';
      });
      if (closedTab) closedTab.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 1200));

  // Inspect filters and scroll container
  const details = await cdpCall('Runtime.evaluate', {
    expression: `(() => {
      // Find buttons / dropdowns near the table
      const buttons = Array.from(document.querySelectorAll('button, select, div[class*="select"], div[class*="dropdown"]'))
        .map(b => (b.innerText || '').trim())
        .filter(t => t.length > 0 && t.length < 30);

      // Extract all rows with full text
      const rows = Array.from(document.querySelectorAll('[role="row"], tr, div[class*="Row"]'))
        .map(r => (r.innerText || '').replace(/\\s+/g, ' ').trim())
        .filter(t => t.length > 5);

      return { buttons: buttons.slice(0, 20), rows };
    })()`,
    returnByValue: true
  });

  console.log('=== CLOSED TAB CONTROLS & ROWS ===');
  console.log('Buttons/Dropdowns:', details.result.value.buttons);
  console.log('Total Rows:', details.result.value.rows.length);
  details.result.value.rows.forEach((r, idx) => console.log(`[${idx}] ${r}`));

  // Switch back to Open tab
  await cdpCall('Runtime.evaluate', {
    expression: `(() => {
      const openTab = Array.from(document.querySelectorAll('button, div[role="tab"]')).find(b => {
        const t = b.innerText.trim().toLowerCase();
        return t.startsWith('open') || t.startsWith('mở');
      });
      if (openTab) openTab.click();
    })()`
  });

  ws.close();
}

inspectClosedHistory().catch(console.error);
