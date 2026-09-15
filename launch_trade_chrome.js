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

const child = spawn(chromePath, args, { detached: true, stdio: 'ignore' });
child.unref();
console.log('Chrome Trade launched. PID:', child.pid);
