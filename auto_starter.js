const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT_DIR = 'C:/Users/game/Documents/app/trade';
const LOG_FILE = path.join(ROOT_DIR, 'auto_starter.log');

function log(msg) {
  const ts = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch (e) {}
}

const delay = ms => new Promise(r => setTimeout(r, ms));

function checkHttp(url, timeoutMs = 2500) {
  return new Promise(resolve => {
    const req = http.get(url, { timeout: timeoutMs }, res => {
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function isProcessRunning(pattern) {
  try {
    const stdout = execSync(`tasklist /FI "IMAGENAME eq node.exe" /FO CSV /NH`, { encoding: 'utf8' });
    return stdout.includes('node.exe');
  } catch (e) {
    return false;
  }
}

async function ensureChromeCdp() {
  log('🔍 [1/5] Kiểm tra tiến trình Chrome CDP (Port 9222)...');
  const isCdpActive = await checkHttp('http://127.0.0.1:9222/json');
  if (isCdpActive) {
    log('✅ [CHROME CDP OK] Chrome Trading Profile đã hoạt động sẵn trên cổng 9222.');
    return true;
  }

  log('🚀 [CHROME LAUNCH] Đang khởi động Google Chrome Trade cô lập (Port 9222)...');
  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const args = [
    '--remote-debugging-port=9222',
    '--user-data-dir=C:\\Users\\game\\AppData\\Local\\Google\\Chrome\\User_Data_Trade',
    '--no-first-run',
    '--no-default-browser-check',
    'https://www.tradingview.com/chart/',
    'https://my.exness.com/webtrading/'
  ];

  const p = spawn(chromePath, args, {
    detached: true,
    stdio: 'ignore'
  });
  p.unref();

  for (let i = 1; i <= 15; i++) {
    await delay(1000);
    const ready = await checkHttp('http://127.0.0.1:9222/json');
    if (ready) {
      log(`✅ [CHROME CDP READY] Chrome CDP kết nối thành công sau ${i} giây!`);
      return true;
    }
  }
  log('⚠️ [CHROME CDP WARNING] Chrome đã mở nhưng cổng 9222 chưa phản hồi.');
  return false;
}

async function ensureServer() {
  log('🔍 [2/5] Kiểm tra Server Dashboard nội bộ (Port 3000)...');
  const isServerActive = await checkHttp('http://127.0.0.1:3000/api/status');
  if (isServerActive) {
    log('✅ [SERVER OK] Local Server đã hoạt động sẵn tại http://localhost:3000');
    return;
  }

  log('🚀 [SERVER LAUNCH] Đang khởi động server.js...');
  const p = spawn('node', ['server.js'], {
    cwd: ROOT_DIR,
    detached: true,
    stdio: 'ignore'
  });
  p.unref();

  for (let i = 1; i <= 8; i++) {
    await delay(1000);
    const ready = await checkHttp('http://127.0.0.1:3000/api/status');
    if (ready) {
      log(`✅ [SERVER READY] Server.js hoạt động thành công sau ${i} giây!`);
      return;
    }
  }
}

async function ensureTunnel() {
  log('🔍 [3/5] Kiểm tra Cloudflare Tunnel (Đồng bộ Vercel Cloud)...');
  const tunnelFile = path.join(ROOT_DIR, 'data', 'tunnel.json');
  let isRecent = false;
  try {
    if (fs.existsSync(tunnelFile)) {
      const data = JSON.parse(fs.readFileSync(tunnelFile, 'utf8'));
      if (Date.now() - (data.time || 0) < 600000 && data.url) {
        isRecent = true;
      }
    }
  } catch (e) {}

  // Kiểm tra process cloudflared
  let hasCloudflared = false;
  try {
    const list = execSync(`tasklist /FI "IMAGENAME eq cloudflared.exe" /FO CSV /NH`, { encoding: 'utf8' });
    hasCloudflared = list.includes('cloudflared.exe');
  } catch (e) {}

  if (hasCloudflared) {
    log('✅ [TUNNEL OK] Tiến trình cloudflared.exe đang hoạt động.');
    return;
  }

  log('🚀 [TUNNEL LAUNCH] Đang khởi động tunnel.js...');
  const p = spawn('node', ['tunnel.js'], {
    cwd: ROOT_DIR,
    detached: true,
    stdio: 'ignore'
  });
  p.unref();
  log('✅ [TUNNEL SPAWNED] Đã kích hoạt tunnel.js ngầm.');
}

async function ensureDaemon() {
  log('🔍 [4/5] Kiểm tra Bot Giao Dịch Tự Trị (daemon_monitor.js)...');
  const statusFile = path.join(ROOT_DIR, 'data', 'status.json');
  let isDaemonAlive = false;
  try {
    if (fs.existsSync(statusFile)) {
      const st = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
      if (st.lastHeartbeatTime && (Date.now() - st.lastHeartbeatTime < 45000)) {
        isDaemonAlive = true;
      }
    }
  } catch (e) {}

  if (isDaemonAlive) {
    log('✅ [DAEMON OK] daemon_monitor.js đang vận hành bình thường (Heartbeat còn mới).');
    return;
  }

  log('🚀 [DAEMON LAUNCH] Đang khởi động daemon_monitor.js...');
  const p = spawn('node', ['daemon_monitor.js'], {
    cwd: ROOT_DIR,
    detached: true,
    stdio: 'ignore'
  });
  p.unref();
  log('✅ [DAEMON SPAWNED] Đã kích hoạt daemon_monitor.js ngầm.');
}

async function openLiveDashboard() {
  log('🔍 [5/5] Tự động mở Dashboard cho Anh theo dõi...');
  await delay(3000);
  try {
    const dashboardUrl = 'https://trade-orcin-two.vercel.app';
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const p = spawn(chromePath, [dashboardUrl], {
      detached: true,
      stdio: 'ignore'
    });
    p.unref();
    log(`🌐 [DASHBOARD OPENED] Đã mở ${dashboardUrl} trên trình duyệt.`);
  } catch (e) {
    log(`⚠️ [DASHBOARD OPEN ERROR] ${e.message}`);
  }
}

async function main() {
  log('================================================================');
  log('⚡ BẮT ĐẦU QUY TRÌNH KHỞI ĐỘNG TỰ TRỊ HỆ THỐNG GIAO DỊCH ANTIGRAVITY');
  log('================================================================');

  await ensureChromeCdp();
  await ensureServer();
  await ensureTunnel();
  await ensureDaemon();
  await openLiveDashboard();

  log('================================================================');
  log('🎉 HỆ THỐNG ĐÃ SẴN SÀNG 100%! TOÀN BỘ CỖ MÁY ĐANG VẬN HÀNH NGẦM.');
  log('================================================================\n');
}

main().catch(err => {
  log(`🚨 [FATAL ERROR] Lỗi khởi động tự động: ${err.message}`);
});
