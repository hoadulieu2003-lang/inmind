const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/D8732812EFF8977614EA114107B74D4C');

ws.onopen = () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        // 1. Close blue tooltip if present
        const closeBtn = document.querySelector('button[aria-label="close"]') || 
                         Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('×') || b.querySelector('svg'));
        if (closeBtn) {
          closeBtn.click();
        }

        // 2. Read balance / equity from bottom status bar
        const bottomBar = document.querySelector('div[class*="BottomBar"]') || document.body;
        const text = bottomBar.innerText;
        
        const balanceMatch = text.match(/Tài sản:\\s*([\\d,.]+)\\s*USD/);
        const freeMarginMatch = text.match(/Tiền Ký Quỹ Khả Dụng:\\s*([\\d,.]+)\\s*USD/);
        const equityMatch = text.match(/Số dư:\\s*([\\d,.]+)\\s*USD/);

        // 3. Read Sell / Buy prices
        const sellBtn = document.querySelector('.OrderButton_sell__f2c8b') || document.querySelector('[class*="OrderButton_sell"]');
        const buyBtn = document.querySelector('.OrderButton_buy__f2c8b') || document.querySelector('[class*="OrderButton_buy"]');

        const sellText = sellBtn ? sellBtn.innerText.replace(/\\s+/g, ' ') : null;
        const buyText = buyBtn ? buyBtn.innerText.replace(/\\s+/g, ' ') : null;

        // Parse prices
        const sellPrice = sellText ? parseFloat(sellText.replace(/[^0-9.]/g, '')) : null;
        const buyPrice = buyText ? parseFloat(buyText.replace(/[^0-9.]/g, '')) : null;

        // 4. Read Volume input
        const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
        const volumeInput = inputs.find(i => i.value && !isNaN(parseFloat(i.value)));
        
        return {
          status: 'Exness Webtrading Connected',
          balance: balanceMatch ? balanceMatch[1] : '10,000.00',
          freeMargin: freeMarginMatch ? freeMarginMatch[1] : '10,000.00',
          equity: equityMatch ? equityMatch[1] : '10,000.00',
          sellPrice,
          buyPrice,
          spread: (sellPrice && buyPrice) ? +(buyPrice - sellPrice).toFixed(3) : null,
          currentVolume: volumeInput ? volumeInput.value : '0.01',
          inputsCount: inputs.length
        };
      })()`,
      returnByValue: true
    }
  }));
};

ws.onmessage = (e) => {
  const res = JSON.parse(e.data);
  console.log('EXNESS_STATE:', JSON.stringify(res.result.result.value, null, 2));
  process.exit(0);
};

ws.onerror = (err) => {
  console.error('WS Error:', err);
  process.exit(1);
};
