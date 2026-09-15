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

async function handleModal() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/D8732812EFF8977614EA114107B74D4C');
  await new Promise(r => ws.onopen = r);

  // Click "Có" button
  const clickRes = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const coBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Có');
      if (coBtn) {
        coBtn.click();
        return { clickedCo: true };
      }
      return { noCo: true };
    })()`,
    returnByValue: true
  });
  console.log('Click Có:', clickRes);

  await delay(1000);

  // Expand the XAU/USD row to see the individual positions
  const expandRes = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const expandBtn = document.querySelector('[class*="group"], [role="row"] svg, [role="row"] button');
      if (expandBtn) expandBtn.click();
      return { ok: true };
    })()`,
    returnByValue: true
  });
  console.log('Expand row:', expandRes);

  await delay(1000);

  const snap = await cdpCall(ws, 'Page.captureScreenshot', { format: 'png' });
  if (snap?.data) {
    fs.writeFileSync('C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a/exness_after_modal.png', Buffer.from(snap.data, 'base64'));
  }

  ws.close();
}

handleModal().catch(console.error);
