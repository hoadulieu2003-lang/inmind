async function main() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/FBB66DD7C646B5BFAE8DE40058ACCCC6');

  await new Promise(res => {
    ws.onopen = () => {
      // Find gear button
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: {
          expression: `(() => {
            // Find all buttons inside legend item of UT Bot
            const allElements = Array.from(document.querySelectorAll('*'));
            const utEl = allElements.find(el => el.children.length === 0 && el.innerText && el.innerText.trim() === 'UT Bot Alerts');
            if (!utEl) return { error: 'UT Bot not found' };
            
            const parentRow = utEl.closest('[class*="item-"]') || utEl.parentElement?.parentElement;
            const buttons = Array.from(parentRow.querySelectorAll('button, div[role="button"]'));
            
            return {
              parentText: parentRow ? parentRow.innerText : '',
              buttons: buttons.map(b => ({
                title: b.getAttribute('title') || b.getAttribute('aria-label') || b.innerText,
                rect: b.getBoundingClientRect()
              }))
            };
          })()`,
          returnByValue: true
        }
      }));
    };

    ws.onmessage = (e) => {
      const r = JSON.parse(e.data);
      console.log('Buttons:', JSON.stringify(r.result?.result?.value, null, 2));
      ws.close();
      res();
    };
  });
}

main().catch(console.error);
