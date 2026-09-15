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

  // Get full text
  const res = await cdp('Runtime.evaluate', {
    expression: `(() => {
      const portfolioContainer = document.querySelector('[class*="PortfolioDesktop"]');
      return portfolioContainer ? portfolioContainer.innerText : 'NOT_FOUND';
    })()`,
    returnByValue: true
  });

  console.log('=== FULL CLOSED VIEW TEXT ===');
  console.log(res.result.value);

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
