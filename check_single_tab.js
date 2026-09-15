const fs = require('fs');

async function main() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/FBB66DD7C646B5BFAE8DE40058ACCCC6');

  await new Promise((resolve, reject) => {
    ws.onopen = () => {
      // 1. Check for modal and click reconnect if present
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: {
          expression: `(() => {
            const reconnectBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Khôi phục kết nối'));
            if (reconnectBtn) {
              reconnectBtn.click();
              return { clickedReconnect: true };
            }
            return { clickedReconnect: false };
          })()`,
          returnByValue: true
        }
      }));
    };

    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.id === 1) {
        console.log('Reconnect status:', data.result?.result?.value);
        setTimeout(() => {
          ws.send(JSON.stringify({ id: 2, method: 'Page.captureScreenshot', params: { format: 'png' } }));
        }, 1500);
      } else if (data.id === 2) {
        fs.writeFileSync('C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a/single_tab_clean.png', Buffer.from(data.result.data, 'base64'));
        console.log('SUCCESS: Saved single_tab_clean.png');
        ws.close();
        resolve();
      }
    };

    ws.onerror = reject;
  });
}

main().catch(console.error);
