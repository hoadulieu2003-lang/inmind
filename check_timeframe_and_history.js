async function main() {
  const tabs = await (await fetch('http://127.0.0.1:9222/json')).json();
  
  for (const t of tabs) {
    if (t.url.includes('tradingview.com/chart')) {
      const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/' + t.id);
      await new Promise(res => {
        ws.onopen = () => {
          ws.send(JSON.stringify({
            id: 1,
            method: 'Runtime.evaluate',
            params: {
              expression: `(() => {
                const buttons = Array.from(document.querySelectorAll('#header-toolbar-intervals button, button[data-name="header-toolbar-interval"]'));
                const activeBtn = buttons.find(b => b.classList.contains('isActive') || b.getAttribute('aria-checked') === 'true' || b.className.includes('isActive') || b.className.includes('selected'));
                return {
                  title: document.title,
                  activeInterval: activeBtn ? activeBtn.innerText : 'Unknown',
                  buttons: buttons.map(b => ({ text: b.innerText, class: b.className, checked: b.getAttribute('aria-checked') }))
                };
              })()`,
              returnByValue: true
            }
          }));
        };
        ws.onmessage = (e) => {
          const r = JSON.parse(e.data);
          console.log('--- TV TAB ---');
          console.log(JSON.stringify(r.result?.result?.value, null, 2));
          ws.close();
          res();
        };
        ws.onerror = (err) => {
          console.error(err);
          res();
        };
      });
    }
  }

  // Check Exness history / closed positions
  const exnessTab = tabs.find(t => t.url.includes('exness.com/webtrading'));
  if (exnessTab) {
    const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/' + exnessTab.id);
    await new Promise(res => {
      ws.onopen = () => {
        ws.send(JSON.stringify({
          id: 2,
          method: 'Runtime.evaluate',
          params: {
            expression: `(() => {
              // Click closed orders tab if possible, or read text
              const tabsBottom = Array.from(document.querySelectorAll('button, div[role="tab"]')).map(el => ({ text: el.innerText, role: el.getAttribute('role') }));
              const closedTab = Array.from(document.querySelectorAll('button, div[role="tab"]')).find(el => el.innerText && (el.innerText.includes('Đã đóng') || el.innerText.includes('Lịch sử') || el.innerText.includes('Closed') || el.innerText.includes('History')));
              
              if (closedTab) {
                closedTab.click();
              }
              
              return {
                availableBottomTabs: tabsBottom.filter(t => t.text && (t.text.includes('Lệnh') || t.text.includes('Đã') || t.text.includes('Vị thế'))),
                closedTabFound: !!closedTab
              };
            })()`,
            returnByValue: true
          }
        }));
      };
      ws.onmessage = async (e) => {
        const r = JSON.parse(e.data);
        console.log('--- EXNESS TAB ---');
        console.log(JSON.stringify(r.result?.result?.value, null, 2));
        
        // Wait 1s and read closed orders table
        setTimeout(() => {
          ws.send(JSON.stringify({
            id: 3,
            method: 'Runtime.evaluate',
            params: {
              expression: `(() => {
                const rows = Array.from(document.querySelectorAll('tr, div[role="row"], tbody tr')).map(r => r.innerText.trim().replace(/\\s+/g, ' '));
                const balanceEl = document.body.innerText.match(/Số dư[\\s\\n]+([\\d,\\.]+)/i);
                const equityEl = document.body.innerText.match(/Vốn[\\s\\n]+([\\d,\\.]+)/i);
                return {
                  balance: balanceEl ? balanceEl[0] : 'N/A',
                  equity: equityEl ? equityEl[0] : 'N/A',
                  closedRows: rows.filter(r => r.includes('XAU/USD') || r.includes('5087753817') || r.includes('43'))
                };
              })()`,
              returnByValue: true
            }
          }));
        }, 1000);
      };
      // second message handler
      let count = 0;
      const originalHandler = ws.onmessage;
      ws.onmessage = (e) => {
        count++;
        const r = JSON.parse(e.data);
        if (count === 1) {
          console.log('Exness tabs:', JSON.stringify(r.result?.result?.value, null, 2));
          setTimeout(() => {
            ws.send(JSON.stringify({
              id: 3,
              method: 'Runtime.evaluate',
              params: {
                expression: `(() => {
                  const rows = Array.from(document.querySelectorAll('tr, div[role="row"], tbody tr')).map(r => r.innerText.trim().replace(/\\s+/g, ' '));
                  const balanceEl = document.body.innerText.match(/Số dư[\\s\\n]+([\\d,\\.]+)/i);
                  const equityEl = document.body.innerText.match(/Vốn[\\s\\n]+([\\d,\\.]+)/i);
                  return {
                    balance: balanceEl ? balanceEl[0] : 'N/A',
                    equity: equityEl ? equityEl[0] : 'N/A',
                    closedRows: rows.filter(r => r.includes('XAU/USD') || r.includes('5087753817') || r.includes('43'))
                  };
                })()`,
                returnByValue: true
              }
            }));
          }, 1200);
        } else if (count === 2) {
          console.log('Exness closed orders:', JSON.stringify(r.result?.result?.value, null, 2));
          ws.close();
          res();
        }
      };
    });
  }
}

main().catch(console.error);
