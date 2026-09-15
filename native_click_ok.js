async function main() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/FBB66DD7C646B5BFAE8DE40058ACCCC6');

  await new Promise(res => {
    ws.onopen = async () => {
      // 1. Hover and click Settings button to ensure dialog is open
      ws.send(JSON.stringify({ id: 1, method: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x: 80, y: 122 } }));
      
      setTimeout(() => {
        ws.send(JSON.stringify({ id: 2, method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x: 216, y: 124, button: 'left', clickCount: 1 } }));
        ws.send(JSON.stringify({ id: 3, method: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x: 216, y: 124, button: 'left', clickCount: 1 } }));
      }, 200);

      // 2. Wait 500ms, set input to 2, get Ok button coordinates
      setTimeout(() => {
        ws.send(JSON.stringify({
          id: 4,
          method: 'Runtime.evaluate',
          params: {
            expression: `(() => {
              const dialog = document.querySelector('div[data-name="indicator-properties-dialog"]') || document.querySelector('div[role="dialog"]');
              if (!dialog) return { error: 'No dialog' };
              
              const input = dialog.querySelector('input[type="text"], input[inputmode="numeric"]');
              if (input) {
                input.focus();
                input.select();
                document.execCommand('selectAll', false, null);
                document.execCommand('insertText', false, '2');
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
              }

              const okBtn = Array.from(dialog.querySelectorAll('button')).find(b => b.innerText?.trim().toLowerCase() === 'ok' || b.getAttribute('data-name') === 'submit-button');
              if (!okBtn) return { error: 'No ok btn' };

              const r = okBtn.getBoundingClientRect();
              return {
                x: r.x + r.width / 2,
                y: r.y + r.height / 2,
                w: r.width,
                h: r.height,
                val: input?.value
              };
            })()`,
            returnByValue: true
          }
        }));
      }, 800);
    };

    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.id === 4) {
        const info = data.result?.result?.value;
        console.log('OK Btn Info:', info);
        if (info && info.x) {
          // Native click on OK button
          ws.send(JSON.stringify({ id: 5, method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x: info.x, y: info.y, button: 'left', clickCount: 1 } }));
          ws.send(JSON.stringify({ id: 6, method: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x: info.x, y: info.y, button: 'left', clickCount: 1 } }));
          
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
