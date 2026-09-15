const fs = require('fs');

async function main() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/FBB66DD7C646B5BFAE8DE40058ACCCC6');
  await new Promise(r => ws.onopen = r);

  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => ({
        title: document.title,
        symbolBtn: document.querySelector('#header-toolbar-symbol-search')?.innerText,
        hasDialog: !!document.querySelector('[data-name="symbol-search-items-dialog"], [role="dialog"]'),
        dialogs: Array.from(document.querySelectorAll('[role="dialog"], [data-name*="dialog"]')).map(d => d.getAttribute('data-name') || d.className)
      }))()`,
      returnByValue: true
    }
  }));

  ws.onmessage = (e) => {
    console.log(JSON.stringify(JSON.parse(e.data).result?.result?.value, null, 2));
    ws.close();
  };
}

main().catch(console.error);
