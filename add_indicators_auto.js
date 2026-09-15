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

const delay = ms => new Promise(r => setTimeout(r, ms));

async function addIndicators() {
  const tabsRes = await fetch('http://127.0.0.1:9222/json');
  const tabs = await tabsRes.json();
  const tv = tabs.find(t => t.type === 'page' && t.url.includes('tradingview.com'));
  if (!tv) return console.log('Không tìm thấy tab TV');

  const ws = new WebSocket(`ws://127.0.0.1:9222/devtools/page/${tv.id}`);
  await new Promise(r => ws.onopen = r);

  // 1. Mở dialog Indicators
  console.log('1. Mở hộp thoại Indicators...');
  await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const btn = document.querySelector('button[data-name="open-indicators-dialog"]') || 
                  document.querySelector('#header-toolbar-indicators') ||
                  Array.from(document.querySelectorAll('button')).find(b => b.getAttribute('aria-label')?.includes('Chỉ báo') || b.getAttribute('aria-label')?.includes('Indicators'));
      if (btn) btn.click();
      return { clicked: !!btn };
    })()`
  });
  await delay(1200);

  // 2. Tìm kiếm DEMA (Double Exponential Moving Average)
  console.log('2. Tìm kiếm và thêm DEMA...');
  await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const input = document.querySelector('input[data-role="search"]') || document.querySelector('div[role="dialog"] input[type="text"]');
      if (input) {
        input.value = 'Double EMA';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return { typed: 'Double EMA' };
      }
      return { error: 'No search input' };
    })()`
  });
  await delay(1500);

  // Click vào kết quả Double EMA đầu tiên
  await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const results = Array.from(document.querySelectorAll('div[data-name="indicator-search-result-item"], [data-role="list-item"], [class*="item-"]'));
      const demaItem = results.find(r => r.innerText && (r.innerText.includes('Double Exponential Moving Average') || r.innerText.includes('Double EMA') || r.innerText.includes('Đường trung bình hàm mũ đôi')));
      if (demaItem) {
        demaItem.click();
        return { added: demaItem.innerText.split('\\n')[0] };
      }
      return { notFound: true, count: results.length };
    })()`
  });
  await delay(1000);

  // 3. Tìm kiếm và thêm UT Bot Alerts
  console.log('3. Tìm kiếm và thêm UT Bot Alerts...');
  await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const input = document.querySelector('input[data-role="search"]') || document.querySelector('div[role="dialog"] input[type="text"]');
      if (input) {
        input.value = 'UT Bot Alerts';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return { typed: 'UT Bot Alerts' };
      }
      return { error: 'No search input' };
    })()`
  });
  await delay(1500);

  // Click vào kết quả UT Bot Alerts
  await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const results = Array.from(document.querySelectorAll('div[data-name="indicator-search-result-item"], [data-role="list-item"], [class*="item-"]'));
      const utItem = results.find(r => r.innerText && r.innerText.includes('UT Bot Alerts'));
      if (utItem) {
        utItem.click();
        return { added: utItem.innerText.split('\\n')[0] };
      }
      return { notFound: true, count: results.length };
    })()`
  });
  await delay(1000);

  // 4. Đóng dialog
  console.log('4. Đóng hộp thoại Indicators...');
  await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const closeBtn = document.querySelector('button[data-name="close"]');
      if (closeBtn) closeBtn.click();
      // Hoặc phím Escape
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true }));
    })()`
  });
  await delay(1500);

  // 5. Kiểm tra các data sources đã thêm
  const sourcesRes = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const c = window._exposed_chartWidgetCollection;
      const w = c?.activeChartWidget?.value();
      const model = w?.model();
      return model?.dataSources()?.map(s => s.title ? s.title() : (s.metaInfo ? s.metaInfo().description : s.name()));
    })()`,
    returnByValue: true
  });

  console.log('Danh sách chỉ báo hiện hữu trên biểu đồ:', sourcesRes.result?.value);

  const snap = await cdpCall(ws, 'Page.captureScreenshot', { format: 'png' });
  if (snap?.data) {
    fs.writeFileSync('C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a/tv_with_indicators.png', Buffer.from(snap.data, 'base64'));
    console.log('Đã lưu ảnh chụp: tv_with_indicators.png');
  }

  ws.close();
}

addIndicators().catch(console.error);
