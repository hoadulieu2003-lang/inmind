const { spawn } = require('child_process');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const args = [
  '--remote-debugging-port=9222',
  '--user-data-dir=C:\\Users\\game\\AppData\\Local\\Google\\Chrome\\User Data Trade',
  '--no-first-run',
  '--no-default-browser-check',
  'https://www.tradingview.com/chart/',
  'https://my.exness.com/webtrading/'
];

console.log('🚀 Khởi động Chrome Trade độc lập (DoH 1.1.1.1, Port 9222)...');
const child = spawn(chromePath, args);

child.on('error', err => {
  console.error('❌ Lỗi tiến trình Chrome:', err);
  process.exit(1);
});

child.on('close', code => {
  console.log(`Chrome Trade đã đóng (Exit code: ${code})`);
  process.exit(code || 0);
});

// Giữ tiến trình runner chạy liên tục
setInterval(() => {}, 60000);
