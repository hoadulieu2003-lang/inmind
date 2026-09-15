const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a';

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
        else resolve(res.result?.result?.value !== undefined ? res.result.result.value : res.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function executeSingleOrder(ws, config) {
  console.log(`\n========================================`);
  console.log(`>>> BẮT ĐẦU VÀO LỆNH TEST CHO: ${config.symbol}`);
  console.log(`========================================`);

  // 1. Chuyển symbol trên Exness qua click tab trên cùng hoặc danh sách theo dõi
  const switchRes = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      // Tìm tab trên cùng
      const topTabs = Array.from(document.querySelectorAll('*')).filter(el => {
        return (el.children.length === 0 || el.children.length === 1) && 
               (el.innerText === '${config.symbol}' || el.innerText === '${config.altSymbol}');
      });
      if (topTabs.length > 0) {
        topTabs[0].click();
        return { switchedVia: 'topTab', text: topTabs[0].innerText };
      }
      return { error: 'Tab not found' };
    })()`,
    returnByValue: true
  });
  console.log('Switch Result:', switchRes);
  await delay(2000);

  // 2. Kích hoạt panel MUA (BUY)
  const clickBuyBtn = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const buyBtn = document.querySelector('.OrderButton_buy__f2c8b, [class*="OrderButton_buy"]');
      if (buyBtn) {
        buyBtn.click();
        return { clickedBuy: true, text: buyBtn.innerText.replace(/\\s+/g, ' ') };
      }
      return { clickedBuy: false };
    })()`,
    returnByValue: true
  });
  console.log('Click Buy Button:', clickBuyBtn);
  await delay(800);

  // 3. Đọc giá Mua hiện tại
  const priceInfo = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const buyBtn = document.querySelector('.OrderButton_buy__f2c8b, [class*="OrderButton_buy"]');
      const text = buyBtn ? buyBtn.innerText.replace(/\\s+/g, ' ') : '';
      const price = parseFloat(text.replace(/[^0-9.]/g, ''));
      return { text, price };
    })()`,
    returnByValue: true
  });
  console.log('Current Ask Price:', priceInfo);

  const entryPrice = priceInfo.price;
  if (!entryPrice || isNaN(entryPrice)) {
    throw new Error(`Không đọc được giá Mua cho ${config.symbol}`);
  }

  // 4. Tính Stop-Loss và Take-Profit theo khoảng giá định trước
  const sl = +(entryPrice - config.slDistance).toFixed(config.decimals);
  const tp = +(entryPrice + config.tpDistance).toFixed(config.decimals);
  console.log(`Thông số lệnh: Volume: ${config.volume} | Entry: ${entryPrice} | SL: ${sl} | TP: ${tp}`);

  // 5. Điền Volume, SL, TP qua selector nhãn và synthetic tracker
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

      const rVol = setVal(volInput, '${config.volume}');
      const rTP = setVal(tpInput, '${tp}');
      const rSL = setVal(slInput, '${sl}');

      return {
        rVol, volVal: volInput ? volInput.value : null,
        rTP, tpVal: tpInput ? tpInput.value : null,
        rSL, slVal: slInput ? slInput.value : null
      };
    })()`,
    returnByValue: true
  });
  console.log('Fill Result:', fillRes);
  await delay(800);

  // 6. Nhấn nút Xác nhận vào lệnh
  const confirmRes = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const confirmBtn = Array.from(document.querySelectorAll('button')).find(b => {
        return b.innerText.includes('Xác nhận Mua') || b.innerText.includes('Xác nhận');
      });
      if (confirmBtn) {
        confirmBtn.click();
        return { success: true, text: confirmBtn.innerText.trim() };
      }
      return { success: false, error: 'Không thấy nút xác nhận' };
    })()`,
    returnByValue: true
  });
  console.log('Confirm Execution Result:', confirmRes);
  await delay(1500);

  // 7. Chụp ảnh minh chứng lệnh
  const snap = await cdpCall(ws, 'Page.captureScreenshot', { format: 'png' });
  const filename = `test_order_${config.symbol.replace('/', '_')}_${Date.now()}.png`;
  const filePath = path.join(ARTIFACT_DIR, filename);
  if (snap?.data) {
    fs.writeFileSync(filePath, Buffer.from(snap.data, 'base64'));
    console.log(`Đã lưu ảnh minh chứng: ${filePath}`);
  }

  return {
    symbol: config.symbol,
    volume: config.volume,
    entryPrice,
    stopLoss: sl,
    takeProfit: tp,
    confirm: confirmRes,
    screenshot: filePath
  };
}

async function main() {
  const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/D8732812EFF8977614EA114107B74D4C');
  await new Promise(r => ws.onopen = r);

  const configs = [
    {
      symbol: 'XAU/USD',
      altSymbol: 'GOLD',
      volume: '0.01',
      slDistance: 5.00,   // SL 5 giá dưới Entry
      tpDistance: 7.50,   // TP 7.5 giá trên Entry (R:R 1.5)
      decimals: 2
    },
    {
      symbol: 'BTC',
      altSymbol: 'BTCUSD',
      volume: '0.01',
      slDistance: 500.0,  // SL 500 USD dưới Entry
      tpDistance: 750.0,  // TP 750 USD trên Entry (R:R 1.5)
      decimals: 1
    },
    {
      symbol: 'USOIL',
      altSymbol: 'UKOIL',
      volume: '0.01',
      slDistance: 0.80,   // SL 0.80 USD dưới Entry
      tpDistance: 1.20,   // TP 1.20 USD trên Entry (R:R 1.5)
      decimals: 2
    }
  ];

  const results = [];

  for (const cfg of configs) {
    try {
      const res = await executeSingleOrder(ws, cfg);
      results.push(res);
      await delay(1500);
    } catch (err) {
      console.error(`Lỗi vào lệnh cho ${cfg.symbol}:`, err.message);
    }
  }

  // Chuyển về tab "Mở" ở bảng dưới để chụp toàn cảnh cả 3 vị thế đang chạy
  console.log('\n>>> Đang chuyển về bảng Vị Thế Mở để chụp toàn cảnh 3 lệnh...');
  await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const tabs = Array.from(document.querySelectorAll('button, div[role="tab"]'));
      const openTab = tabs.find(t => t.innerText && t.innerText.includes('Mở'));
      if (openTab) openTab.click();
    })()`
  });
  await delay(1200);

  const finalSnap = await cdpCall(ws, 'Page.captureScreenshot', { format: 'png' });
  const finalSnapPath = path.join(ARTIFACT_DIR, 'exness_3_test_orders_active.png');
  if (finalSnap?.data) {
    fs.writeFileSync(finalSnapPath, Buffer.from(finalSnap.data, 'base64'));
    console.log(`Đã lưu ảnh toàn cảnh 3 lệnh: ${finalSnapPath}`);
  }

  // Đọc danh sách 3 vị thế
  const positionsRes = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const rows = Array.from(document.querySelectorAll('[role="row"]')).map(r => r.innerText.replace(/\\s+/g, ' '));
      return rows.slice(0, 10);
    })()`,
    returnByValue: true
  });
  console.log('\n=== DANH SÁCH VỊ THẾ SAU KHI VÀO 3 LỆNH ===');
  console.log(JSON.stringify(positionsRes, null, 2));

  ws.close();
}

main().catch(console.error);
