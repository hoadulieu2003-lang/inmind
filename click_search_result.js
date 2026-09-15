const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/D8732812EFF8977614EA114107B74D4C');

ws.onopen = () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        // Find XAU/USD row or item
        const matches = Array.from(document.querySelectorAll('*')).filter(el => {
          return el.children.length === 0 && (el.innerText === 'XAU/USD' || el.innerText === 'XAUUSD' || el.innerText.includes('XAU/USD'));
        });
        
        if (matches.length > 0) {
          const item = matches[0].closest('div[role="row"]') || matches[0].closest('div[role="button"]') || matches[0].closest('li') || matches[0];
          item.click();
          return { success: true, text: matches[0].innerText };
        }
        return { success: false };
      })()`,
      returnByValue: true
    }
  }));
};

ws.onmessage = (e) => {
  console.log(JSON.parse(e.data).result?.result?.value);
  process.exit(0);
};
