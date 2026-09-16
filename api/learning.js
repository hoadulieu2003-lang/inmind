const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const TUNNEL_URL = 'https://teams-superintendent-earlier-core.trycloudflare.com';

  // 1. Thử proxy qua Live Tunnel về máy trạm
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const liveRes = await fetch(`${TUNNEL_URL}/api/learning`, {
      signal: controller.signal,
      headers: { 'Cache-Control': 'no-cache' }
    });
    clearTimeout(timer);
    if (liveRes.ok) {
      const liveData = await liveRes.json();
      return res.status(200).json(liveData);
    }
  } catch (err) {}

  // 2. Fallback đọc dữ liệu cục bộ từ repository
  try {
    const learningDir = path.join(process.cwd(), 'data', 'learning');
    let latestReport = null;
    let latestMarkdown = '';

    if (fs.existsSync(learningDir)) {
      const files = fs.readdirSync(learningDir).filter(f => f.endsWith('.md')).sort().reverse();
      if (files.length > 0) {
        latestReport = files[0];
        latestMarkdown = fs.readFileSync(path.join(learningDir, latestReport), 'utf-8');
      }
    }

    const statusFile = path.join(process.cwd(), 'data', 'status.json');
    let statusData = {};
    if (fs.existsSync(statusFile)) {
      statusData = JSON.parse(fs.readFileSync(statusFile, 'utf-8'));
    }

    return res.status(200).json({
      success: true,
      lastLearningCycle: statusData.lastLearningCycle || null,
      latestReportFile: latestReport,
      reportMarkdown: latestMarkdown
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
};
