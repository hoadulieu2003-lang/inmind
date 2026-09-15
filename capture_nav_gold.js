const fs = require('fs');

async function main() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/FBB66DD7C646B5BFAE8DE40058ACCCC6');
  await new Promise(r => ws.onopen = r);

  ws.send(JSON.stringify({ id: 1, method: 'Page.captureScreenshot', params: { format: 'png' } }));
  ws.onmessage = (e) => {
    const res = JSON.parse(e.data);
    if (res.result?.data) {
      fs.writeFileSync('C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a/navigated_gold_screen.png', Buffer.from(res.result.data, 'base64'));
      console.log('Saved navigated_gold_screen.png');
      ws.close();
    }
  };
}

main().catch(console.error);
