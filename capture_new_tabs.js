async function capture(tabId, filename) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/' + tabId);
    ws.onopen = () => {
      ws.send(JSON.stringify({ id: 1, method: 'Page.captureScreenshot', params: { format: 'png' } }));
    };
    ws.onmessage = (e) => {
      const res = JSON.parse(e.data);
      if (res.result && res.result.data) {
        require('fs').writeFileSync(filename, Buffer.from(res.result.data, 'base64'));
        ws.close();
        resolve(filename);
      }
    };
    ws.onerror = reject;
  });
}

async function main() {
  await capture('FBB66DD7C646B5BFAE8DE40058ACCCC6', 'tv_btc.png');
  console.log('Saved tv_btc.png');
  await capture('10A2B03E7DD9467BA2D524E5B23BF9F4', 'tv_oil.png');
  console.log('Saved tv_oil.png');
}

main().catch(console.error);
