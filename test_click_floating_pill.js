const fs = require('fs');

function cdpCall(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const timeout = setTimeout(() => {
      ws.removeEventListener('message', handler);
      reject(new Error(`CDP Timeout for ${method}`));
    }, 10000);

    const handler = (e) => {
      const res = JSON.parse(e.data);
      if (res.id === id) {
        clearTimeout(timeout);
        ws.removeEventListener('message', handler);
        if (res.error) reject(res.error);
        else resolve(res.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

const delay = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  const tabs = await (await fetch('http://127.0.0.1:9222/json')).json();
  const exness = tabs.find(t => t.type === 'page' && t.url.includes('my.exness.com/webtrading'));
  const ws = new WebSocket(`ws://127.0.0.1:9222/devtools/page/${exness.id}`);
  await new Promise(r => ws.onopen = r);

  const pillInfo = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const all = Array.from(document.querySelectorAll('*')).filter(el => el.innerText && el.innerText.includes('+50.40'));
      const details = all.map(el => ({
        tag: el.tagName,
        text: el.innerText,
        class: el.className,
        childrenCount: el.children.length
      }));
      return { count: all.length, details };
    })()`,
    returnByValue: true
  });

  console.log('Pill elements:', JSON.stringify(pillInfo.result?.value, null, 2));
  ws.close();
}

main().catch(console.error);
