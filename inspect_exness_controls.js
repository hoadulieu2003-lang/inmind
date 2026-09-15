const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/D8732812EFF8977614EA114107B74D4C');

ws.onopen = () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        // Find close button for notification
        const closeBtns = Array.from(document.querySelectorAll('button')).filter(b => b.innerText.includes('×') || b.querySelector('svg'));
        
        // Find order inputs and buttons
        const allInputs = Array.from(document.querySelectorAll('input')).map(i => ({
          tag: 'input',
          type: i.type,
          name: i.name,
          value: i.value,
          placeholder: i.placeholder,
          dataTestId: i.getAttribute('data-testid'),
          ariaLabel: i.getAttribute('aria-label'),
          id: i.id
        }));

        const allButtons = Array.from(document.querySelectorAll('button')).map(b => ({
          text: b.innerText.trim().replace(/\\s+/g, ' '),
          dataTestId: b.getAttribute('data-testid'),
          ariaLabel: b.getAttribute('aria-label'),
          className: b.className?.slice(0, 50)
        }));

        // Balance info
        const balanceText = document.body.innerText.match(/Tài sản:.*?USD|Số dư:.*?USD/g);

        return {
          allInputs,
          buySellButtons: allButtons.filter(b => b.text.includes('Bán') || b.text.includes('Mua') || b.text.includes('Sell') || b.text.includes('Buy')),
          allButtons: allButtons.slice(0, 30),
          balanceText
        };
      })()`,
      returnByValue: true
    }
  }));
};

ws.onmessage = (e) => {
  const res = JSON.parse(e.data);
  console.log(JSON.stringify(res.result.result.value, null, 2));
  process.exit(0);
};
