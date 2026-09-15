async function clickClockIcon() {
  const tabs = await (await fetch('http://127.0.0.1:9222/json')).json();
  const exnessTab = tabs.find(t => t.url.includes('exness.com/webtrading'));
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/' + exnessTab.id);
  await new Promise(r => ws.onopen = r);

  // Click clock icon at x: 25, y: 310
  ws.send(JSON.stringify({ id: 1, method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x: 25, y: 310, button: 'left', clickCount: 1 } }));
  ws.send(JSON.stringify({ id: 2, method: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x: 25, y: 310, button: 'left', clickCount: 1 } }));

  setTimeout(() => {
    ws.send(JSON.stringify({ id: 3, method: 'Page.captureScreenshot', params: { format: 'png' } }));
  }, 1000);

  ws.onmessage = (e) => {
    const d = JSON.parse(e.data);
    if (d.id === 3) {
      require('fs').writeFileSync('C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a/exness_positions_opened.png', Buffer.from(d.result.data, 'base64'));
      console.log('Saved exness_positions_opened.png');
      ws.close();
    }
  };
}

clickClockIcon().catch(console.error);
