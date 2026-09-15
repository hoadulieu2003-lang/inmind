async function main() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/FBB66DD7C646B5BFAE8DE40058ACCCC6');

  await new Promise(res => {
    ws.onopen = () => {
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: {
          expression: `(() => {
            const allElements = Array.from(document.querySelectorAll('*'));
            const utEl = allElements.find(el => el.children.length === 0 && el.innerText && el.innerText.trim() === 'UT Bot Alerts');
            if (!utEl) return { error: 'UT Bot not found' };
            const parentRow = utEl.closest('[class*="item-"]') || utEl.parentElement?.parentElement;
            const settingsBtn = Array.from(parentRow.querySelectorAll('button, div[role="button"]')).find(b => {
              const t = b.getAttribute('title') || b.getAttribute('aria-label') || '';
              return t.includes('Cài đặt') || t.includes('Settings');
            });
            if (settingsBtn) {
              settingsBtn.click();
              return { clickedSettings: true };
            }
            return { error: 'Settings button not found' };
          })()`,
          returnByValue: true
        }
      }));
    };

    ws.onmessage = (e) => {
      const r = JSON.parse(e.data);
      console.log('Open Dialog:', r.result?.result?.value);
      
      // Wait for dialog to open
      setTimeout(() => {
        ws.send(JSON.stringify({
          id: 2,
          method: 'Runtime.evaluate',
          params: {
            expression: `(() => {
              const dialog = document.querySelector('div[data-name="indicator-properties-dialog"]') || document.querySelector('div[role="dialog"]');
              if (!dialog) return { error: 'Dialog not found' };

              // First input (Key Value)
              const input = dialog.querySelector('input[type="text"], input[inputmode="numeric"]');
              if (!input) return { error: 'Input not found' };

              input.focus();
              input.select();
              document.execCommand('selectAll', false, null);
              document.execCommand('insertText', false, '2');

              // Dispatch events
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));

              const okBtn = Array.from(dialog.querySelectorAll('button')).find(b => b.innerText && b.innerText.trim().toLowerCase() === 'ok');
              if (okBtn) {
                setTimeout(() => okBtn.click(), 300);
                return { success: true, newVal: input.value, clickedOk: true };
              }
              return { success: true, newVal: input.value, clickedOk: false };
            })()`,
            returnByValue: true
          }
        }));
      }, 800);

      let step = 0;
      ws.onmessage = (ev) => {
        const d = JSON.parse(ev.data);
        if (d.id === 2) {
          console.log('Fill result:', d.result?.result?.value);
          setTimeout(() => {
            ws.close();
            res();
          }, 1000);
        }
      };
    };
  });
}

main().catch(console.error);
