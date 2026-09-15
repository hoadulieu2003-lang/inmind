const fs = require('fs');

async function main() {
  const tabs = await (await fetch('http://127.0.0.1:9222/json')).json();
  const exness = tabs.find(t => t.type === 'page' && t.url.includes('my.exness.com/webtrading'));
  const ws = new WebSocket(`ws://127.0.0.1:9222/devtools/page/${exness.id}`);
  await new Promise(r => ws.onopen = r);

  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button, div[role="button"]')).map(b => {
          const r = b.getBoundingClientRect();
          return {
            tag: b.tagName,
            text: b.innerText.replace(/\\s+/g, ' ').slice(0, 30),
            aria: b.getAttribute('aria-label'),
            title: b.getAttribute('title'),
            rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }
          };
        }).filter(b => b.rect.w > 0 && b.rect.h > 0);

        return { count: btns.length, btns };
      })()`,
      returnByValue: true
    }
  }));

  ws.onmessage = (e) => {
    console.log(JSON.stringify(JSON.parse(e.data).result?.result?.value, null, 2));
    ws.close();
  };
}

main().catch(console.error);
