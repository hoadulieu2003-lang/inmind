const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/FBB66DD7C646B5BFAE8DE40058ACCCC6');

ws.onopen = () => {
  const x = 100;
  const y = 120;
  // Double click UT Bot in BTC tab legend
  ws.send(JSON.stringify({ id: 1, method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x, y, button: 'left', clickCount: 1 } }));
  setTimeout(() => ws.send(JSON.stringify({ id: 2, method: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 } })), 50);
  setTimeout(() => ws.send(JSON.stringify({ id: 3, method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x, y, button: 'left', clickCount: 2 } })), 100);
  setTimeout(() => ws.send(JSON.stringify({ id: 4, method: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x, y, button: 'left', clickCount: 2 } })), 150);

  setTimeout(() => {
    // Fill Key Value = 2 and click OK
    ws.send(JSON.stringify({
      id: 5,
      method: 'Runtime.evaluate',
      params: {
        expression: `(() => {
          const dialog = document.querySelector('div[data-name="indicator-properties-dialog"]') || document.querySelector('div[role="dialog"]');
          if (!dialog) return 'Dialog not found';

          function setReactInputValue(input, val) {
            const lastVal = input.value;
            input.value = val;
            const tracker = input._valueTracker;
            if (tracker) tracker.setValue(lastVal);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }

          const inputs = Array.from(dialog.querySelectorAll('input[type="text"]'));
          if (inputs.length > 0) {
            setReactInputValue(inputs[0], '2');
          }

          const okBtn = Array.from(dialog.querySelectorAll('button')).find(b => b.innerText.trim().toLowerCase() === 'ok');
          if (okBtn) {
            setTimeout(() => okBtn.click(), 200);
            return 'Set Key Value = 2 and clicked OK';
          }
          return 'OK button not found';
        })()`,
        returnByValue: true
      }
    }));
  }, 1000);
};

ws.onmessage = (e) => {
  const data = JSON.parse(e.data);
  if (data.id === 5) {
    console.log(data.result?.result?.value);
    setTimeout(() => process.exit(0), 1000);
  }
};
