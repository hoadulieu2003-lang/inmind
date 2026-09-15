const fs = require('fs');

function cdpCall(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const handler = (e) => {
      const res = JSON.parse(e.data);
      if (res.id === id) {
        ws.removeEventListener('message', handler);
        resolve(res.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function testSelectors() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/D8732812EFF8977614EA114107B74D4C');
  await new Promise(r => ws.onopen = r);

  const res = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      function findInputByLabel(labelText) {
        const elements = Array.from(document.querySelectorAll('*')).filter(el => {
          return el.children.length === 0 && el.innerText && el.innerText.trim() === labelText;
        });
        for (const el of elements) {
          let parent = el.parentElement;
          for (let i = 0; i < 6 && parent; i++) {
            const input = parent.querySelector('input');
            if (input) return { label: labelText, id: input.id, value: input.value, placeholder: input.placeholder };
            parent = parent.parentElement;
          }
        }
        return null;
      }

      return {
        volume: findInputByLabel('Khối lượng'),
        takeProfit: findInputByLabel('Chốt lời'),
        stopLoss: findInputByLabel('Cắt lỗ')
      };
    })()`,
    returnByValue: true
  });

  console.log('Detected inputs by label:', JSON.stringify(res?.result?.value, null, 2));
  ws.close();
}

testSelectors().catch(console.error);
