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
            if (!utEl) return { found: false };
            
            const rect = utEl.getBoundingClientRect();
            // find parent row
            let parent = utEl.parentElement;
            while (parent && parent.tagName !== 'BODY') {
              if (parent.getAttribute('data-name') || (parent.className && parent.className.includes('item'))) {
                break;
              }
              parent = parent.parentElement;
            }

            return {
              found: true,
              text: utEl.innerText,
              rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
              parentTag: parent ? parent.tagName : null,
              parentClass: parent ? parent.className : null,
              parentRect: parent ? parent.getBoundingClientRect() : null
            };
          })()`,
          returnByValue: true
        }
      }));
    };

    ws.onmessage = (e) => {
      const r = JSON.parse(e.data);
      console.log('Result:', JSON.stringify(r.result?.result?.value, null, 2));
      ws.close();
      res();
    };
  });
}

main().catch(console.error);
