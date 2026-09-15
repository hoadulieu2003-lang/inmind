const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/D8732812EFF8977614EA114107B74D4C');

ws.onopen = () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        const topTabs = document.querySelector('div[class*="TabBar"]') || 
                        document.querySelector('div[class*="tabs"]') ||
                        document.querySelector('header') ||
                        document.querySelector('nav');
        
        // Find all clickable tabs at the top
        const tabItems = Array.from(document.querySelectorAll('*')).filter(el => {
          const rect = el.getBoundingClientRect();
          return rect.top < 60 && rect.left < 500 && (el.innerText === '+' || el.innerText.includes('BTC') || el.innerText.includes('ETH'));
        }).map(el => ({
          tag: el.tagName,
          text: el.innerText.trim(),
          top: el.getBoundingClientRect().top,
          left: el.getBoundingClientRect().left,
          width: el.getBoundingClientRect().width,
          height: el.getBoundingClientRect().height,
          cls: el.className?.slice(0, 40)
        }));

        return tabItems;
      })()`,
      returnByValue: true
    }
  }));
};

ws.onmessage = (e) => {
  console.log(JSON.parse(e.data).result.result.value);
  process.exit(0);
};
