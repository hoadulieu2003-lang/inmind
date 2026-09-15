const WebSocket = require('ws');

async function inspectExness() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/26DAE05D133F813C47A9523CED23103D');
  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  function cdpCall(method, params) {
    return new Promise((resolve, reject) => {
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

  // 1. Inspect current active tab & Open table
  const openInfo = await cdpCall('Runtime.evaluate', {
    expression: `(() => {
      const tabs = Array.from(document.querySelectorAll('button, div[role="tab"]')).map(b => b.innerText.trim()).filter(Boolean);
      const rows = Array.from(document.querySelectorAll('[role="row"], tr, div[class*="Row"]')).map(r => (r.innerText || "").replace(/\\s+/g, " ").trim()).filter(t => t.length > 5);
      return { tabs, rowsCount: rows.length, sampleRows: rows.slice(0, 20) };
    })()`,
    returnByValue: true
  });
  console.log('=== OPEN / CURRENT VIEW ===');
  console.log(JSON.stringify(openInfo.result.value, null, 2));

  // 2. Click Closed tab
  const clickRes = await cdpCall('Runtime.evaluate', {
    expression: `(() => {
      const closedTab = Array.from(document.querySelectorAll('button, div[role="tab"]')).find(b => {
        const t = b.innerText.trim().toLowerCase();
        return t === 'closed' || t === 'đã đóng';
      });
      if (closedTab) { 
        closedTab.click(); 
        return 'CLICKED_CLOSED'; 
      }
      return 'NOT_FOUND';
    })()`,
    returnByValue: true
  });
  console.log('Click Closed Result:', clickRes.result.value);

  await new Promise(r => setTimeout(r, 1500));

  // 3. Inspect Closed table (all rows)
  const closedInfo = await cdpCall('Runtime.evaluate', {
    expression: `(() => {
      const rows = Array.from(document.querySelectorAll('[role="row"], tr, div[class*="Row"]')).map(r => (r.innerText || "").replace(/\\s+/g, " ").trim()).filter(t => t.length > 5);
      return { rowsCount: rows.length, rows: rows };
    })()`,
    returnByValue: true
  });
  console.log('=== CLOSED VIEW (FULL) ===');
  console.log(JSON.stringify(closedInfo.result.value, null, 2));

  // 4. Click back Open tab
  await cdpCall('Runtime.evaluate', {
    expression: `(() => {
      const openTab = Array.from(document.querySelectorAll('button, div[role="tab"]')).find(b => {
        const t = b.innerText.trim().toLowerCase();
        return t.startsWith('open') || t.startsWith('mở');
      });
      if (openTab) openTab.click();
    })()`,
    returnByValue: true
  });

  ws.close();
}

inspectExness().catch(console.error);
