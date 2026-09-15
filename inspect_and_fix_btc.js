const fs = require('fs');

async function main() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/FBB66DD7C646B5BFAE8DE40058ACCCC6');

  await new Promise(res => {
    ws.onopen = () => {
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: {
          expression: `(() => {
            const els = Array.from(document.querySelectorAll('[data-name="legend-source-item"]'));
            return els.map(e => ({
              text: e.innerText?.trim().replace(/\\s+/g, ' '),
              rect: e.getBoundingClientRect()
            }));
          })()`,
          returnByValue: true
        }
      }));
    };

    ws.onmessage = async (e) => {
      const r = JSON.parse(e.data);
      const items = r.result?.result?.value || [];
      console.log('BTC Legend Items:', items);
      
      const utItem = items.find(i => i.text && i.text.includes('UT Bot Alerts'));
      if (!utItem) {
        console.log('UT Bot item not found in legend');
        ws.close();
        return res();
      }

      console.log('UT Bot item found at:', utItem.rect);
      const x = utItem.rect.x + 20;
      const y = utItem.rect.y + 10;

      // Double click on UT Bot in legend to open Settings dialog
      ws.send(JSON.stringify({ id: 2, method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x, y, button: 'left', clickCount: 1 } }));
      ws.send(JSON.stringify({ id: 3, method: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 } }));
      ws.send(JSON.stringify({ id: 4, method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x, y, button: 'left', clickCount: 2 } }));
      ws.send(JSON.stringify({ id: 5, method: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x, y, button: 'left', clickCount: 2 } }));

      setTimeout(() => {
        // Now find the settings dialog and set Key Value to 2
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
              const titles = Array.from(dialog.querySelectorAll('label, div[class*="cell-"], span')).map(e => e.innerText?.trim());
              
              if (inputs.length > 0) {
                const oldVal = inputs[0].value;
                setReactInputValue(inputs[0], '2');
                const okBtn = Array.from(dialog.querySelectorAll('button')).find(b => b.innerText && b.innerText.trim().toLowerCase() === 'ok');
                if (okBtn) {
                  setTimeout(() => okBtn.click(), 300);
                  return { success: true, oldVal, newVal: '2', clickedOk: true };
                }
                return { success: true, oldVal, newVal: '2', clickedOk: false };
              }
              return { error: 'No inputs found in dialog' };
            })()`,
            returnByValue: true
          }
        }));
      }, 1000);
    };

    let count = 0;
    const oldOnMsg = ws.onmessage;
    // We already assigned ws.onmessage above
    ws.addEventListener('message', (ev) => {
      const d = JSON.parse(ev.data);
      if (d.id === 6) {
        console.log('Dialog result:', d.result?.result?.value);
        setTimeout(() => {
          ws.close();
          res();
        }, 1000);
      }
    });
  });
}

main().catch(console.error);
