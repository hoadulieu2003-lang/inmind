const http = require('http');

http.get('http://127.0.0.1:9222/json/list', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const list = JSON.parse(data);
    const pages = list.filter(t => t.type === 'page');
    console.log('Total page tabs:', pages.length);
    pages.forEach((p, idx) => {
      console.log(`[${idx}] ID: ${p.id} | Title: ${p.title} | URL: ${p.url}`);
    });
  });
}).on('error', console.error);
