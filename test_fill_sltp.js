const fs = require('fs');

function cdpCall(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const handler = (e) => {
      const res = JSON.parse(e.data);
      if (res.id === id) {
        ws.removeEventListener('message', handler);
        if (res.error) reject(res.error);
        else resolve(res.result?.result?.value !== undefined ? res.result.result.value : res.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function testFillInputs() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/D8732812EFF8977614EA114107B74D4C');
  await new Promise(r => ws.onopen = r);

  const fillRes = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      function findInputByLabel(labelText) {
        const elements = Array.from(document.querySelectorAll('*')).filter(el => {
          return el.children.length === 0 && el.innerText && el.innerText.trim() === labelText;
        });
        for (const el of elements) {
          let parent = el.parentElement;
          for (let i = 0; i < 6 && parent; i++) {
            const input = parent.querySelector('input');
            if (input) return input;
            parent = parent.parentElement;
          }
        }
        return null;
      }

      function setVal(input, val) {
        if (!input) return false;
        input.focus();
        const lastVal = input.value;
        input.value = val;
        const tracker = input._valueTracker;
        if (tracker) tracker.setValue(lastVal);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('blur', { bubbles: true }));
        return true;
      }

      const volInput = findInputByLabel('Khối lượng');
      const tpInput = findInputByLabel('Chốt lời');
      const slInput = findInputByLabel('Cắt lỗ');

      const rVol = setVal(volInput, '0.01');
      const rTP = setVal(tpInput, '4380.00');
      const rSL = setVal(slInput, '4360.00');

      return {
        rVol, volVal: volInput?.value,
        rTP, tpVal: tpInput?.value,
        rSL, slVal: slInput?.value
      };
    })()`,
    returnByValue: true
  });

  console.log('Fill Result:', JSON.stringify(fillRes, null, 2));

  await delay(1000);
  const snap = await cdpCall(ws, 'Page.captureScreenshot', { format: 'png' });
  if (snap?.data) {
    fs.writeFileSync('C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a/exness_filled_preview.png', Buffer.from(snap.data, 'base64'));
    console.log('Saved exness_filled_preview.png');
  }

  ws.close();
}

testFillInputs().catch(console.error);
