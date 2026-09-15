const fs = require('fs');

async function setDesktopMetrics() {
  const tabs = await (await fetch('http://127.0.0.1:9222/json')).json();
  const exnessTab = tabs.find(t => t.url.includes('exness.com/webtrading'));
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/' + exnessTab.id);
  await new Promise(r => ws.onopen = r);

  // Set desktop viewport
  ws.send(JSON.stringify({
    id: 1,
    method: 'Emulation.setDeviceMetricsOverride',
    params: {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      mobile: false
    }
  }));

  setTimeout(() => {
    ws.send(JSON.stringify({ id: 2, method: 'Page.captureScreenshot', params: { format: 'png' } }));
  }, 1000);

  ws.onmessage = (e) => {
    const d = JSON.parse(e.data);
    if (d.id === 2) {
      fs.writeFileSync('C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a/exness_desktop_view.png', Buffer.from(d.result.data, 'base64'));
      console.log('Saved exness_desktop_view.png');
      ws.close();
    }
  };
}

setDesktopMetrics().catch(console.error);
