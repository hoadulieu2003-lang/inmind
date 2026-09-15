const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const bin = path.join(__dirname, 'bin', 'cloudflared.exe');
console.log('Starting Cloudflare tunnel to port 3000...');
const p = spawn(bin, ['tunnel', '--url', 'http://localhost:3000']);
let captured = false;

function check(d) {
  const s = d.toString();
  const m = s.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
  if (m && !captured) {
    captured = true;
    console.log('TUNNEL_URL:' + m[0]);
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'tunnel.json'), JSON.stringify({ url: m[0], time: Date.now() }, null, 2));
  }
}

p.stdout.on('data', check);
p.stderr.on('data', check);
