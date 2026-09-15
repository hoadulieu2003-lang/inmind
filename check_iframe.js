const fs = require('fs');

async function main() {
  const tabs = await (await fetch('http://127.0.0.1:9222/json')).json();
  const exness = tabs.find(t => t.type === 'page' && t.url.includes('my.exness.com/webtrading'));
  const ws = new WebSocket(`ws://127.0.0.1:9222/devtools/page/${exness.id}`);
  await new Promise(r => ws.onopen = r);

  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `(() => {
        const iframe = document.querySelector('iframe');
        let iframeElements = [];
        if (iframe && iframe.contentDocument) {
          iframeElements = Array.from(iframe.contentDocument.querySelectorAll('*'))
            .filter(el => el.innerText && el.innerText.includes('+50.40'))
            .map(el => ({ tag: el.tagName, text: el.innerText }));
        }

        const pill = Array.from(document.querySelectorAll('*'))
          .filter(el => el.innerText && (el.innerText.includes('50.40') || el.innerText.includes('+50')))
          .map(el => ({ tag: el.tagName, text: el.innerText }));

        return {
          window: { width: window.innerWidth, height: window.innerHeight },
          hasIframe: !!iframe,
          iframeSrc: iframe?.src,
          iframeElements,
          pill
        };
      })()`,
      returnByValue: true
    }
  }));

  ws.onmessage = (e) => {
    console.log(JSON.stringify(JSON.parse(e.data).result?.result?.value, null, 2));
    ws.close();
  };
}

main().catch(console.error);
