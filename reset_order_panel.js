const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/D8732812EFF8977614EA114107B74D4C');

ws.onopen = () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        // 1. Click Hủy (Cancel) button
        const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Hủy');
        if (cancelBtn) {
          cancelBtn.click();
        }

        // 2. Click close on the blue tooltip
        const blueClose = document.querySelector('div[class*="Tooltip"] button') || 
                          Array.from(document.querySelectorAll('button')).find(b => b.parentElement?.innerText?.includes('Nhấn và giữ Ctrl'));
        if (blueClose) {
          blueClose.click();
        }

        return { canceled: !!cancelBtn, closedTooltip: !!blueClose };
      })()`,
      returnByValue: true
    }
  }));
};

ws.onmessage = (e) => {
  console.log(JSON.parse(e.data).result.result.value);
  process.exit(0);
};
