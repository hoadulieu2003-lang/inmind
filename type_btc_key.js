async function main() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/FBB66DD7C646B5BFAE8DE40058ACCCC6');

  await new Promise(res => {
    ws.onopen = async () => {
      // 1. Hover and click Settings button
      ws.send(JSON.stringify({ id: 1, method: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x: 80, y: 122 } }));
      setTimeout(() => {
        ws.send(JSON.stringify({ id: 2, method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x: 216, y: 124, button: 'left', clickCount: 1 } }));
        ws.send(JSON.stringify({ id: 3, method: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x: 216, y: 124, button: 'left', clickCount: 1 } }));
      }, 200);

      // 2. Get input coordinates
      setTimeout(() => {
        ws.send(JSON.stringify({
          id: 4,
          method: 'Runtime.evaluate',
          params: {
            expression: `(() => {
              const dialog = document.querySelector('div[data-name="indicator-properties-dialog"]') || document.querySelector('div[role="dialog"]');
              if (!dialog) return null;
              const input = dialog.querySelector('input[type="text"], input[inputmode="numeric"]');
              if (!input) return null;
              const r = input.getBoundingClientRect();
              return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
            })()`,
            returnByValue: true
          }
        }));
      }, 700);
    };

    ws.onmessage = (e) => {
      const d = JSON.parse(e.data);
      if (d.id === 4) {
        const coords = d.result?.result?.value;
        console.log('Input coords:', coords);
        if (coords) {
          // Double click input to select text
          ws.send(JSON.stringify({ id: 5, method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x: coords.x, y: coords.y, button: 'left', clickCount: 1 } }));
          ws.send(JSON.stringify({ id: 6, method: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x: coords.x, y: coords.y, button: 'left', clickCount: 1 } }));
          ws.send(JSON.stringify({ id: 7, method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x: coords.x, y: coords.y, button: 'left', clickCount: 2 } }));
          ws.send(JSON.stringify({ id: 8, method: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x: coords.x, y: coords.y, button: 'left', clickCount: 2 } }));

          // Type '2'
          setTimeout(() => {
            ws.send(JSON.stringify({ id: 9, method: 'Input.dispatchKeyEvent', params: { type: 'keyDown', text: '2', unmodifiedText: '2', key: '2', code: 'Digit2', windowsVirtualKeyCode: 50 } }));
            ws.send(JSON.stringify({ id: 10, method: 'Input.dispatchKeyEvent', params: { type: 'keyUp', key: '2', code: 'Digit2', windowsVirtualKeyCode: 50 } }));
          }, 150);

          // Press Enter to submit
          setTimeout(() => {
            ws.send(JSON.stringify({ id: 11, method: 'Input.dispatchKeyEvent', params: { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 } }));
            ws.send(JSON.stringify({ id: 12, method: 'Input.dispatchKeyEvent', params: { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 } }));
          }, 350);

          setTimeout(() => {
            ws.close();
            res();
          }, 800);
        } else {
          ws.close();
          res();
        }
      }
    };
  });
}

main().catch(console.error);
