const fs = require('fs');

async function main() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/FBB66DD7C646B5BFAE8DE40058ACCCC6');

  await new Promise(res => {
    ws.onopen = () => {
      // 1. Move mouse to UT Bot to trigger hover buttons
      const x = 80;
      const y = 122;
      ws.send(JSON.stringify({ id: 1, method: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x, y } }));
      
      // 2. Double click to open settings
      setTimeout(() => {
        ws.send(JSON.stringify({ id: 2, method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x, y, button: 'left', clickCount: 1 } }));
        ws.send(JSON.stringify({ id: 3, method: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 } }));
        ws.send(JSON.stringify({ id: 4, method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x, y, button: 'left', clickCount: 2 } }));
        ws.send(JSON.stringify({ id: 5, method: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x, y, button: 'left', clickCount: 2 } }));
      }, 200);

      // 3. Inspect dialog after 1s
      setTimeout(() => {
        ws.send(JSON.stringify({
          id: 6,
          method: 'Runtime.evaluate',
          params: {
            expression: `(() => {
              const dialog = document.querySelector('div[data-name="indicator-properties-dialog"]') || document.querySelector('div[role="dialog"]');
              if (!dialog) return { error: 'Dialog not found' };

              function setReactInputValue(input, val) {
                const lastVal = input.value;
                input.value = val;
                const tracker = input._valueTracker;
                if (tracker) tracker.setValue(lastVal);
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
              }

              const inputs = Array.from(dialog.querySelectorAll('input[type="text"], input[inputmode="numeric"]'));
              const dialogTitle = dialog.querySelector('[class*="title-"]')?.innerText;
              
              let changed = false;
              let oldVal = '';
              if (inputs.length > 0) {
                oldVal = inputs[0].value;
                setReactInputValue(inputs[0], '2');
                changed = true;
              }

              const okBtn = Array.from(dialog.querySelectorAll('button')).find(b => b.innerText && b.innerText.trim().toLowerCase() === 'ok');
              if (okBtn) {
                setTimeout(() => okBtn.click(), 200);
              }

              return {
                title: dialogTitle,
                inputsCount: inputs.length,
                oldVal,
                newVal: '2',
                clickedOk: !!okBtn
              };
            })()`,
            returnByValue: true
          }
        }));
      }, 1200);
    };

    ws.onmessage = (e) => {
      const r = JSON.parse(e.data);
      if (r.id === 6) {
        console.log('Dialog action result:', JSON.stringify(r.result?.result?.value, null, 2));
        setTimeout(() => {
          ws.close();
          res();
        }, 1000);
      }
    };
  });
}

main().catch(console.error);
