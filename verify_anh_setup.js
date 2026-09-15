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
        else resolve(res.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

const delay = ms => new Promise(r => setTimeout(r, ms));

async function verifyAll() {
  const tabsRes = await fetch('http://127.0.0.1:9222/json');
  const tabs = await tabsRes.json();
  const pages = tabs.filter(t => t.type === 'page');

  const tv = pages.find(p => p.url.includes('tradingview.com'));
  const exness = pages.find(p => p.url.includes('my.exness.com/webtrading'));

  console.log('=== BẮT ĐẦU KIỂM TRA TRẠNG THÁI HỆ THỐNG ===');

  // 1. Kiểm tra TradingView
  if (!tv) {
    console.log('❌ Không tìm thấy tab TradingView');
    return;
  }

  const tvWs = new WebSocket(`ws://127.0.0.1:9222/devtools/page/${tv.id}`);
  await new Promise(r => tvWs.onopen = r);

  const tvState = await cdpCall(tvWs, 'Runtime.evaluate', {
    expression: `(() => {
      try {
        const c = window._exposed_chartWidgetCollection;
        const w = c?.activeChartWidget?.value();
        const model = w?.model();
        if (!model) return { error: 'Chưa có chart model' };

        const ms = model.mainSeries();
        const sources = model.dataSources() || [];

        const sourceDetails = sources.map(s => {
          let title = 'N/A';
          try { title = s.title ? s.title() : (s.metaInfo ? s.metaInfo().description : s.name()); } catch (e) {}
          let lastVal = null;
          try { lastVal = s.data ? s.data().last() : null; } catch (e) {}
          return {
            title,
            id: s.id ? s.id() : null,
            hasData: !!lastVal
          };
        });

        // Legend texts
        const legendItems = Array.from(document.querySelectorAll('[data-name="legend-source-item"], [data-name="legend-series-item"], [class*="legendItem-"], [class*="item-"]'))
          .map(el => el.innerText.replace(/\\s+/g, ' '))
          .filter(t => t.includes('GOLD') || t.includes('DEMA') || t.includes('EMA') || t.includes('UT') || t.includes('Bot'));

        const auth = {
          user: window.user?.username,
          isLogged: window.is_authenticated
        };

        return {
          symbol: ms?.symbol(),
          interval: ms?.interval(),
          auth,
          sources: sourceDetails,
          legendItems
        };
      } catch (err) {
        return { error: err.message };
      }
    })()`,
    returnByValue: true
  });

  console.log('TradingView Analysis:', JSON.stringify(tvState.result?.value, null, 2));

  // Chụp ảnh bằng chứng TradingView
  const tvSnap = await cdpCall(tvWs, 'Page.captureScreenshot', { format: 'png' });
  if (tvSnap?.data) {
    const tvFile = path.join(ARTIFACT_DIR, 'tv_verified_live_now.png');
    fs.writeFileSync(tvFile, Buffer.from(tvSnap.data, 'base64'));
    console.log('📸 Đã lưu ảnh TradingView: tv_verified_live_now.png');
  }
  tvWs.close();

  // 2. Kiểm tra Exness
  if (exness) {
    const exWs = new WebSocket(`ws://127.0.0.1:9222/devtools/page/${exness.id}`);
    await new Promise(r => exWs.onopen = r);

    const exState = await cdpCall(exWs, 'Runtime.evaluate', {
      expression: `(() => {
        const text = document.body.innerText;
        const balanceMatch = text.match(/Số dư[\\s\\n]+([\\d,\\.]+)/i);
        const equityMatch = text.match(/Vốn[\\s\\n]+([\\d,\\.]+)/i);
        const rows = Array.from(document.querySelectorAll('[role="row"], tr, div[class*="Row"]')).map(r => r.innerText.replace(/\\s+/g, ' ')).filter(r => r.includes('Mua') || r.includes('Bán'));
        return {
          balance: balanceMatch ? balanceMatch[1] : 'N/A',
          equity: equityMatch ? equityMatch[1] : 'N/A',
          rows
        };
      })()`,
      returnByValue: true
    });

    console.log('Exness Analysis:', JSON.stringify(exState.result?.value, null, 2));
    exWs.close();
  }
}

verifyAll().catch(console.error);
