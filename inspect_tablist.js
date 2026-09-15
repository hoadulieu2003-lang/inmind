const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/D8732812EFF8977614EA114107B74D4C');

ws.onopen = () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        const firstTab = document.querySelector('.InstrumentTab_info__0a3c6');
        const tabList = firstTab ? firstTab.closest('div[class*="TabBar"]') || firstTab.parentElement?.parentElement?.parentElement : null;
        if (!tabList) return 'No tabList';
        
        // Find add tab button in tabList
        const addBtn = tabList.querySelector('button[class*="add"], div[class*="add"]') || 
                       Array.from(tabList.children).pop();
        return {
          tabListHTML: tabList.outerHTML.slice(0, 500),
          lastChild: addBtn ? addBtn.outerHTML.slice(0, 200) : null
        };
      })()`,
      returnByValue: true
    }
  }));
};

ws.onmessage = (e) => {
  const res = JSON.parse(e.data);
  console.log('TabList:', JSON.stringify(res.result?.result?.value, null, 2));
  process.exit(0);
};
