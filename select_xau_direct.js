const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/D8732812EFF8977614EA114107B74D4C');

ws.onopen = () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        // 1. Close the blue notification
        const blueX = Array.from(document.querySelectorAll('button')).find(b => b.parentElement?.innerText?.includes('Nhấn và giữ Ctrl'));
        if (blueX) blueX.click();

        // 2. Click the XAU/USD row directly in the left table
        const row = Array.from(document.querySelectorAll('*')).find(el => {
          return el.children.length === 0 && el.innerText.trim() === 'XAU/USD';
        });
        if (row) {
          // Click row
          const tr = row.closest('div[class*="row"]') || row.closest('tr') || row.parentElement;
          (tr || row).click();
          (tr || row).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
          return 'Clicked XAU/USD row!';
        }
        return 'Row not found';
      })()`,
      returnByValue: true
    }
  }));
};

ws.onmessage = (e) => {
  console.log(JSON.parse(e.data).result?.result?.value);
  process.exit(0);
};
