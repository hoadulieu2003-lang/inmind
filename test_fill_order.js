const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/D8732812EFF8977614EA114107B74D4C');

ws.onopen = () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        function setReactInputValue(input, val) {
          if (!input) return false;
          const lastVal = input.value;
          input.value = val;
          const event = new Event('input', { bubbles: true });
          const tracker = input._valueTracker;
          if (tracker) tracker.setValue(lastVal);
          input.dispatchEvent(event);
          input.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }

        // 1. Get current buy price
        const buyBtn = document.querySelector('.OrderButton_buy__f2c8b');
        const buyPrice = buyBtn ? parseFloat(buyBtn.innerText.replace(/[^0-9.]/g, '')) : 4368.0;

        const sl = +(buyPrice - 5.00).toFixed(2);
        const tp = +(buyPrice + 7.50).toFixed(2);

        // 2. Select Buy side first (click Mua button)
        if (buyBtn) buyBtn.click();

        // 3. Set Volume
        const volInput = document.getElementById('_r_4e_') || document.querySelector('input[value="0.01"]');
        if (volInput) setReactInputValue(volInput, '0.01');

        // 4. Set TP and SL
        const tpInput = document.getElementById('_r_4f_');
        if (tpInput) setReactInputValue(tpInput, tp.toString());

        const slInput = document.getElementById('_r_4h_');
        if (slInput) setReactInputValue(slInput, sl.toString());

        return { buyPrice, sl, tp, vol: volInput?.value };
      })()`,
      returnByValue: true
    }
  }));
};

ws.onmessage = (e) => {
  const data = JSON.parse(e.data);
  console.log('Filled:', data.result?.result?.value);
  
  // Check buttons after 500ms
  setTimeout(() => {
    ws.send(JSON.stringify({
      id: 2,
      method: 'Runtime.evaluate',
      params: {
        expression: `(() => {
          const buttons = Array.from(document.querySelectorAll('button')).map(b => b.innerText.trim().replace(/\\s+/g, ' '));
          return buttons.filter(t => t.includes('Xác nhận') || t.includes('Mua') || t.includes('Bán') || t.includes('Hủy'));
        })()`,
        returnByValue: true
      }
    }));
  }, 500);

  if (data.id === 2) {
    console.log('Buttons after fill:', data.result?.result?.value);
    process.exit(0);
  }
};
