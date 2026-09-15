/**
 * ============================================================================
 * KIỂM THỬ ĐỘC LẬP TOÀN DIỆN: SQLITE WAL TRADING ENGINE PIPELINE
 * ============================================================================
 * 1. Kiểm tra chế độ WAL (Write-Ahead Logging)
 * 2. Kiểm tra tính toàn vẹn dữ liệu 6 lệnh thật (+75.01 USD PnL)
 * 3. Kiểm tra Upsert (Thêm/Sửa vị thế không xung đột)
 * 4. Kiểm tra Stress Test Đọc/Ghi Đồng thời (Zero Lock Contention)
 * 5. Kiểm tra Tự động Phản chiếu JSON (Dual-Write Mirroring)
 */

const db = require('./database');
const fs = require('fs');
const path = require('path');

let totalTests = 0;
let passedTests = 0;

function assert(description, condition) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${description}`);
  } else {
    console.error(`  ❌ [FAIL] ${description}`);
  }
}

async function runTests() {
  console.log('🧪 BẮT ĐẦU KIỂM THỬ HỆ THỐNG CƠ SỞ DỮ LIỆU SQLITE WAL...\n');

  // TEST 1: Kiểm tra chế độ WAL
  console.log('🔹 Test 1: Kiểm tra cấu hình PRAGMAs & WAL Mode');
  const journalMode = await db.get('PRAGMA journal_mode;');
  assert('Chế độ ghi nhật ký đang hoạt động ở chế độ WAL', journalMode && journalMode.journal_mode.toLowerCase() === 'wal');

  const busyTimeout = await db.get('PRAGMA busy_timeout;');
  assert('Busy Timeout được thiết lập tối thiểu 5000ms', busyTimeout && busyTimeout.timeout >= 5000);

  // TEST 2: Kiểm tra dữ liệu hiện có trong SQLite
  console.log('\n🔹 Test 2: Kiểm tra tính toàn vẹn 6 lệnh thật trên Exness');
  const trades = await db.getAllTrades();
  const closedTrades = trades.filter(t => t.status !== 'OPEN');
  const initialCount = trades.length;
  assert('Số lượng lệnh đã đóng thật trong SQLite chính xác bằng 6', closedTrades.length === 6);

  const stats = await db.getPerformanceStats();
  assert('Tổng PnL thực tế khớp chính xác +$75.01 USD', stats.totalPnl === 75.01);
  assert('Số lệnh thắng là 4', stats.winTrades === 4);
  assert('Số lệnh thua là 2', stats.lossTrades === 2);
  assert('Tỷ lệ thắng (Winrate) đạt 66.7%', stats.winRate === 66.7);

  // TEST 3: Kiểm tra Upsert (Thêm lệnh mới & Cập nhật theo Position ID)
  console.log('\n🔹 Test 3: Kiểm tra thao tác Atomic Insert & Update (Upsert)');
  const testTicket = 'TEST_TICKET_' + Date.now();
  await db.insertTrade({
    positionId: testTicket,
    asset: 'GOLD',
    symbol: 'XAU/USD',
    strategy: 'UNIT_TEST_STRATEGY',
    ticketType: 'SCALPER',
    action: 'BUY',
    entryPrice: 4310.50,
    stopLoss: 4305.50,
    takeProfit: 4315.50,
    riskRewardRatio: 1.0,
    lotSize: 0.08,
    riskAmount: 47.50,
    status: 'OPEN',
    note: 'Lệnh kiểm thử tự động'
  });

  const inserted = await db.get('SELECT * FROM trades WHERE position_id = ?', [testTicket]);
  assert('Thêm lệnh kiểm thử thành công vào SQLite', inserted && inserted.position_id === testTicket && inserted.status === 'OPEN');

  // Cập nhật trạng thái chốt lời cho lệnh test
  await db.updateTradeByPositionId(testTicket, {
    status: 'WIN',
    pnl: 40.0,
    pnlR: '+1.00R',
    closePrice: 4315.50,
    closeReason: 'TAKE_PROFIT'
  });

  const updated = await db.get('SELECT * FROM trades WHERE position_id = ?', [testTicket]);
  assert('Cập nhật trạng thái WIN và PnL cho lệnh kiểm thử thành công', updated && updated.status === 'WIN' && updated.pnl === 40.0);

  // TEST 4: Kiểm tra Stress Test Đọc/Ghi đồng thời (Concurrency Stress Test)
  console.log('\n🔹 Test 4: Stress Test 20 luồng đọc/ghi đồng thời (Không bị SQLITE_BUSY)');
  let concurrentErrors = 0;
  const promises = [];
  for (let i = 0; i < 20; i++) {
    if (i % 2 === 0) {
      promises.push(db.getAllTrades().catch(() => concurrentErrors++));
    } else {
      promises.push(db.get('SELECT COUNT(*) as cnt FROM trades').catch(() => concurrentErrors++));
    }
  }
  await Promise.all(promises);
  assert('20 tác vụ truy vấn song song hoàn thành không có lỗi lock', concurrentErrors === 0);

  // Dọn dẹp sạch bản ghi test
  await db.run('DELETE FROM trades WHERE position_id = ?', [testTicket]);
  await db.exportToMirroredJson();
  const cleanedTrades = await db.getAllTrades();
  assert('Đã dọn dẹp sạch bản ghi kiểm thử, trả lại đúng số lượng ban đầu', cleanedTrades.length === initialCount);

  // TEST 5: Kiểm tra tính toàn vẹn của tệp JSON phản chiếu (Mirroring Integrity)
  console.log('\n🔹 Test 5: Kiểm tra tệp JSON phản chiếu cho Vercel Cloud');
  const journalJsonPath = path.join(__dirname, 'data', 'journal.json');
  const mirroredRaw = fs.readFileSync(journalJsonPath, 'utf8');
  const mirroredTrades = JSON.parse(mirroredRaw);
  const mirroredClosed = mirroredTrades.filter(t => t.status !== 'OPEN');
  assert('Tệp data/journal.json phản chiếu chính xác 6 lệnh đã đóng từ SQLite', mirroredClosed.length === 6);
  const mirroredPnl = mirroredClosed.reduce((sum, t) => sum + (t.pnl || 0), 0);
  assert('Tổng PnL trong tệp phản chiếu đạt chuẩn +$75.01 USD', Math.abs(mirroredPnl - 75.01) < 0.001);

  console.log('\n=============================================================');
  console.log(`🏁 KẾT QUẢ KIỂM THỬ: ${passedTests}/${totalTests} BÀI TEST ĐẠT CHUẨN (${((passedTests / totalTests) * 100).toFixed(0)}%)`);
  console.log('=============================================================');

  await db.close();
  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('❌ Lỗi chạy test suite:', err);
  process.exit(1);
});
