async function findExnessWatchlistToggle() {
  const tabs = await (await fetch('http://127.0.0.1:9222/json')).json();
  const exnessTab = tabs.find(t => t.url.includes('exness.com/webtrading'));
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/' + exnessTab.id);
  await new Promise(r => ws.onopen = r);

  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button, div[role="button"]')).map(b => ({
          text: b.innerText?.trim(),
          aria: b.getAttribute('aria-label'),
          title: b.getAttribute('title'),
          class: b.className,
          rect: b.getBoundingClientRect()
        })).filter(b => b.rect.w > 0 && b.rect.x < 100);

        return btns;
      })()`,
      returnByValue: true
    }
  }));

  ws.onmessage = (e) => {
    console.log('Left buttons:', JSON.stringify(JSON.parse(e.data).result?.result?.value, null, 2));
    ws.close();
  };
}

findExnessWatchlistToggle().catch(console.error);
