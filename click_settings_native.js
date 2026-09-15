async function main() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/FBB66DD7C646B5BFAE8DE40058ACCCC6');

  await new Promise(res => {
    ws.onopen = () => {
      // 1. Move mouse to UT Bot legend row
      ws.send(JSON.stringify({ id: 1, method: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x: 80, y: 122 } }));
      
      // 2. Query button coords after hover
      setTimeout(() => {
        ws.send(JSON.stringify({
          id: 2,
          method: 'Runtime.evaluate',
          params: {
            expression: `(() => {
              const allElements = Array.from(document.querySelectorAll('*'));
              const utEl = allElements.find(el => el.children.length === 0 && el.innerText && el.innerText.trim() === 'UT Bot Alerts');
              const parentRow = utEl ? (utEl.closest('[class*="item-"]') || utEl.parentElement?.parentElement) : null;
              if (!parentRow) return null;
              const settingsBtn = Array.from(parentRow.querySelectorAll('button, div[role="button"]')).find(b => {
                const t = b.getAttribute('title') || b.getAttribute('aria-label') || '';
                return t.includes('Cài đặt') || t.includes('Settings');
              });
              if (!settingsBtn) return null;
              const r = settingsBtn.getBoundingClientRect();
              return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
            })()`,
            returnByValue: true
          }
        }));
      }, 300);
    };

    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.id === 2) {
        const coords = data.result?.result?.value;
        console.log('Settings button coords:', coords);
        if (coords && coords.w > 0) {
          // Click the button via native mouse
          ws.send(JSON.stringify({ id: 3, method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x: coords.x, y: coords.y, button: 'left', clickCount: 1 } }));
          ws.send(JSON.stringify({ id: 4, method: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x: coords.x, y: coords.y, button: 'left', clickCount: 1 } }));
          
          setTimeout(() => {
            // Check dialog and fill
            ws.send(JSON.stringify({
              id: 5,
              method: 'Runtime.evaluate',
              params: {
                expression: `(() => {
                  const dialog = document.querySelector('div[data-name="indicator-properties-dialog"]') || document.querySelector('div[role="dialog"]');
                  if (!dialog) return { error: 'Dialog still not open' };
                  
                  const input = dialog.querySelector('input[type="text"], input[inputmode="numeric"]');
                  if (!input) return { error: 'Input not found' };

                  input.focus();
                  input.select();
                  document.execCommand('selectAll', false, null);
                  document.execCommand('insertText', false, '2');
                  input.dispatchEvent(new Event('input', { bubbles: true }));
                  input.dispatchEvent(new Event('change', { bubbles: true }));

                  const okBtn = Array.from(dialog.querySelectorAll('button')).find(b => b.innerText && b.innerText.trim().toLowerCase() === 'ok');
                  if (okBtn) {
                    setTimeout(() => okBtn.click(), 200);
                    return { success: true, newVal: input.value, clickedOk: true };
                  }
                  return { success: true, newVal: input.value, clickedOk: false };
                })()`,
                returnByValue: true
              }
            }));
          }, 800);
        } else {
          ws.close();
          res();
        }
      } else if (data.id === 5) {
        console.log('Dialog action:', data.result?.result?.value);
        setTimeout(() => {
          ws.close();
          res();
        }, 1000);
      }
    };
  });
}

main().catch(console.error);
