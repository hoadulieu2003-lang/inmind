const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/B319A6A7C133DE20350E64CC9175762A');

ws.onopen = () => {
  const x = 100;
  const y = 120;
  
  // Dispatch double click
  ws.send(JSON.stringify({
    id: 1,
    method: 'Input.dispatchMouseEvent',
    params: { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }
  }));
  setTimeout(() => {
    ws.send(JSON.stringify({
      id: 2,
      method: 'Input.dispatchMouseEvent',
      params: { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }
    }));
  }, 50);

  setTimeout(() => {
    ws.send(JSON.stringify({
      id: 3,
      method: 'Input.dispatchMouseEvent',
      params: { type: 'mousePressed', x, y, button: 'left', clickCount: 2 }
    }));
  }, 100);

  setTimeout(() => {
    ws.send(JSON.stringify({
      id: 4,
      method: 'Input.dispatchMouseEvent',
      params: { type: 'mouseReleased', x, y, button: 'left', clickCount: 2 }
    }));
  }, 150);

  // After 1 second, check if settings dialog opened
  setTimeout(() => {
    ws.send(JSON.stringify({
      id: 5,
      method: 'Runtime.evaluate',
      params: {
        expression: `(() => {
          const dialog = document.querySelector('div[data-name="indicator-properties-dialog"]') || 
                         document.querySelector('div[role="dialog"]');
          if (!dialog) return { hasDialog: false };
          
          const title = dialog.querySelector('div[class*="title"], h2')?.innerText;
          const inputs = Array.from(dialog.querySelectorAll('input')).map(i => ({
            value: i.value,
            type: i.type,
            name: i.name
          }));
          return { hasDialog: true, title, inputs };
        })()`,
        returnByValue: true
      }
    }));
  }, 1000);
};

ws.onmessage = (e) => {
  const data = JSON.parse(e.data);
  if (data.id === 5) {
    console.log('Dialog Result:', JSON.stringify(data.result?.result?.value, null, 2));
    process.exit(0);
  }
};
