const fs = require('fs');

async function captureExness() {
  const tabs = await (await fetch('http://127.0.0.1:9222/json')).json();
  const exnessTab = tabs.find(t => t.url.includes('exness.com/webtrading'));
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/' + exnessTab.id);
  await new Promise(r => ws.onopen = r);

  ws.send(JSON.stringify({ id: 1, method: 'Page.captureScreenshot', params: { format: 'png' } }));
  ws.onmessage = (e) => {
    fs.writeFileSync('C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a/exness_now_inspect.png', Buffer.from(JSON.parse(e.data).result.data, 'base64'));
    console.log('Saved exness_now_inspect.png');
    ws.close();
  };
}

captureExness().catch(console.error);
