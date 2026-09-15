async function inspectPositionsDetail() {
  const tabs = await (await fetch('http://127.0.0.1:9222/json')).json();
  const exnessTab = tabs.find(t => t.url.includes('exness.com/webtrading'));
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/' + exnessTab.id);
  await new Promise(r => ws.onopen = r);

  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        // Find clock icon on left sidebar
        const leftBtns = Array.from(document.querySelectorAll('nav button, div[role="navigation"] button, aside button, [class*="Sidebar"] button'));
        const clockBtn = leftBtns.find(b => b.getAttribute('aria-label')?.includes('lệnh') || b.getAttribute('title')?.includes('lệnh') || b.querySelector('svg'));

        // Also check if we can expand bottom panel
        const expandBtn = Array.from(document.querySelectorAll('button')).find(b => b.getAttribute('aria-label')?.includes('mở rộng') || b.getAttribute('title')?.includes('mở rộng'));

        return {
          leftBtnsCount: leftBtns.length,
          expandBtnFound: !!expandBtn
        };
      })()`,
      returnByValue: true
    }
  }));

  ws.onmessage = (e) => {
    console.log('Result:', JSON.stringify(JSON.parse(e.data).result?.result?.value, null, 2));
    ws.close();
  };
}

inspectPositionsDetail().catch(console.error);
