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

  // Click Closed tab button
  await cdp('Runtime.evaluate', {
    expression: `(() => {
      const closedTab = Array.from(document.querySelectorAll('button[role="tab"]')).find(b => b.innerText.trim() === 'Closed');
      if (closedTab) closedTab.click();
    })()`
  });
  await new Promise(r => setTimeout(r, 1500));

  // Inspect what appeared on Closed view
  const res = await cdp('Runtime.evaluate', {
    expression: `(() => {
      const portfolioContainer = document.querySelector('[class*="PortfolioDesktop"]');
      if (!portfolioContainer) return { error: 'No PortfolioDesktop container' };
      
      const buttons = Array.from(portfolioContainer.querySelectorAll('button, select, div[role="button"], [class*="Select"], [class*="filter"], [class*="Filter"], [class*="pagination"], [class*="Pagination"]'))
        .map(b => ({ tag: b.tagName, text: (b.innerText || '').trim(), class: b.className }));

      const tableInfo = {
        totalRows: portfolioContainer.querySelectorAll('[role="row"]').length,
        hasPagination: !!portfolioContainer.querySelector('[class*="pagination"]'),
        text: portfolioContainer.innerText.slice(0, 500)
      };

      return { buttons, tableInfo };
    })()`,
    returnByValue: true
  });

  console.log(JSON.stringify(res.result.value, null, 2));

  // Switch back to Open tab
  await cdp('Runtime.evaluate', {
    expression: `(() => {
      const openTab = Array.from(document.querySelectorAll('button[role="tab"]')).find(b => b.innerText.trim().startsWith('Open'));
      if (openTab) openTab.click();
    })()`
  });

  ws.close();
}
run();
