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
        // Find all elements near the top right (y < 60, x > 700)
        const all = Array.from(document.querySelectorAll('*')).map(el => {
          const r = el.getBoundingClientRect();
          return {
            tag: el.tagName,
            text: el.innerText ? el.innerText.trim() : '',
            rect: { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) },
            aria: el.getAttribute('aria-label'),
            title: el.getAttribute('title')
          };
        }).filter(el => el.rect.top < 60 && el.rect.left > 700 && el.rect.width > 0 && el.rect.height > 0);

        return all.slice(0, 25);
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
