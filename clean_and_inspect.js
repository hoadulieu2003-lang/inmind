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

async function run() {
  // 1. TradingView: dismiss modal
  const tvWs = new WebSocket('ws://127.0.0.1:9222/devtools/page/FBB66DD7C646B5BFAE8DE40058ACCCC6');
  await new Promise(r => tvWs.onopen = r);

  // Send Escape key
  await cdpCall(tvWs, 'Input.dispatchKeyEvent', { type: 'keyDown', windowsVirtualKeyCode: 27, code: 'Escape', key: 'Escape' });
  await cdpCall(tvWs, 'Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 27, code: 'Escape', key: 'Escape' });
  
  // Also try clicking close button if any modal
  await cdpCall(tvWs, 'Runtime.evaluate', {
    expression: `(() => {
      const closeBtn = document.querySelector('[data-name="close"]');
      if (closeBtn) closeBtn.click();
    })()`
  });

  await new Promise(r => setTimeout(r, 600));

  const tvSnap = await cdpCall(tvWs, 'Page.captureScreenshot', { format: 'png' });
  if (tvSnap?.data) {
    fs.writeFileSync('C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a/tv_clean_watchlist.png', Buffer.from(tvSnap.data, 'base64'));
    console.log('Saved clean TV screenshot');
  }
  tvWs.close();

  // 2. Exness: click "Mở" tab in bottom table
  const exWs = new WebSocket('ws://127.0.0.1:9222/devtools/page/D8732812EFF8977614EA114107B74D4C');
  await new Promise(r => exWs.onopen = r);

  const clickOpenTab = await cdpCall(exWs, 'Runtime.evaluate', {
    expression: `(() => {
      const tabs = Array.from(document.querySelectorAll('button, div[role="tab"]'));
      const openTab = tabs.find(t => t.innerText && t.innerText.includes('Mở'));
      if (openTab) {
        openTab.click();
        return { clicked: openTab.innerText };
      }
      return { error: 'not found' };
    })()`,
    returnByValue: true
  });
  console.log('Exness Click Open Tab:', clickOpenTab?.result?.value);

  await new Promise(r => setTimeout(r, 800));

  const tableData = await cdpCall(exWs, 'Runtime.evaluate', {
    expression: `(() => {
      const rows = Array.from(document.querySelectorAll('tbody tr, div[role="row"]')).map(r => r.innerText.replace(/\\s+/g, ' '));
      return { rows };
    })()`,
    returnByValue: true
  });
  console.log('Exness Open Positions Rows:', JSON.stringify(tableData?.result?.value, null, 2));

  const exSnap = await cdpCall(exWs, 'Page.captureScreenshot', { format: 'png' });
  if (exSnap?.data) {
    fs.writeFileSync('C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a/exness_open_positions.png', Buffer.from(exSnap.data, 'base64'));
    console.log('Saved Exness Open Positions screenshot');
  }
  exWs.close();
}

run().catch(console.error);
