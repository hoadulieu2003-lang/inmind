async function clickMobileSymbolWrapper() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/D8732812EFF8977614EA114107B74D4C');
  await new Promise(r => ws.onopen = r);

  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        const el = document.querySelector('[class*="symbolWrapper"]') || document.querySelector('[class*="SymbolWithIcon_symbol"]');
        if (el) {
          el.click();
          return { clicked: true, text: el.innerText };
        }
        return { clicked: false };
      })()`,
      returnByValue: true
    }
  }));

  ws.onmessage = (e) => {
    console.log(JSON.parse(e.data).result?.result?.value);
    setTimeout(() => {
      ws.send(JSON.stringify({ id: 2, method: 'Page.captureScreenshot', params: { format: 'png' } }));
    }, 800);
    ws.onmessage = (ev) => {
      const d = JSON.parse(ev.data);
      if (d.id === 2) {
        require('fs').writeFileSync('C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a/exness_after_wrapper_click.png', Buffer.from(d.result.data, 'base64'));
        console.log('Saved exness_after_wrapper_click.png');
        ws.close();
      }
    };
  };
}

clickMobileSymbolWrapper().catch(console.error);
