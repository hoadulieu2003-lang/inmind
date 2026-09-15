async function main() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/FBB66DD7C646B5BFAE8DE40058ACCCC6');

  await new Promise(res => {
    ws.onopen = () => {
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: {
          expression: `(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const okBtn = btns.find(b => b.innerText?.trim().toLowerCase() === 'ok' || b.getAttribute('data-name') === 'submit-button');
            if (!okBtn) return null;
            const r = okBtn.getBoundingClientRect();
            return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
          })()`,
          returnByValue: true
        }
      }));
    };

    ws.onmessage = (e) => {
      const d = JSON.parse(e.data);
      if (d.id === 1) {
        const coords = d.result?.result?.value;
        console.log('OK Button Coords:', coords);
        if (coords) {
          ws.send(JSON.stringify({ id: 2, method: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x: coords.x, y: coords.y, button: 'left', clickCount: 1 } }));
          ws.send(JSON.stringify({ id: 3, method: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x: coords.x, y: coords.y, button: 'left', clickCount: 1 } }));
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
