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

async function inspectTVDeep() {
  const tabsRes = await fetch('http://127.0.0.1:9222/json');
  const tabs = await tabsRes.json();
  const tv = tabs.find(t => t.type === 'page' && t.url.includes('tradingview.com'));
  if (!tv) return console.log('Không tìm thấy tab TradingView');

  const ws = new WebSocket(`ws://127.0.0.1:9222/devtools/page/${tv.id}`);
  await new Promise(r => ws.onopen = r);

  // 1. Kiểm tra toàn bộ dataSources trong Model của TradingView
  const modelInfo = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      try {
        const c = window._exposed_chartWidgetCollection;
        const w = c?.activeChartWidget?.value();
        const model = w?.model();
        if (!model) return { error: 'No model found' };

        const ms = model.mainSeries();
        const sources = model.dataSources() || [];

        const sourceList = sources.map(s => {
          let title = 'N/A';
          try { title = s.title ? s.title() : (s.metaInfo ? s.metaInfo().description : s.name()); } catch (e) {}
          let isVisible = true;
          try { isVisible = typeof s.isVisible === 'function' ? s.isVisible() : true; } catch (e) {}
          let isStudy = false;
          try { isStudy = typeof s.isStudy === 'function' ? s.isStudy() : false; } catch (e) {}
          return {
            title,
            isStudy,
            isVisible,
            id: s.id ? s.id() : null
          };
        });

        // Kiểm tra xem có dialog / modal nào đang mở không (ví dụ popup giới hạn chỉ báo hoặc lỗi)
        const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [data-dialog-name], [class*="dialog-"], [class*="modal-"]')).map(d => ({
          text: d.innerText?.slice(0, 150),
          className: d.className
        }));

        // Legend items trên màn hình
        const legendItems = Array.from(document.querySelectorAll('[data-name="legend-source-item"], [data-name="legend-series-item"], [class*="legendItem-"]')).map(el => el.innerText.replace(/\\s+/g, ' '));

        return {
          symbol: ms?.symbol(),
          interval: ms?.interval(),
          sourceCount: sources.length,
          sources: sourceList,
          dialogs,
          legendItems
        };
      } catch (err) {
        return { error: err.message };
      }
    })()`,
    returnByValue: true
  });

  console.log('=== KẾT QUẢ PHÂN TÍCH CHUYÊN SÂU TRADINGVIEW ===');
  console.log(JSON.stringify(modelInfo.result?.value, null, 2));

  // 2. Chụp ảnh màn hình trực quan hiện tại
  const snap = await cdpCall(ws, 'Page.captureScreenshot', { format: 'png' });
  if (snap?.data) {
    const filename = 'tv_deep_inspection.png';
    fs.writeFileSync(path.join(ARTIFACT_DIR, filename), Buffer.from(snap.data, 'base64'));
    console.log(`Đã lưu ảnh chụp: ${filename}`);
  }

  ws.close();
}

inspectTVDeep().catch(console.error);
