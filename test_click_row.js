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

async function clickWatchlistRow(symbolText) {
  const tvWs = new WebSocket('ws://127.0.0.1:9222/devtools/page/FBB66DD7C646B5BFAE8DE40058ACCCC6');
  await new Promise(r => tvWs.onopen = r);

  const coords = await cdpCall(tvWs, 'Runtime.evaluate', {
    expression: `(() => {
      const el = Array.from(document.querySelectorAll('span[class*="symbolNameText"]')).find(s => s.innerText.trim() === '${symbolText}');
      if (el) {
        const rect = el.getBoundingClientRect();
        return { x: rect.x + 20, y: rect.y + rect.height / 2 };
      }
      return null;
    })()`,
    returnByValue: true
  });

  console.log(`Coords for ${symbolText}:`, coords);

  if (coords) {
    // Dispatch mouse click
    await cdpCall(tvWs, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: coords.x, y: coords.y, button: 'left', clickCount: 1 });
    await cdpCall(tvWs, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: coords.x, y: coords.y, button: 'left', clickCount: 1 });
    await delay(2000);

    const checkSymbol = await cdpCall(tvWs, 'Runtime.evaluate', {
      expression: `(() => {
        const w = window._exposed_chartWidgetCollection?.activeChartWidget?.value();
        return w?.model()?.mainSeries()?.symbol();
      })()`,
      returnByValue: true
    });
    console.log(`Active Chart Symbol after clicking ${symbolText}:`, checkSymbol);
  }

  tvWs.close();
}

async function main() {
  await clickWatchlistRow('BTCUSD');
  await delay(1500);
  await clickWatchlistRow('UKOIL');
  await delay(1500);
  await clickWatchlistRow('GOLD');
}

main().catch(console.error);
