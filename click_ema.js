const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/B319A6A7C133DE20350E64CC9175762A');

ws.onopen = () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        const dialog = document.querySelector('div[role="dialog"]');
        if (!dialog) return 'No dialog';
        
        // Find items in search results
        const items = Array.from(dialog.querySelectorAll('div[class*="item"], div[role="row"], div[class*="cell"]'))
                           .filter(el => el.innerText && el.innerText.includes('Đường trung bình trượt hàm mũ'));
        
        if (items.length > 0) {
          items[0].click();
          // Close dialog
          const closeBtn = dialog.querySelector('button[data-name="close"]');
          if (closeBtn) setTimeout(() => closeBtn.click(), 500);
          return 'Clicked EMA: ' + items[0].innerText.slice(0, 50);
        }

        // List available items text to see what appeared
        const allTexts = Array.from(dialog.querySelectorAll('*'))
                              .map(e => e.innerText)
                              .filter(t => t && t.length > 3 && t.length < 50);
        return { notFound: true, sample: allTexts.slice(0, 15) };
      })()`,
      returnByValue: true
    }
  }));
};

ws.onmessage = (e) => {
  console.log(JSON.parse(e.data).result.result.value);
  process.exit(0);
};
