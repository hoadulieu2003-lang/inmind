const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // 1. Kết nối qua Cloudflare Live Tunnel về trực tiếp máy trạm của Anh
  const TUNNEL_URL = 'https://teams-superintendent-earlier-core.trycloudflare.com';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const liveRes = await fetch(`${TUNNEL_URL}/api/journal`, {
      signal: controller.signal,
      headers: { 'Cache-Control': 'no-cache' }
    });
    clearTimeout(timer);
    if (liveRes.ok) {
      const liveData = await liveRes.json();
      return res.status(200).json(liveData);
    }
  } catch (err) {
    // Tunnel tạm thời không phản hồi -> Chuyển sang fallback
  }

  try {
    const filePath = path.join(process.cwd(), 'data', 'journal.json');
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return res.status(200).json(data);
    }
  } catch (e) {
    console.error(e);
  }

  return res.status(200).json([]);
};
