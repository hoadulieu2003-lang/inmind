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
      expression: 'document.body.innerText',
      returnByValue: true
    }
  }));

  ws.onmessage = (e) => {
    const text = JSON.parse(e.data).result?.result?.value;
    console.log('--- FULL EXNESS BODY TEXT ---');
    console.log(text);
    ws.close();
  };
}

main().catch(console.error);
