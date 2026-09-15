const fs = require('fs');

function cdpCall(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const timeout = setTimeout(() => {
      ws.removeEventListener('message', handler);
      reject(new Error(`CDP Timeout for ${method}`));
    }, 15000);

    const handler = (e) => {
      const res = JSON.parse(e.data);
      if (res.id === id) {
        clearTimeout(timeout);
        ws.removeEventListener('message', handler);
        if (res.error) reject(res.error);
        else resolve(res.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function inspectOrderPanel() {
  const exWs = new WebSocket('ws://127.0.0.1:9222/devtools/page/D8732812EFF8977614EA114107B74D4C');
  await new Promise(r => exWs.onopen = r);

  const panelInfo = await cdpCall(exWs, 'Runtime.evaluate', {
    expression: `(() => {
      // Find all elements in the right panel
      const panel = document.querySelector('[data-testid*="order-placement"], [class*="OrderPlacement"], [class*="OrderPanel"]') || document.body;
      const inputs = Array.from(document.querySelectorAll('input')).map(i => ({
        id: i.id,
        name: i.name,
        type: i.type,
        value: i.value,
        placeholder: i.placeholder,
        disabled: i.disabled,
        ariaLabel: i.getAttribute('aria-label')
      }));

      const toggles = Array.from(document.querySelectorAll('[role="switch"], input[type="checkbox"], [class*="toggle"], [class*="Switch"]')).map(s => ({
        role: s.getAttribute('role'),
        checked: s.getAttribute('aria-checked') || s.checked,
        text: s.innerText || s.parentElement?.innerText
      }));

      const buttons = Array.from(document.querySelectorAll('button')).map(b => ({
        text: b.innerText.trim(),
        ariaLabel: b.getAttribute('aria-label')
      })).filter(b => b.text.length > 0 && b.text.length < 40);

      return { inputs, toggles, buttons: buttons.slice(0, 30) };
    })()`,
    returnByValue: true
  });

  console.log('Order Panel Inputs:', JSON.stringify(panelInfo.result.value.inputs, null, 2));
  console.log('Toggles:', JSON.stringify(panelInfo.result.value.toggles, null, 2));
  
  exWs.close();
}

inspectOrderPanel().catch(console.error);
