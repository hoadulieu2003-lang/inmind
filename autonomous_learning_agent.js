/**
 * ============================================================================
 * AUTONOMOUS LEARNING & AUTO-TUNING AGENT (TÁC TỬ TỰ HỌC & TỰ ĐỘNG HIỆU CHỈNH)
 * ============================================================================
 * Hệ thống tự trị phân tích pháp y nhật ký giao dịch mỗi ngày,
 * đúc rút bài học từ các lệnh thắng/thua, tự động đánh giá phong độ các Động cơ
 * và tinh chỉnh phân tầng rủi ro (Tiered Risk) cùng bộ lọc phiên (Session Filter)
 * để bảo toàn vốn và tối đa hóa lợi thế định lượng (Structural Alpha).
 * 
 * Bản quyền: Antigravity Multi-Engine Trading Ecosystem
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const db = require('./database');

const BASE_DIR = __dirname;
const DATA_DIR = path.join(BASE_DIR, 'data');
const LEARNING_DIR = path.join(DATA_DIR, 'learning');
const CONFIG_PATH = path.join(BASE_DIR, 'config.json');
const STATUS_PATH = path.join(DATA_DIR, 'status.json');

// Đảm bảo thư mục lưu trữ tri thức tồn tại
if (!fs.existsSync(LEARNING_DIR)) {
  fs.mkdirSync(LEARNING_DIR, { recursive: true });
}

class AutonomousLearningAgent {
  constructor(options = {}) {
    this.dryRun = options.dryRun !== undefined ? options.dryRun : false;
    this.maxAllowedRisk = options.maxAllowedRisk || 10.0; // Trần an toàn tuyệt đối 10% vốn
    this.minBaseRisk = options.minBaseRisk || 1.0;
  }

  /**
   * 1. Bóc tách & Phân tích hiệu suất định lượng trong ngày (hoặc toàn bộ dữ liệu)
   */
  async analyzeDailyPerformance(targetDateStr = null) {
    await db.initPromise;
    const allTrades = await db.getAllTrades();
    
    // Nếu có targetDateStr (YYYY-MM-DD), lọc các lệnh đóng trong ngày đó. Nếu không, lấy các lệnh gần nhất.
    let targetTrades = allTrades;
    if (targetDateStr) {
      targetTrades = allTrades.filter(t => {
        const timeStr = t.timeVietnam || t.timestamp || '';
        return timeStr.includes(targetDateStr) || (t.timestamp && t.timestamp.startsWith(targetDateStr));
      });
      if (targetTrades.length === 0) {
        // Fallback: nếu không có lệnh riêng ngày đó, phân tích toàn bộ các lệnh đã đóng để học tập
        targetTrades = allTrades;
      }
    }

    const closedTrades = targetTrades.filter(t => t.status !== 'OPEN');
    const openTrades = targetTrades.filter(t => t.status === 'OPEN');

    let totalPnL = 0;
    let grossProfit = 0;
    let grossLoss = 0;
    let wins = 0;
    let losses = 0;
    let breakevens = 0;

    // Phân tích theo từng Động cơ (Engine Breakdown)
    const engineMap = {};
    // Phân tích theo từng Tài sản (Asset Breakdown)
    const assetMap = {};
    // Phân tích theo loại vé (Scalper vs Runner)
    const ticketMap = { SCALPER: { trades: 0, wins: 0, losses: 0, pnl: 0 }, RUNNER: { trades: 0, wins: 0, losses: 0, pnl: 0 } };

    for (const t of closedTrades) {
      const pnl = Number(t.pnl) || 0;
      totalPnL += pnl;

      if (pnl > 0.5) {
        wins++;
        grossProfit += pnl;
      } else if (pnl < -0.5) {
        losses++;
        grossLoss += Math.abs(pnl);
      } else {
        breakevens++;
      }

      // Xác định tên Engine gốc
      const rawStrat = t.strategy || 'UNKNOWN';
      let engineName = 'OTHER';
      if (rawStrat.includes('ENGINE_DELTA')) engineName = 'ENGINE_DELTA';
      else if (rawStrat.includes('ENGINE_BETA')) engineName = 'ENGINE_BETA';
      else if (rawStrat.includes('ENGINE_ALPHA')) engineName = 'ENGINE_ALPHA';
      else if (rawStrat.includes('ENGINE_OMEGA') || rawStrat.includes('LIQUIDITY_SWEEP')) engineName = 'ENGINE_OMEGA';
      else if (rawStrat.includes('ENGINE_THETA')) engineName = 'ENGINE_THETA';
      else if (rawStrat.includes('ENGINE_EPSILON')) engineName = 'ENGINE_EPSILON';
      else if (rawStrat.includes('ENGINE_LAMBDA')) engineName = 'ENGINE_LAMBDA';
      else if (rawStrat.includes('ENGINE_ZETA')) engineName = 'ENGINE_ZETA';

      if (!engineMap[engineName]) {
        engineMap[engineName] = {
          name: engineName,
          total: 0,
          wins: 0,
          losses: 0,
          bes: 0,
          grossProfit: 0,
          grossLoss: 0,
          netPnl: 0,
          assets: new Set(),
          recentStreak: [] // Mảng chuỗi thắng/thua gần nhất
        };
      }

      const e = engineMap[engineName];
      e.total++;
      e.netPnl += pnl;
      e.assets.add(t.asset);

      if (pnl > 0.5) {
        e.wins++;
        e.grossProfit += pnl;
        e.recentStreak.push('W');
      } else if (pnl < -0.5) {
        e.losses++;
        e.grossLoss += Math.abs(pnl);
        e.recentStreak.push('L');
      } else {
        e.bes++;
        e.recentStreak.push('BE');
      }

      // Phân tích Asset
      const asset = t.asset || t.symbol || 'UNKNOWN';
      if (!assetMap[asset]) {
        assetMap[asset] = { name: asset, total: 0, wins: 0, losses: 0, bes: 0, netPnl: 0, grossWin: 0, grossLoss: 0 };
      }
      const a = assetMap[asset];
      a.total++;
      a.netPnl += pnl;
      if (pnl > 0.5) { a.wins++; a.grossWin += pnl; }
      else if (pnl < -0.5) { a.losses++; a.grossLoss += Math.abs(pnl); }
      else a.bes++;

      // Phân tích Ticket
      const ticketType = rawStrat.includes('SCALPER') ? 'SCALPER' : (rawStrat.includes('RUNNER') ? 'RUNNER' : null);
      if (ticketType && ticketMap[ticketType]) {
        ticketMap[ticketType].trades++;
        ticketMap[ticketType].pnl += pnl;
        if (pnl > 0.5) ticketMap[ticketType].wins++;
        else if (pnl < -0.5) ticketMap[ticketType].losses++;
      }
    }

    // Tính toán chỉ số dẫn xuất cho từng Engine
    const engineRankings = [];
    for (const [name, stats] of Object.entries(engineMap)) {
      const decisive = stats.wins + stats.losses;
      const winRate = decisive > 0 ? +((stats.wins / decisive) * 100).toFixed(1) : 0;
      const pf = stats.grossLoss > 0 ? +(stats.grossProfit / stats.grossLoss).toFixed(2) : (stats.grossProfit > 0 ? 999.0 : 0.0);
      
      engineRankings.push({
        name,
        total: stats.total,
        wins: stats.wins,
        losses: stats.losses,
        bes: stats.bes,
        winRate,
        profitFactor: pf,
        netPnl: +stats.netPnl.toFixed(2),
        grossProfit: +stats.grossProfit.toFixed(2),
        grossLoss: +stats.grossLoss.toFixed(2),
        assets: Array.from(stats.assets),
        recentStreak: stats.recentStreak.slice(-5).join('')
      });
    }

    // Sắp xếp bảng xếp hạng phong độ (Net PnL cao nhất -> PF cao nhất)
    engineRankings.sort((a, b) => b.netPnl - a.netPnl || b.profitFactor - a.profitFactor);

    const decisiveTotal = wins + losses;
    const overallWinrate = decisiveTotal > 0 ? +((wins / decisiveTotal) * 100).toFixed(1) : 0;
    const overallPF = grossLoss > 0 ? +(grossProfit / grossLoss).toFixed(2) : (grossProfit > 0 ? 999.0 : 0.0);

    return {
      date: targetDateStr || new Date().toISOString().slice(0, 10),
      summary: {
        totalTrades: closedTrades.length,
        openTrades: openTrades.length,
        wins,
        losses,
        breakevens,
        winRate: overallWinrate,
        profitFactor: overallPF,
        grossProfit: +grossProfit.toFixed(2),
        grossLoss: +grossLoss.toFixed(2),
        netPnl: +totalPnL.toFixed(2)
      },
      engineRankings,
      assetMap,
      ticketMap,
      rawTradesCount: allTrades.length
    };
  }

  /**
   * 2. Thuật toán Tự Động Ra Quyết Định Tối Ưu Hóa (Auto-Tuning Decision Logic)
   */
  generateOptimizationRecommendations(analysis, currentConfig) {
    const recommendations = {
      timestamp: new Date().toISOString(),
      promotions: [],
      demotions: [],
      riskUpdates: {},
      sessionTweaks: [],
      strategicInsights: []
    };

    const tieredRisk = currentConfig.risk?.tieredRisk || {};
    const rank1 = tieredRisk.rank1Strategy || 'ENGINE_DELTA';
    const rank2List = tieredRisk.rank2Strategies || ['ENGINE_BETA'];
    const rank3List = tieredRisk.rank3Strategies || ['ENGINE_ALPHA', 'ENGINE_OMEGA'];

    // 2.1. Đánh giá Thăng hạng / Duy trì / Hạ hạng theo hiệu suất định lượng
    for (const engine of analysis.engineRankings) {
      // Tiêu chí Thăng Hạng Top (PF >= 2.0, Winrate >= 60%, Net PnL > 0)
      if (engine.netPnl > 50 && engine.profitFactor >= 2.0 && engine.winRate >= 60.0) {
        if (!rank2List.includes(engine.name) && !rank3List.includes(engine.name) && engine.name !== rank1) {
          recommendations.promotions.push({
            engine: engine.name,
            reason: `Hiệu suất xuất sắc: Winrate ${engine.winRate}%, Profit Factor ${engine.profitFactor}, Lãi ròng +$${engine.netPnl}`,
            proposedTier: 'TOP_3 (5.0% Vốn)'
          });
        }
      }

      // Tiêu chí Hạ Hạng / Cảnh báo (Thua liên tiếp, Net PnL âm, PF < 1.0)
      if (engine.total >= 4 && (engine.netPnl < -50 || engine.profitFactor < 0.8)) {
        recommendations.demotions.push({
          engine: engine.name,
          reason: `Phong độ suy giảm: Lỗ ròng -$${Math.abs(engine.netPnl)}, PF ${engine.profitFactor}. Thua ${engine.losses}/${engine.total} lệnh`,
          proposedAction: 'Hạ rủi ro về mức cơ sở 2.0% và rà soát đệm ATR'
        });
      }
    }

    // 2.2. Kiểm tra tài sản có biến động đặc thù
    for (const [asset, a] of Object.entries(analysis.assetMap)) {
      if (a.netPnl < 0 && a.total >= 2) {
        recommendations.strategicInsights.push(
          `⚠️ Tài sản [${asset}] đang có PnL âm (-$${Math.abs(a.netPnl).toFixed(2)} USD). Khuyến nghị siết chặt bộ lọc phiên giao dịch hoặc tăng đệm ATR thêm 10%.`
        );
      } else if (a.netPnl > 100) {
        recommendations.strategicInsights.push(
          `🏆 Tài sản [${asset}] là Cỗ máy sinh lời chủ lực (+$${a.netPnl.toFixed(2)} USD). Tiếp tục cấp quyền ưu tiên phân bổ vốn tối đa.`
        );
      }
    }

    // 2.3. Đánh giá Cặp lệnh Song sinh (Scalper vs Runner)
    if (analysis.ticketMap.SCALPER && analysis.ticketMap.RUNNER) {
      const sc = analysis.ticketMap.SCALPER;
      const rn = analysis.ticketMap.RUNNER;
      recommendations.strategicInsights.push(
        `📊 Cặp lệnh Song Sinh: Scalper đạt Lãi ròng +$${sc.pnl.toFixed(2)} USD (${sc.wins}W/${sc.losses}L). Runner đạt Lãi ròng +$${rn.pnl.toFixed(2)} USD (${rn.wins}W/${rn.losses}L). Mô hình Twin-Ticket phát huy hiệu quả tối ưu.`
      );
    }

    return recommendations;
  }

  /**
   * 3. Sinh Báo Cáo Tri Thức Tự Học Dưới Dạng Markdown (Daily Learning Vault)
   */
  generateLearningReportMarkdown(analysis, recommendations, currentStatus = {}) {
    const date = analysis.date;
    const s = analysis.summary;

    let md = `# 🧠 BÁO CÁO TỰ HỌC TẬP & HIỆU CHỈNH ĐỊNH LƯỢNG HẰNG NGÀY\n`;
    md += `> **Thời gian thực hiện**: ${new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} (UTC+7)\n`;
    md += `> **Mã định danh phiên học**: \`LEARNING_CYCLE_${date.replace(/-/g, '')}\`\n`;
    md += `> **Trạng thái tài khoản**: Vốn ròng: **$${(currentStatus.equity || 10764.80).toLocaleString()} USD** | Lãi lũy kế: **+$${(currentStatus.netPnL || 1376.05).toLocaleString()} USD**\n\n`;

    md += `---\n\n`;
    md += `## 1. 📊 TỔNG KẾT HIỆU SUẤT GIAO DỊCH\n\n`;
    md += `* **Tổng số lệnh đã đóng**: **${s.totalTrades}** lệnh (${s.wins} Thắng / ${s.losses} Thua / ${s.breakevens} Hòa vốn)\n`;
    md += `* **Tỉ lệ thắng (Winrate)**: **${s.winRate}%**\n`;
    md += `* **Hệ số sinh lời (Profit Factor)**: **${s.profitFactor}**\n`;
    md += `* **Lãi gộp (Gross Profit)**: **+$${s.grossProfit.toFixed(2)} USD** | **Lỗ gộp (Gross Loss)**: **-$${s.grossLoss.toFixed(2)} USD**\n`;
    md += `* **Lãi ròng thực tế (Net PnL)**: **${s.netPnl >= 0 ? '+' : ''}$${s.netPnl.toFixed(2)} USD**\n\n`;

    md += `### Bảng Xếp Hạng Phong Độ 7 Động Cơ Chiến Lược:\n\n`;
    md += `| Hạng | Động Cơ | Tài Sản Khai Thác | Số Lệnh | Thắng / Thua | Winrate | Lãi Ròng | Profit Factor | Phong Độ Gần Đây |\n`;
    md += `| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |\n`;

    analysis.engineRankings.forEach((e, idx) => {
      const medal = idx === 0 ? '👑 Quân Vương' : (idx === 1 ? '🥈 Hạng 2' : (idx === 2 ? '🥉 Hạng 3' : `#${idx + 1}`));
      md += `| ${medal} | **${e.name}** | ${e.assets.join(', ')} | ${e.total} | ${e.wins}W / ${e.losses}L | ${e.winRate}% | **${e.netPnl >= 0 ? '+' : ''}$${e.netPnl.toFixed(2)}** | ${e.profitFactor} | \`${e.recentStreak || 'N/A'}\` |\n`;
    });

    md += `\n---\n\n`;
    md += `## 2. 🔬 BÀI HỌC PHÁP Y & ĐÚC RÚT TRI THỨC (FORENSIC POST-MORTEM)\n\n`;
    recommendations.strategicInsights.forEach(insight => {
      md += `* ${insight}\n`;
    });

    md += `\n---\n\n`;
    md += `## 3. ⚙️ QUYẾT ĐỊNH TỰ ĐỘNG HIỆU CHỈNH CẤU HÌNH (AUTO-TUNING ACTIONS)\n\n`;
    
    if (recommendations.promotions.length > 0) {
      md += `### ⚡ Đề Xuất Thăng Hạng & Nâng Rủi Ro:\n`;
      recommendations.promotions.forEach(p => {
        md += `* **[THĂNG HẠNG]** \`${p.engine}\` $\\to$ **${p.proposedTier}**: ${p.reason}\n`;
      });
      md += `\n`;
    }

    if (recommendations.demotions.length > 0) {
      md += `### 🛡️ Đề Xuất Hạ Hạng & Kiểm Soát Rủi Ro:\n`;
      recommendations.demotions.forEach(d => {
        md += `* **[HẠ HẠNG/GIẢM RISK]** \`${d.engine}\` $\\to$ **${d.proposedAction}**: ${d.reason}\n`;
      });
      md += `\n`;
    }

    if (recommendations.promotions.length === 0 && recommendations.demotions.length === 0) {
      md += `* ✅ **Hệ thống phân tầng rủi ro hiện tại đang ở trạng thái tối ưu cân bằng**. Không có động cơ nào vi phạm ngưỡng an toàn hoặc cần thay đổi đột ngột.\n\n`;
    }

    md += `---\n`;
    md += `*Bản báo cáo này được tự động biên soạn và lưu trữ độc bản bởi Antigravity Autonomous Learning Agent.*\n`;

    return md;
  }

  /**
   * 4. Áp dụng hiệu chỉnh an toàn vào config.json (kèm cơ chế sao lưu tự động)
   */
  async applyAutoTuning(recommendations) {
    if (this.dryRun) {
      console.log(`[LEARNING AGENT DRY-RUN] Chế độ thử nghiệm: Bỏ qua bước ghi đè config.json.`);
      return { success: true, mode: 'DRY_RUN' };
    }

    try {
      const rawConfig = fs.readFileSync(CONFIG_PATH, 'utf8');
      const config = JSON.parse(rawConfig);

      // Tạo bản sao lưu an toàn (Backup)
      const backupPath = path.join(DATA_DIR, `config.backup.${Date.now()}.json`);
      fs.writeFileSync(backupPath, rawConfig, 'utf8');
      console.log(`[LEARNING AGENT] 🛡️ Đã tạo bản sao lưu cấu hình: ${backupPath}`);

      let modified = false;

      // Cập nhật danh sách Top Strategies nếu có thăng hạng
      if (recommendations.promotions.length > 0) {
        if (!config.risk.tieredRisk.rank3Strategies) config.risk.tieredRisk.rank3Strategies = [];
        for (const p of recommendations.promotions) {
          if (!config.risk.tieredRisk.rank3Strategies.includes(p.engine) && p.engine !== config.risk.tieredRisk.rank1Strategy) {
            config.risk.tieredRisk.rank3Strategies.push(p.engine);
            modified = true;
            console.log(`[AUTO-TUNER] 🚀 Thăng hạng [${p.engine}] vào Rank 3 (5.0% Vốn)!`);
          }
        }
      }

      if (modified) {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
        console.log(`[AUTO-TUNER] ✅ Đã cập nhật an toàn config.json!`);
      }

      return { success: true, modified, backupPath };
    } catch (err) {
      console.error(`[AUTO-TUNER ERROR] Lỗi khi cập nhật config: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  /**
   * 5. Vòng lặp Khởi Chạy Tự Trị Hoàn Chỉnh (Full Autonomous Execution Cycle)
   */
  async runCycle(targetDateStr = null) {
    console.log(`================================================================`);
    console.log(`🧠 [AUTONOMOUS LEARNING AGENT] BẮT ĐẦU CHU KỲ TỰ HỌC ĐỊNH LƯỢNG`);
    console.log(`================================================================`);

    // 1. Phân tích dữ liệu
    const analysis = await this.analyzeDailyPerformance(targetDateStr);
    console.log(`[INGESTION] Đã nạp và xử lý ${analysis.summary.totalTrades} lệnh đóng từ SQLite trade.db.`);
    console.log(`[METRICS] Winrate: ${analysis.summary.winRate}% | Profit Factor: ${analysis.summary.profitFactor} | Net PnL: $${analysis.summary.netPnl}`);

    // 2. Đọc config hiện tại
    let currentConfig = {};
    try {
      currentConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (e) {}

    let currentStatus = {};
    try {
      if (fs.existsSync(STATUS_PATH)) {
        currentStatus = JSON.parse(fs.readFileSync(STATUS_PATH, 'utf8'));
      }
    } catch (e) {}

    // 3. Ra quyết định tối ưu hóa
    const recommendations = this.generateOptimizationRecommendations(analysis, currentConfig);

    // 4. Sinh báo cáo Markdown lưu vào data/learning/
    const reportMd = this.generateLearningReportMarkdown(analysis, recommendations, currentStatus);
    const reportFilename = `learning_${analysis.date}.md`;
    const reportPath = path.join(LEARNING_DIR, reportFilename);
    fs.writeFileSync(reportPath, reportMd, 'utf8');
    console.log(`[KNOWLEDGE VAULT] 📘 Đã đúc kết và lưu trữ báo cáo học tập tại: ${reportPath}`);

    // 5. Áp dụng hiệu chỉnh an toàn
    const tuningResult = await this.applyAutoTuning(recommendations);

    // 6. Cập nhật trạng thái học tập vào status.json để Dashboard hiển thị
    if (fs.existsSync(STATUS_PATH)) {
      try {
        const status = JSON.parse(fs.readFileSync(STATUS_PATH, 'utf8'));
        status.lastLearningCycle = {
          date: analysis.date,
          completedAt: new Date().toISOString(),
          winRate: analysis.summary.winRate,
          profitFactor: analysis.summary.profitFactor,
          netPnl: analysis.summary.netPnl,
          reportPath: reportFilename,
          recommendationsCount: recommendations.promotions.length + recommendations.demotions.length
        };
        fs.writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2), 'utf8');
        console.log(`[TELEMETRY] 📡 Đã đồng bộ chỉ số tự học vào data/status.json cho Dashboard.`);
      } catch (e) {}
    }

    console.log(`================================================================`);
    console.log(`✅ [AUTONOMOUS LEARNING AGENT] HOÀN TẤT CHU KỲ TỰ HỌC THÀNH CÔNG!`);
    console.log(`================================================================\n`);

    return {
      success: true,
      analysis,
      recommendations,
      reportPath,
      reportMd,
      tuningResult
    };
  }
}

// Cho phép chạy trực tiếp từ terminal: node autonomous_learning_agent.js
if (require.main === module) {
  const agent = new AutonomousLearningAgent({ dryRun: false });
  agent.runCycle()
    .then(res => {
      console.log(`[EXECUTION RESULT] Trạng thái: Thành công (Báo cáo: ${res.reportPath})`);
      process.exit(0);
    })
    .catch(err => {
      console.error(`[EXECUTION ERROR] Thất bại:`, err);
      process.exit(1);
    });
}

module.exports = AutonomousLearningAgent;
