const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/B319A6A7C133DE20350E64CC9175762A');

ws.onopen = () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        // Find legend elements in TradingView
        const legendItems = Array.from(document.querySelectorAll('[data-name="legend-source-item"], [data-name="legend-series-item"], div[class*="item-"]')).map(el => ({
          text: el.innerText?.trim().replace(/\\s+/g, ' '),
          title: el.getAttribute('title'),
          dataName: el.getAttribute('data-name'),
          rect: { x: el.getBoundingClientRect().x, y: el.getBoundingClientRect().y, w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height }
        }));

        // Find specifically UT Bot in legend
        const utBotEl = Array.from(document.querySelectorAll('*')).find(el => {
          return el.children.length === 0 && el.innerText && el.innerText.includes('UT Bot Alerts');
        });

        let utBotParent = utBotEl ? utBotEl.closest('div[data-name="legend-source-item"]') || utBotEl.parentElement?.parentElement : null;

        return {
          legendItems: legendItems.filter(i => i.text && (i.text.includes('UT') || i.text.includes('DEMA') || i.text.includes('GOLD'))),
          hasUtBot: !!utBotEl,
          parentHTML: utBotParent ? utBotParent.outerHTML.slice(0, 300) : null
        };
      })()`,
      returnByValue: true
    }
  }));
};

ws.onmessage = (e) => {
  const data = JSON.parse(e.data);
  console.log(JSON.stringify(data.result?.result?.value, null, 2));
  process.exit(0);
};
