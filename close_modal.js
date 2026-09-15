const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/D8732812EFF8977614EA114107B74D4C');

ws.onopen = () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Có' || b.innerText.trim() === 'Không');
        if (btn) {
          btn.click();
          return 'Clicked ' + btn.innerText;
        }
        return 'Not found';
      })()`,
      returnByValue: true
    }
  }));
};

ws.onmessage = (e) => {
  console.log(JSON.parse(e.data).result?.result?.value);
  // Wait 500ms and take clean screenshot
  setTimeout(() => {
    ws.send(JSON.stringify({ id: 2, method: 'Page.captureScreenshot', params: { format: 'png' } }));
  }, 500);

  if (JSON.parse(e.data).id === 2) {
    const data = JSON.parse(e.data).result.data;
    require('fs').writeFileSync('exness_clean_position.png', Buffer.from(data, 'base64'));
    console.log('Saved exness_clean_position.png');
    process.exit(0);
  }
};
