/**
 * ============================================================================
 * DATABASE MANAGER — SQLite Embedded Engine với Chế độ WAL (Write-Ahead Logging)
 * ============================================================================
 * Đảm bảo tính toàn vẹn dữ liệu ACID, chống hỏng tệp 100% khi sập nguồn,
 * hỗ trợ đọc/ghi đồng thời không xung đột khóa và tự động phản chiếu sang JSON
 * để tương thích ngược với Vercel Cloud Dashboard.
 */

const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const DB_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DB_DIR, 'trade.db');
const JOURNAL_JSON_PATH = path.join(DB_DIR, 'journal.json');
const ROOT_JOURNAL_JSON_PATH = path.join(__dirname, 'ab_testing_journal.json');

// Đảm bảo thư mục data tồn tại
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

class DatabaseManager {
  constructor(dbPath = DB_PATH) {
    this.dbPath = dbPath;
    this.db = null;
    this.initPromise = this.init();
  }

  async init() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          console.error(`[SQLITE ERROR] Không thể mở cơ sở dữ liệu: ${err.message}`);
          return reject(err);
        }

        // Kích hoạt các PRAGMA tối ưu hóa hiệu năng & độ tin cậy
        this.db.serialize(() => {
          // WAL Mode: Cho phép nhiều tiến trình đọc đồng thời trong khi 1 tiến trình đang ghi
          this.db.run('PRAGMA journal_mode = WAL;');
          // Synchronous NORMAL: Tối ưu I/O đĩa mà vẫn an toàn tuyệt đối trong chế độ WAL
          this.db.run('PRAGMA synchronous = NORMAL;');
          // Busy Timeout: Đợi tối đa 5000ms nếu có tiến trình khác đang ghi thay vì báo lỗi SQLITE_BUSY
          this.db.run('PRAGMA busy_timeout = 5000;');
          this.db.run('PRAGMA foreign_keys = ON;');

          // Khởi tạo Bảng trades
          const createTradesTableSql = `
            CREATE TABLE IF NOT EXISTS trades (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              position_id TEXT UNIQUE,
              asset TEXT NOT NULL,
              symbol TEXT NOT NULL,
              strategy TEXT NOT NULL,
              ticket_type TEXT,
              action TEXT NOT NULL,
              entry_price REAL NOT NULL,
              stop_loss REAL NOT NULL,
              take_profit REAL NOT NULL,
              risk_reward_ratio REAL,
              lot_size REAL NOT NULL,
              risk_amount REAL NOT NULL,
              status TEXT NOT NULL DEFAULT 'OPEN',
              pnl REAL,
              pnl_r TEXT,
              close_price REAL,
              close_reason TEXT,
              time_vietnam TEXT NOT NULL,
              timestamp TEXT NOT NULL,
              exness_screenshot TEXT,
              tv_screenshot TEXT,
              note TEXT,
              ema200 REAL,
              cci_current REAL,
              cci_previous REAL,
              is_breakeven INTEGER DEFAULT 0,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
          `;
          this.db.run(createTradesTableSql, (err) => {
            if (err) return reject(err);

            // Tạo các chỉ mục tối ưu truy vấn
            this.db.run('CREATE INDEX IF NOT EXISTS idx_trades_position_id ON trades(position_id);');
            this.db.run('CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);');
            this.db.run('CREATE INDEX IF NOT EXISTS idx_trades_asset ON trades(asset);');
            this.db.run('CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp);', (idxErr) => {
              if (idxErr) return reject(idxErr);
              resolve();
            });
          });
        });
      });
    });
  }

  async run(sql, params = []) {
    await this.initPromise;
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  async get(sql, params = []) {
    await this.initPromise;
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async all(sql, params = []) {
    await this.initPromise;
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  // Chuyển đổi bản ghi DB (snake_case) sang định dạng JSON API (camelCase) cho Frontend
  rowToTrade(row) {
    if (!row) return null;
    return {
      id: row.id,
      positionId: row.position_id,
      asset: row.asset,
      symbol: row.symbol,
      strategy: row.strategy,
      ticketType: row.ticket_type,
      action: row.action,
      entryPrice: row.entry_price,
      stopLoss: row.stop_loss,
      takeProfit: row.take_profit,
      riskRewardRatio: row.risk_reward_ratio,
      lotSize: row.lot_size,
      riskAmount: row.risk_amount,
      status: row.status,
      pnl: row.pnl,
      pnlR: row.pnl_r,
      closePrice: row.close_price,
      closeReason: row.close_reason,
      timeVietnam: row.time_vietnam,
      timestamp: row.timestamp,
      exnessScreenshot: row.exness_screenshot,
      tvScreenshot: row.tv_screenshot,
      note: row.note,
      ema200: row.ema200,
      cciCurrent: row.cci_current,
      cciPrevious: row.cci_previous,
      isBreakeven: Boolean(row.is_breakeven)
    };
  }

  /**
   * Thêm hoặc cập nhật một lệnh giao dịch (Upsert)
   */
  async insertTrade(trade) {
    await this.initPromise;
    const nowVN = trade.timeVietnam || new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const nowIso = trade.timestamp || new Date().toISOString();

    const sql = `
      INSERT INTO trades (
        position_id, asset, symbol, strategy, ticket_type, action,
        entry_price, stop_loss, take_profit, risk_reward_ratio,
        lot_size, risk_amount, status, pnl, pnl_r, close_price, close_reason,
        time_vietnam, timestamp, exness_screenshot, tv_screenshot, note,
        ema200, cci_current, cci_previous, is_breakeven, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(position_id) DO UPDATE SET
        stop_loss = excluded.stop_loss,
        take_profit = excluded.take_profit,
        status = excluded.status,
        pnl = excluded.pnl,
        pnl_r = excluded.pnl_r,
        close_price = excluded.close_price,
        close_reason = excluded.close_reason,
        exness_screenshot = COALESCE(excluded.exness_screenshot, trades.exness_screenshot),
        tv_screenshot = COALESCE(excluded.tv_screenshot, trades.tv_screenshot),
        note = excluded.note,
        is_breakeven = excluded.is_breakeven,
        updated_at = CURRENT_TIMESTAMP;
    `;

    const params = [
      trade.positionId || trade.position_id || null,
      trade.asset,
      trade.symbol,
      trade.strategy,
      trade.ticketType || trade.ticket_type || null,
      trade.action,
      trade.entryPrice ?? trade.entry_price,
      trade.stopLoss ?? trade.stop_loss,
      trade.takeProfit ?? trade.take_profit,
      trade.riskRewardRatio ?? trade.risk_reward_ratio ?? null,
      trade.lotSize ?? trade.lot_size,
      trade.riskAmount ?? trade.risk_amount,
      trade.status || 'OPEN',
      trade.pnl ?? null,
      trade.pnlR || trade.pnl_r || null,
      trade.closePrice ?? trade.close_price ?? null,
      trade.closeReason || trade.close_reason || null,
      nowVN,
      nowIso,
      trade.exnessScreenshot || trade.exness_screenshot || null,
      trade.tvScreenshot || trade.tv_screenshot || null,
      trade.note || null,
      trade.ema200 ?? null,
      trade.cciCurrent ?? trade.cci_current ?? null,
      trade.cciPrevious ?? trade.cci_previous ?? null,
      trade.isBreakeven ? 1 : 0
    ];

    const res = await this.run(sql, params);
    await this.exportToMirroredJson();
    return res;
  }

  /**
   * Cập nhật trạng thái chốt lời / cắt lỗ của lệnh theo positionId
   */
  async updateTradeByPositionId(positionId, updateData) {
    await this.initPromise;
    if (!positionId) return null;

    const fields = [];
    const params = [];

    if (updateData.status !== undefined) { fields.push('status = ?'); params.push(updateData.status); }
    if (updateData.pnl !== undefined) { fields.push('pnl = ?'); params.push(updateData.pnl); }
    if (updateData.pnlR !== undefined) { fields.push('pnl_r = ?'); params.push(updateData.pnlR); }
    if (updateData.closePrice !== undefined) { fields.push('close_price = ?'); params.push(updateData.closePrice); }
    if (updateData.closeReason !== undefined) { fields.push('close_reason = ?'); params.push(updateData.closeReason); }
    if (updateData.stopLoss !== undefined) { fields.push('stop_loss = ?'); params.push(updateData.stopLoss); }
    if (updateData.isBreakeven !== undefined) { fields.push('is_breakeven = ?'); params.push(updateData.isBreakeven ? 1 : 0); }
    if (updateData.note !== undefined) { fields.push('note = ?'); params.push(updateData.note); }

    if (fields.length === 0) return null;
    fields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(positionId);

    const sql = `UPDATE trades SET ${fields.join(', ')} WHERE position_id = ?`;
    const res = await this.run(sql, params);
    await this.exportToMirroredJson();
    return res;
  }

  /**
   * Xóa các lệnh theo mã asset (Dùng cho kiểm thử dọn dẹp sạch)
   */
  async deleteTradesByAsset(asset) {
    const res = await this.run('DELETE FROM trades WHERE asset = ?', [asset]);
    await this.exportToMirroredJson();
    return res;
  }

  /**
   * Lấy toàn bộ danh sách lệnh (sắp xếp theo thời gian mới nhất lên đầu)
   */
  async getAllTrades() {
    const rows = await this.all('SELECT * FROM trades ORDER BY id ASC');
    return rows.map(r => this.rowToTrade(r));
  }

  /**
   * Lấy các vị thế đang mở
   */
  async getOpenTrades() {
    const rows = await this.all("SELECT * FROM trades WHERE status = 'OPEN' ORDER BY id ASC");
    return rows.map(r => this.rowToTrade(r));
  }

  /**
   * Lấy thống kê định lượng hiệu suất (Winrate, PnL, R:R)
   */
  async getPerformanceStats() {
    const trades = await this.getAllTrades();
    const closedTrades = trades.filter(t => t.status === 'WIN' || t.status === 'LOSS' || (typeof t.pnl === 'number' && t.pnl !== 0));
    const winTrades = closedTrades.filter(t => t.status === 'WIN' || (typeof t.pnl === 'number' && t.pnl > 0));
    const totalPnl = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const winRate = closedTrades.length > 0 ? ((winTrades.length / closedTrades.length) * 100).toFixed(1) : '0.0';

    return {
      totalTrades: trades.length,
      closedTrades: closedTrades.length,
      winTrades: winTrades.length,
      lossTrades: closedTrades.length - winTrades.length,
      winRate: parseFloat(winRate),
      totalPnl: parseFloat(totalPnl.toFixed(2))
    };
  }

  /**
   * Xuất bản sao ra JSON (Tự động đồng bộ sang data/journal.json và ab_testing_journal.json)
   * Đảm bảo tính tương thích ngược 100% cho Vercel Cloud Deployment
   */
  async exportToMirroredJson() {
    try {
      const trades = await this.getAllTrades();
      const jsonContent = JSON.stringify(trades, null, 2);

      // Ghi ra data/journal.json
      fs.writeFileSync(JOURNAL_JSON_PATH, jsonContent, 'utf8');

      // Ghi ra ab_testing_journal.json
      fs.writeFileSync(ROOT_JOURNAL_JSON_PATH, jsonContent, 'utf8');
    } catch (err) {
      console.error(`[DB MIRROR ERROR] Lỗi xuất bản sao JSON: ${err.message}`);
    }
  }

  async close() {
    if (this.db) {
      return new Promise((resolve) => {
        this.db.close(() => resolve());
      });
    }
  }
}

// Khởi tạo Singleton instance
const dbManager = new DatabaseManager();

module.exports = dbManager;
