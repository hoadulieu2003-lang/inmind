const WebSocket = require('ws');

async function extractAllClosedTrades() {
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

  // Scroll down multiple times to load lazy rows if any
  for (let i = 0; i < 5; i++) {
    await cdpCall('Runtime.evaluate', {
      expression: `(() => {
        const container = document.querySelector('[class*="tableBody"], [class*="virtualList"], [class*="Table_container"], [class*="table_container"]') || document.querySelector('[role="table"]')?.parentElement;
        if (container) {
          container.scrollTop += 2000;
        } else {
          window.scrollBy(0, 1000);
        }
      })()`
    });
    await new Promise(r => setTimeout(r, 500));
  }

  // Extract all rows
  const closedData = await cdpCall('Runtime.evaluate', {
    expression: `(() => {
      const rows = Array.from(document.querySelectorAll('[role="row"], tr, div[class*="Row"]'));
      const parsed = [];
      for (const r of rows) {
        const raw = (r.innerText || '').replace(/\\s+/g, ' ').trim();
        if (!raw.includes('Buy') && !raw.includes('Sell') && !raw.includes('Mua') && !raw.includes('Bán')) continue;
        
        // Clean unicode isolate characters like \\u2066, \\u2069
        const clean = raw.replace(/[\\u2066\\u2067\\u2068\\u2069\\u200E\\u200F]/g, '');
        
        const ticketMatch = clean.match(/\\b(5\\d{8,10})\\b/);
        const pnlMatch = clean.match(/([+-]?[\\d,]+\\.\\d+)\\s*$/);
        const pnl = pnlMatch ? parseFloat(pnlMatch[1].replace(/,/g, '')) : null;

        const isBuy = clean.includes('Buy') || clean.includes('Mua');
        const isSell = clean.includes('Sell') || clean.includes('Bán');
        const isGold = clean.includes('XAU/USD') || clean.includes('GOLD');
        const isBtc = clean.includes('BTC');
        const isOil = clean.includes('USOIL') || clean.includes('OIL') || clean.includes('UKOIL');
        const isGbp = clean.includes('GBP/USD') || clean.includes('GBPUSD');
        const isUs500 = clean.includes('US500') || clean.includes('SPX') || clean.includes('500');
        const symbol = isGold ? 'GOLD' : (isBtc ? 'BTCUSD' : (isOil ? 'USOIL' : (isGbp ? 'GBPUSD' : (isUs500 ? 'US500' : null))));

        parsed.push({
          raw,
          clean,
          ticket: ticketMatch ? ticketMatch[1] : null,
          symbol,
          action: isBuy ? 'BUY' : 'SELL',
          pnl
        });
      }
      return parsed;
    })()`,
    returnByValue: true
  });

  console.log('Total Closed Rows Extracted:', closedData.result.value.length);
  console.log(JSON.stringify(closedData.result.value, null, 2));

  // Click back Open tab
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

extractAllClosedTrades().catch(console.error);
