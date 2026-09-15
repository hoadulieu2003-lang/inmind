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

async function editGoldPositionSLTP() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/D8732812EFF8977614EA114107B74D4C');
  await new Promise(r => ws.onopen = r);

  // Click the pencil button in the open positions row
  const clickEdit = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const pencil = document.querySelector('tbody button[aria-label*="Sửa"], tbody button[title*="Sửa"], tbody svg[data-name*="edit"]')?.closest('button') ||
                     Array.from(document.querySelectorAll('tbody button')).find(b => b.innerHTML.includes('path') && !b.innerText.includes('X'));
      if (pencil) {
        pencil.click();
        return { clicked: true, ariaLabel: pencil.getAttribute('aria-label') };
      }
      return { clicked: false };
    })()`,
    returnByValue: true
  });
  console.log('Click Edit Result:', clickEdit);
  await delay(1000);

  // Take screenshot of edit dialog
  const snap = await cdpCall(ws, 'Page.captureScreenshot', { format: 'png' });
  if (snap?.data) {
    fs.writeFileSync('C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a/exness_edit_position_modal.png', Buffer.from(snap.data, 'base64'));
    console.log('Saved exness_edit_position_modal.png');
  }

  // Check inputs in modal
  const modalInputs = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const dialog = document.querySelector('[role="dialog"], [class*="Modal"], [class*="drawer"]');
      if (!dialog) return { noDialog: true };
      const inputs = Array.from(dialog.querySelectorAll('input')).map(i => ({
        id: i.id, value: i.value, placeholder: i.placeholder
      }));
      const buttons = Array.from(dialog.querySelectorAll('button')).map(b => b.innerText.trim());
      return { inputs, buttons };
    })()`,
    returnByValue: true
  });
  console.log('Modal elements:', modalInputs);

  ws.close();
}

editGoldPositionSLTP().catch(console.error);
