async function main() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/FBB66DD7C646B5BFAE8DE40058ACCCC6');

  await new Promise(res => {
    ws.onopen = async () => {
      // 1. Hover and click Settings
      ws.send(JSON.stringify({ id: 1, method: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x: 80, y: 122 } }));
      setTimeout(() => {
        ws.send(JSON.stringify({ id: 2, method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x: 216, y: 124, button: 'left', clickCount: 1 } }));
        ws.send(JSON.stringify({ id: 3, method: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x: 216, y: 124, button: 'left', clickCount: 1 } }));
      }, 200);

      // 2. Find stepper arrows or input buttons inside dialog
      setTimeout(() => {
        ws.send(JSON.stringify({
          id: 4,
          method: 'Runtime.evaluate',
          params: {
            expression: `(() => {
              const dialog = document.querySelector('div[data-name="indicator-properties-dialog"]') || document.querySelector('div[role="dialog"]');
              if (!dialog) return null;
              
              // Find the row for Key Vaule
              const inputs = Array.from(dialog.querySelectorAll('input[type="text"], input[inputmode="numeric"]'));
              const firstInput = inputs[0];
              if (!firstInput) return null;

              // Find buttons or spans inside the input wrapper
              const wrapper = firstInput.parentElement;
              const innerBtns = Array.from(wrapper.querySelectorAll('button, span[role="button"], div[class*="control-"], span[class*="button-"], [class*="arrow"]')).map(el => {
                const r = el.getBoundingClientRect();
                return {
                  tag: el.tagName,
                  class: el.className,
                  rect: { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }
                };
              });

              const inputRect = firstInput.getBoundingClientRect();

              return {
                inputVal: firstInput.value,
                inputRect: { x: inputRect.x, y: inputRect.y, w: inputRect.width, h: inputRect.height },
                innerBtns
              };
            })()`,
            returnByValue: true
          }
        }));
      }, 700);
    };

    ws.onmessage = (e) => {
      const d = JSON.parse(e.data);
      if (d.id === 4) {
        console.log('Stepper details:', JSON.stringify(d.result?.result?.value, null, 2));
        ws.close();
        res();
      }
    };
  });
}

main().catch(console.error);
