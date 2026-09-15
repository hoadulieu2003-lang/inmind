const fs = require('fs');

async function test() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/FBB66DD7C646B5BFAE8DE40058ACCCC6');
  ws.onopen = () => {
    ws.send(JSON.stringify({
      id: 1,
      method: 'Runtime.evaluate',
      params: {
        expression: `(() => {
          const t = Array.from(document.querySelectorAll('[data-name="legend-source-title"], div[class*="title-"]')).map(e => e.innerText?.trim()).filter(Boolean);
          return t;
        })()`,
        returnByValue: true
      }
    }));
  };
  ws.onmessage = (e) => {
    const r = JSON.parse(e.data);
    if (r.id === 1) {
      console.log('BTC Titles:', r.result?.result?.value);
      ws.send(JSON.stringify({ id: 2, method: 'Page.captureScreenshot', params: { format: 'png' } }));
    } else if (r.id === 2) {
      fs.writeFileSync('C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a/tv_btc_final_verified.png', Buffer.from(r.result.data, 'base64'));
      console.log('Saved tv_btc_final_verified.png');
      ws.close();
    }
  };
}
test().catch(console.error);
