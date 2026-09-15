const { TradingDaemon } = require('./daemon_monitor.js');

async function dryRunScan() {
  console.log('====================================================');
  console.log('🚀 KHỞI ĐỘNG CHU TRÌNH DRY-RUN QUÉT M15 THỰC TẾ TRÊN CHROME CDP');
  console.log('====================================================\n');

  const daemon = new TradingDaemon();
  const startTime = Date.now();

  try {
    const tabsOk = await daemon.discoverTabs();
    if (!tabsOk) {
      throw new Error(`Không thể tìm thấy đủ tab TradingView và Exness trên cổng CDP ${daemon.port}`);
    }

    console.log(`[STATUS] Kết nối thành công tới Chrome CDP:`);
    console.log(` - Tab TradingView ID: ${daemon.tvTabId}`);
    console.log(` - Tab Exness ID: ${daemon.exnessTabId}`);

    console.log(`\n[EXECUTION] Bắt đầu thực thi chu trình quét runM15Scan()...`);
    await daemon.runM15Scan();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n====================================================`);
    console.log(`✅ CHU TRÌNH DRY-RUN HOÀN TẤT THÀNH CÔNG trong ${elapsed} giây!`);
    console.log('====================================================');
    process.exit(0);
  } catch (err) {
    console.error(`\n❌ [DRY-RUN FAILED] Lỗi trong chu trình quét: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  }
}

dryRunScan();
