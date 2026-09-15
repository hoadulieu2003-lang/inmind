const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/D8732812EFF8977614EA114107B74D4C');

ws.onopen = () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        const vol = document.querySelector('label[for*="4e"]') || document.querySelector('input[value="0.01"]');
        const tp = document.querySelector('label[for*="4f"]') || Array.from(document.querySelectorAll('label')).find(l => l.innerText.includes('Chốt lời'));
        const sl = document.querySelector('label[for*="4h"]') || Array.from(document.querySelectorAll('label')).find(l => l.innerText.includes('Cắt lỗ'));

        const tpInput = tp ? document.getElementById(tp.getAttribute('for')) : null;
        const slInput = sl ? document.getElementById(sl.getAttribute('for')) : null;

        return {
          volumeInput: vol ? (vol.tagName === 'INPUT' ? vol.value : vol.getAttribute('for')) : null,
          tpInputId: tpInput ? tpInput.id : null,
          tpInputValue: tpInput ? tpInput.value : null,
          slInputId: slInput ? slInput.id : null,
          slInputValue: slInput ? slInput.value : null
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
