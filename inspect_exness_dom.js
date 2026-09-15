async function inspectExnessDOM() {
  const tabs = await (await fetch('http://127.0.0.1:9222/json')).json();
  const exnessTab = tabs.find(t => t.url.includes('exness.com/webtrading'));
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/' + exnessTab.id);
  await new Promise(r => ws.onopen = r);

  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        const iframes = Array.from(document.querySelectorAll('iframe')).map(f => ({
          id: f.id,
          name: f.name,
          src: f.src,
          rect: f.getBoundingClientRect()
        }));

        // Search for all text or buttons in main document
        const mainBtns = Array.from(document.querySelectorAll('button')).map(b => ({
          text: b.innerText?.slice(0, 30),
          rect: b.getBoundingClientRect()
        })).filter(b => b.rect.w > 0);

        return { iframes, mainBtns: mainBtns.slice(0, 15) };
      })()`,
      returnByValue: true
    }
  }));

  ws.onmessage = (e) => {
    console.log('Exness DOM info:', JSON.stringify(JSON.parse(e.data).result?.result?.value, null, 2));
    ws.close();
  };
}

inspectExnessDOM().catch(console.error);
