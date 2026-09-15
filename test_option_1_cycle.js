const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a';

async function cdpCall(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const handler = (e) => {
      const res = JSON.parse(e.data);
      if (res.id === id) {
        ws.removeEventListener('message', handler);
        if (res.error) reject(res.error);
        else resolve(res.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

const delay = ms => new Promise(r => setTimeout(r, ms));

async function readChartData(ws) {
  const res = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      // 1. Symbol & Interval
      const symbolBtn = document.querySelector('#header-toolbar-symbol-search')?.innerText?.trim();
      const intervalBtn = document.querySelector('#header-toolbar-intervals button[class*="isActive"], button[data-name="header-toolbar-interval"][class*="isActive"]')?.innerText?.trim();

      // 2. Legend items
      const legendEls = Array.from(document.querySelectorAll('[data-name="legend-source-item"], [data-name="legend-series-item"], div[class*="item-"]')).map(el => el.innerText?.trim().replace(/\\s+/g, ' ')).filter(Boolean);

      // 3. Extract Main Candle OHLC
      const ohlcText = legendEls.find(l => l.includes('O ') && l.includes('H ') && l.includes('L ') && l.includes('C '));
      let ohlc = null;
      if (ohlcText) {
        const m = ohlcText.match(/O\\s+([\\d,\\.]+)\\s+H\\s+([\\d,\\.]+)\\s+L\\s+([\\d,\\.]+)\\s+C\\s+([\\d,\\.]+)/);
        if (m) {
          ohlc = {
            open: parseFloat(m[1].replace(/,/g, '')),
            high: parseFloat(m[2].replace(/,/g, '')),
            low: parseFloat(m[3].replace(/,/g, '')),
            close: parseFloat(m[4].replace(/,/g, ''))
          };
        }
      }

      // 4. Extract DEMA 200 value
      const demaText = legendEls.find(l => l.includes('DEMA 200') || l.includes('DEMA'));
      let demaValue = null;
      if (demaText) {
        const m = demaText.match(/DEMA.*?([\\d,\\.]+)$/);
        if (m) demaValue = parseFloat(m[1].replace(/,/g, ''));
      }

      // 5. Extract UT Bot Alerts status
      const utBotText = legendEls.find(l => l.includes('UT Bot Alerts'));
      
      // 6. Check buy/sell labels on chart
      // UT Bot creates shapes or labels on chart
      return {
        symbol: symbolBtn,
        interval: intervalBtn,
        ohlcText,
        ohlc,
        demaValue,
        utBotText,
        trendRegime: (ohlc && demaValue) ? (ohlc.close > demaValue ? 'BULLISH (BUY ONLY)' : 'BEARISH (SELL ONLY)') : 'UNKNOWN'
      };
    })()`,
    returnByValue: true
  });
  return res?.result?.value;
}

async function switchToSymbol(ws, targetSymbol) {
  const t0 = Date.now();
  // Open search
  await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const btn = document.querySelector('#header-toolbar-symbol-search');
      if (btn) btn.click();
    })()`
  });
  await delay(300);

  // Type targetSymbol
  await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const input = document.querySelector('input[data-role="search"], div[data-name="symbol-search-items-dialog"] input, div[role="dialog"] input[type="text"]');
      if (input) {
        input.focus();
        input.select();
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, '${targetSymbol}');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    })()`
  });
  await delay(500);

  // Click first result or press Enter
  await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const firstItem = document.querySelector('div[data-name="symbol-search-dialog-content-item"], [data-role="list-item"], div[class*="item-"][data-item-index="0"]');
      if (firstItem) firstItem.click();
    })()`
  });

  await cdpCall(ws, 'Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await cdpCall(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });

  // Wait for chart update
  await delay(1800);
  const elapsed = Date.now() - t0;
  return elapsed;
}

async function captureScreen(ws, filename) {
  const snap = await cdpCall(ws, 'Page.captureScreenshot', { format: 'png' });
  const fullPath = path.join(ARTIFACT_DIR, filename);
  fs.writeFileSync(fullPath, Buffer.from(snap.data, 'base64'));
  return fullPath;
}

async function main() {
  const tabs = await (await fetch('http://127.0.0.1:9222/json')).json();
  const tvTab = tabs.find(t => t.url.includes('tradingview.com/chart'));
  if (!tvTab) {
    console.error('TradingView tab not found');
    process.exit(1);
  }

  console.log('=== STARTING OPTION 1 TEST (SINGLE TAB SYMBOL SWITCHING) ===');
  console.log('Using Tab ID:', tvTab.id, tvTab.title);

  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/' + tvTab.id);
  await new Promise(r => ws.onopen = r);

  const results = {};
  const tStartAll = Date.now();

  // Asset 1: GOLD
  console.log('\n[1/3] Scanning GOLD...');
  const tGold = await switchToSymbol(ws, 'GOLD');
  const goldData = await readChartData(ws);
  await captureScreen(ws, 'opt1_gold_scan.png');
  results.gold = { ...goldData, switchTimeMs: tGold };
  console.log('GOLD Scanned:', results.gold);

  // Asset 2: BTCUSD
  console.log('\n[2/3] Scanning BTCUSD...');
  const tBtc = await switchToSymbol(ws, 'BTCUSD');
  const btcData = await readChartData(ws);
  await captureScreen(ws, 'opt1_btc_scan.png');
  results.btc = { ...btcData, switchTimeMs: tBtc };
  console.log('BTCUSD Scanned:', results.btc);

  // Asset 3: UKOIL
  console.log('\n[3/3] Scanning UKOIL...');
  const tOil = await switchToSymbol(ws, 'UKOIL');
  const oilData = await readChartData(ws);
  await captureScreen(ws, 'opt1_oil_scan.png');
  results.oil = { ...oilData, switchTimeMs: tOil };
  console.log('UKOIL Scanned:', results.oil);

  const totalTime = Date.now() - tStartAll;
  console.log('\n=== OPTION 1 TEST SUMMARY ===');
  console.log('Total cycle scan time for 3 assets:', totalTime, 'ms (~' + (totalTime/1000).toFixed(1) + 's)');
  console.log(JSON.stringify(results, null, 2));

  ws.close();
  process.exit(0);
}

main().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
