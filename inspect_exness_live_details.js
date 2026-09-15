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

async function main() {
  const tabs = await (await fetch('http://127.0.0.1:9222/json')).json();
  const exness = tabs.find(t => t.type === 'page' && t.url.includes('my.exness.com/webtrading'));
  if (!exness) return console.log('No Exness tab');

  const ws = new WebSocket(`ws://127.0.0.1:9222/devtools/page/${exness.id}`);
  await new Promise(r => ws.onopen = r);

  // 1. Mở danh mục đầu tư bằng cách click vào nút Danh mục đầu tư ở cạnh trái hoặc nút +50.40 USD ở thanh trên
  console.log('Mở bảng danh mục đầu tư...');
  await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      // Click nút danh mục đầu tư ở cột trái (icon vali hoặc danh mục)
      const portfolioBtn = Array.from(document.querySelectorAll('button, div[role="button"]')).find(el => {
        const text = el.innerText || '';
        const aria = el.getAttribute('aria-label') || '';
        return text.includes('+50.40') || aria.includes('portfolio') || aria.includes('Danh mục') || text.includes('Danh mục');
      });
      if (portfolioBtn) {
        portfolioBtn.click();
        return { clicked: portfolioBtn.innerText || portfolioBtn.getAttribute('aria-label') };
      }
      return { clicked: false };
    })()`,
    returnByValue: true
  });
  await delay(1500);

  // 2. Đọc các tab trong bảng: Mở, Đang chờ, Đã đóng
  const tableData = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const tabs = Array.from(document.querySelectorAll('*')).filter(el => {
        return (el.children.length === 0 || el.children.length === 1) && 
               (el.innerText?.trim() === 'Mở' || el.innerText?.startsWith('Mở ') || el.innerText?.trim() === 'Đã đóng');
      }).map(el => el.innerText.trim());

      const rows = Array.from(document.querySelectorAll('[role="row"], tr, div[class*="Row"]')).map(r => r.innerText.replace(/\\s+/g, ' '));
      const activeRows = rows.filter(r => r.includes('Mua') || r.includes('Bán') || r.includes('XAU/USD') || r.includes('USOIL'));

      const balanceMatch = document.body.innerText.match(/Số dư[\\s\\n]+([\\d,\\.]+)/i);
      const equityMatch = document.body.innerText.match(/Vốn[\\s\\n]+([\\d,\\.]+)/i);

      return {
        topBalance: document.querySelector('[class*="balance"], [class*="Balance"]')?.innerText,
        balanceText: balanceMatch ? balanceMatch[1] : null,
        equityText: equityMatch ? equityMatch[1] : null,
        tabs,
        activeRows: activeRows.slice(0, 10)
      };
    })()`,
    returnByValue: true
  });

  console.log('--- CHI TIẾT TÀI KHOẢN VÀ VỊ THẾ HIỆN TẠI ---');
  console.log(JSON.stringify(tableData.result?.value, null, 2));

  const snap = await cdpCall(ws, 'Page.captureScreenshot', { format: 'png' });
  if (snap?.data) {
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'exness_live_portfolio_opened.png'), Buffer.from(snap.data, 'base64'));
    console.log('Đã lưu ảnh chụp: exness_live_portfolio_opened.png');
  }

  ws.close();
}

main().catch(console.error);
