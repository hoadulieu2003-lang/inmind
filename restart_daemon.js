const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PID_FILE = path.join(__dirname, 'daemon.pid');

try {
  const pidsStr = execSync('powershell "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like \'*daemon_monitor.js*\' } | Select-Object -ExpandProperty ProcessId"', { encoding: 'utf8' }).trim();
  console.log('Daemon PIDs found:', pidsStr);
  if (pidsStr) {
    pidsStr.split(/\r?\n/).forEach(pid => {
      const p = pid.trim();
      if (p && parseInt(p, 10) !== process.pid) {
        console.log('Stopping old daemon PID:', p);
        try { execSync(`powershell "Stop-Process -Id ${p} -Force"`); } catch (e) {}
      }
    });
  }
} catch (e) {
  console.error('Error finding PIDs:', e.message);
}

// Clean up stale pid file if exists
try { if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE); } catch (e) {}

// Wait 2 seconds for sockets and processes to close completely
execSync('powershell "Start-Sleep -Seconds 2"');

// Start fresh daemon
console.log('Starting fresh daemon_monitor.js...');
const d = spawn('node', ['daemon_monitor.js'], {
  cwd: 'C:/Users/game/Documents/app/trade',
  detached: true,
  stdio: 'ignore'
});
d.unref();
console.log('Fresh daemon_monitor.js spawned with PID:', d.pid);
