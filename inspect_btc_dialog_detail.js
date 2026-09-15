const fs = require('fs');

async function main() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/FBB66DD7C646B5BFAE8DE40058ACCCC6');

  await new Promise(res => {
    ws.onopen = () => {
      // 1. Move mouse to UT Bot legend row
      ws.send(JSON.stringify({ id: 1, method: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x: 80, y: 122 } }));
      
      // 2. Click settings button
      setTimeout(() => {
        ws.send(JSON.stringify({ id: 2, method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x: 216, y: 124, button: 'left', clickCount: 1 } }));
        ws.send(JSON.stringify({ id: 3, method: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x: 216, y: 124, button: 'left', clickCount: 1 } }));
      }, 300);

      // 3. Inspect dialog contents after 800ms
      setTimeout(() => {
        ws.send(JSON.stringify({
          id: 4,
          method: 'Runtime.evaluate',
          params: {
            expression: `(() => {
              const dialog = document.querySelector('div[data-name="indicator-properties-dialog"]') || document.querySelector('div[role="dialog"]');
              if (!dialog) return { error: 'Dialog not found' };

              // Check tabs
              const tabs = Array.from(dialog.querySelectorAll('div[role="tab"], button[role="tab"]')).map(t => ({
                text: t.innerText,
                selected: t.getAttribute('aria-selected') || t.className.includes('selected')
              }));

              // Check all labels and inputs
              const rows = Array.from(dialog.querySelectorAll('tr, div[class*="cell-"], div[class*="row-"]')).map(r => r.innerText?.trim()).filter(Boolean);
              const inputs = Array.from(dialog.querySelectorAll('input')).map(i => ({
                type: i.type,
                value: i.value,
                name: i.name,
                placeholder: i.placeholder,
                className: i.className
              }));

              return {
                dialogTitle: dialog.querySelector('[class*="title-"]')?.innerText,
                tabs,
                inputs,
                rows: rows.slice(0, 10)
              };
            })()`,
            returnByValue: true
          }
        }));
      }, 1000);
    };

    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.id === 4) {
        console.log('Dialog Details:', JSON.stringify(data.result?.result?.value, null, 2));
        // Take a screenshot of the dialog
        ws.send(JSON.stringify({ id: 5, method: 'Page.captureScreenshot', params: { format: 'png' } }));
      } else if (data.id === 5) {
        fs.writeFileSync('C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a/tv_btc_dialog.png', Buffer.from(data.result.data, 'base64'));
        console.log('Saved tv_btc_dialog.png');
        ws.close();
        res();
      }
    };
  });
}

main().catch(console.error);
