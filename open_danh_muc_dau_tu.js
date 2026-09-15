const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a';

function cdpCall(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const timeout = setTimeout(() => {
      ws.removeEventListener('message', handler);
      reject(new Error(`CDP Timeout for ${method}`));
    }, 10000);

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
  const ws = new WebSocket(`ws://127.0.0.1:9222/devtools/page/${exness.id}`);
  await new Promise(r => ws.onopen = r);

  // Click on the left navigation icon for Portfolio (index 1 or 2 on the left menu)
  const clickRes = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      // Find navigation items on the left bar
      const navItems = Array.from(document.querySelectorAll('nav a, nav button, [class*="nav"] a, [class*="nav"] button, [data-testid*="nav"]'));
      const portfolioLink = Array.from(document.querySelectorAll('*')).find(el => {
        const aria = (el.getAttribute('aria-label') || '').toLowerCase();
        const text = (el.innerText || '').toLowerCase();
        return aria.includes('danh mục') || text.includes('danh mục') || aria.includes('portfolio') || text.includes('portfolio');
      });

      if (portfolioLink) {
        portfolioLink.click();
        return { clicked: 'found portfolio' };
      }

      // Check all clickable icons in left vertical menu (x < 60)
      const leftIcons = Array.from(document.querySelectorAll('*')).filter(el => {
        const r = el.getBoundingClientRect();
        return r.left >= 0 && r.right <= 60 && r.top > 40 && r.height > 20 && r.height < 60;
      });

      return { navItemsCount: navItems.length, leftIconsCount: leftIcons.length };
    })()`,
    returnByValue: true
  });
  console.log('Nav search:', clickRes.result?.value);
  await delay(1200);

  const snap = await cdpCall(ws, 'Page.captureScreenshot', { format: 'png' });
  if (snap?.data) {
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'exness_portfolio_search.png'), Buffer.from(snap.data, 'base64'));
  }

  ws.close();
}

main().catch(console.error);
