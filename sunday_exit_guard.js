const fs = require('fs');
const path = require('path');

const PORT = 9222;
const ARTIFACT_DIR = 'C:/Users/game/.gemini/antigravity/brain/7dcc60b1-adfa-4de9-9a30-14e7aa6e806a';
const LOG_FILE = path.join(__dirname, 'sunday_exit_guard.log');

function log(msg) {
  const ts = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  const line = `[${ts}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch (e) {}
}

const delay = ms => new Promise(r => setTimeout(r, ms));

async function cdpCall(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1000000);
    const timeout = setTimeout(() => {
      ws.removeEventListener('message', handler);
      reject(new Error(`CDP Timeout for ${method}`));
    }, 20000);

    const handler = (e) => {
      const res = JSON.parse(e.data);
      if (res.id === id) {
        clearTimeout(timeout);
        ws.removeEventListener('message', handler);
        if (res.error) reject(res.error);
        else resolve(res.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function getExnessTab() {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json`);
    const tabs = await res.json();
    const exness = tabs.find(t => t.type === 'page' && t.url.includes('my.exness.com/webtrading'));
    return exness ? exness.id : null;
  } catch (err) {
    log(`[CONNECTION ERROR] Không thể kết nối tới Chrome cổng ${PORT}: ${err.message}`);
    return null;
  }
}

async function executeMarketReopenExit() {
  log(`\n================================================================`);
  log(`🚀 [SUNDAY REOPEN EXIT] BẮT ĐẦU CHU TRÌNH TẤT TOÁN MỞ PHIÊN CHỦ NHẬT`);
  log(`================================================================`);

  const tabId = await getExnessTab();
  if (!tabId) {
    log(`❌ [FATAL] Không tìm thấy tab Exness Web Terminal trên cổng ${PORT}. Vui lòng mở Chrome với --remote-debugging-port=9222.`);
    return false;
  }

  log(`[CDP] Đã kết nối tab Exness Web Terminal (ID: ${tabId})`);
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/devtools/page/${tabId}`);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
    setTimeout(() => reject(new Error('WebSocket connect timeout')), 5000);
  });

  // 1. Đảm bảo tab "Mở" (Open Positions) đang được hiển thị
  log(`[STEP 1] Kích hoạt và kiểm tra bảng vị thế "Mở"...`);
  await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const tabs = Array.from(document.querySelectorAll('*')).filter(el => {
        return (el.children.length === 0 || el.children.length === 1) && el.innerText && el.innerText.trim() === 'Mở';
      });
      if (tabs.length > 0) tabs[0].click();
    })()`
  });
  await delay(1200);

  // 2. Đọc trạng thái tài khoản và các vị thế trước khi đóng
  const beforeState = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const rows = Array.from(document.querySelectorAll('[role="row"], tr, div[class*="Row"]')).map(r => r.innerText.replace(/\\s+/g, ' '));
      const activePositions = rows.filter(r => (r.includes('Mua') || r.includes('Bán')) && (r.includes('XAU/USD') || r.includes('USOIL') || r.includes('BTC')));
      
      const balanceMatch = document.body.innerText.match(/Số dư[\\s\\n]+([\\d,\\.]+)/i);
      const equityMatch = document.body.innerText.match(/Vốn[\\s\\n]+([\\d,\\.]+)/i);
      
      return {
        balance: balanceMatch ? balanceMatch[1] : 'N/A',
        equity: equityMatch ? equityMatch[1] : 'N/A',
        activePositions
      };
    })()`,
    returnByValue: true
  });

  log(`[ACCOUNT BEFORE] Số dư: $${beforeState.result?.value?.balance} | Vốn: $${beforeState.result?.value?.equity}`);
  log(`[POSITIONS BEFORE] Phát hiện ${beforeState.result?.value?.activePositions?.length || 0} vị thế mở:`);
  (beforeState.result?.value?.activePositions || []).forEach((p, idx) => log(`   #${idx + 1}: ${p}`));

  if ((beforeState.result?.value?.activePositions || []).length === 0) {
    log(`ℹ️ [INFO] Không phát hiện vị thế mở nào cần tất toán.`);
    ws.close();
    return true;
  }

  // 3. Thực hiện vòng lặp đóng lệnh (tối đa 5 lần thử trong trường hợp sàn mở nến trễ)
  let exitSuccess = false;
  for (let attempt = 1; attempt <= 5; attempt++) {
    log(`[STEP 2 - LẦN THỬ ${attempt}/5] Thực hiện thao tác Đóng tất cả / Đóng từng vị thế...`);

    const actionRes = await cdpCall(ws, 'Runtime.evaluate', {
      expression: `(async () => {
        const delay = ms => new Promise(res => setTimeout(res, ms));
        const actions = [];

        // Tìm nút "Đóng tất cả"
        const closeAllBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText && b.innerText.includes('Đóng tất cả'));
        if (closeAllBtn) {
          closeAllBtn.click();
          actions.push('click_close_all');
          await delay(800);

          // Chọn mục "Tất cả các vị thế" nếu có dropdown
          const allOption = Array.from(document.querySelectorAll('*')).find(el => {
            return el.children.length === 0 && (el.innerText === 'Tất cả các vị thế' || el.innerText === 'Tất cả');
          });
          if (allOption) {
            allOption.click();
            actions.push('select_all_positions');
            await delay(800);
          }

          // Nhấn nút Xác nhận nếu có modal
          const confirmBtn = Array.from(document.querySelectorAll('button')).find(b => {
            const txt = b.innerText?.trim();
            return txt === 'Xác nhận' || txt === 'Đóng' || txt === 'Đóng tất cả';
          });
          if (confirmBtn) {
            confirmBtn.click();
            actions.push('confirm_modal');
            await delay(1200);
          }
        } else {
          // Dự phòng: Đóng từng dòng
          const rows = Array.from(document.querySelectorAll('[role="row"]')).filter(r => {
            const t = r.innerText || '';
            return (t.includes('Mua') || t.includes('Bán')) && (t.includes('XAU/USD') || t.includes('USOIL'));
          });
          for (const row of rows) {
            const btns = Array.from(row.querySelectorAll('button'));
            if (btns.length > 0) {
              const closeBtn = btns[btns.length - 1];
              if (closeBtn) {
                closeBtn.click();
                actions.push('click_row_close');
                await delay(600);

                const modalConfirm = Array.from(document.querySelectorAll('button')).find(b => {
                  const t = b.innerText?.trim();
                  return t === 'Xác nhận' || t === 'Đóng' || t === 'Đóng vị thế';
                });
                if (modalConfirm) {
                  modalConfirm.click();
                  actions.push('confirm_row_modal');
                  await delay(800);
                }
              }
            }
          }
        }

        return { actions };
      })()`,
      returnByValue: true,
      awaitPromise: true
    });

    log(`   Thao tác DOM đã thực hiện: ${JSON.stringify(actionRes.result?.value?.actions || [])}`);
    await delay(3000);

    // Kiểm tra lại danh sách vị thế sau khi đóng
    const checkState = await cdpCall(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const rows = Array.from(document.querySelectorAll('[role="row"], tr, div[class*="Row"]')).map(r => r.innerText.replace(/\\s+/g, ' '));
        const activePositions = rows.filter(r => (r.includes('Mua') || r.includes('Bán')) && (r.includes('XAU/USD') || r.includes('USOIL')));
        return { remainingCount: activePositions.length, rows: activePositions };
      })()`,
      returnByValue: true
    });

    if ((checkState.result?.value?.remainingCount || 0) === 0) {
      exitSuccess = true;
      log(`🎉 [THÀNH CÔNG] Toàn bộ vị thế Vàng và Dầu đã được tất toán thành công trên sàn Exness!`);
      break;
    } else {
      log(`⚠️ [CẢNH BÁO] Vẫn còn ${checkState.result?.value?.remainingCount} vị thế chưa khớp (Có thể sàn đang xử lý mở phiên). Chờ 5 giây thử lại...`);
      await delay(5000);
    }
  }

  // 4. Đọc trạng thái tài khoản sau khi tất toán
  await delay(2000);
  const afterState = await cdpCall(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const balanceMatch = document.body.innerText.match(/Số dư[\\s\\n]+([\\d,\\.]+)/i);
      const equityMatch = document.body.innerText.match(/Vốn[\\s\\n]+([\\d,\\.]+)/i);
      return {
        balance: balanceMatch ? balanceMatch[1] : 'N/A',
        equity: equityMatch ? equityMatch[1] : 'N/A'
      };
    })()`,
    returnByValue: true
  });

  log(`[ACCOUNT AFTER] Số dư mới: $${afterState.result?.value?.balance} | Vốn mới: $${afterState.result?.value?.equity}`);

  // 5. Chụp ảnh minh chứng
  const snap = await cdpCall(ws, 'Page.captureScreenshot', { format: 'png' });
  if (snap?.data) {
    const proofFile = path.join(ARTIFACT_DIR, 'exness_sunday_reopen_exit.png');
    fs.writeFileSync(proofFile, Buffer.from(snap.data, 'base64'));
    log(`📸 [MINH CHỨNG] Đã lưu ảnh chụp kết quả tất toán: exness_sunday_reopen_exit.png`);
  }

  ws.close();

  // 6. Xuất báo cáo JSON
  const report = {
    timestamp: new Date().toISOString(),
    exitSuccess,
    before: beforeState.result?.value,
    after: afterState.result?.value
  };
  fs.writeFileSync(path.join(__dirname, 'sunday_exit_report.json'), JSON.stringify(report, null, 2));
  log(`[REPORT] Đã ghi báo cáo: sunday_exit_report.json\n`);

  return exitSuccess;
}

async function startScheduler() {
  log(`🛡️ [SUNDAY EXIT GUARD] ĐÃ KHỞI TẠO VỆ BINH TẤT TOÁN MỞ PHIÊN CHỦ NHẬT.`);
  
  if (process.argv.includes('--now')) {
    log(`[MANUAL OVERRIDE] Phát hiện cờ --now. Thực thi tất toán ngay lập tức...`);
    await executeMarketReopenExit();
    return;
  }

  // Tính toán thời gian mục tiêu: Sáng Thứ Hai 05:01:00 UTC+7 (Tương ứng 22:01 UTC Chủ Nhật của sàn Exness)
  const now = new Date();
  let target = new Date(now);

  if (now.getDay() === 0) {
    // Đang là Chủ Nhật -> chuyển sang rạng sáng Thứ Hai lúc 05:01
    target.setDate(now.getDate() + 1);
    target.setHours(5, 1, 0, 0);
  } else if (now.getDay() === 1 && (now.getHours() < 5 || (now.getHours() === 5 && now.getMinutes() < 1))) {
    // Đang là rạng sáng Thứ Hai trước 05:01
    target.setHours(5, 1, 0, 0);
  } else {
    // Sau 05:01 Thứ Hai -> hẹn Thứ Hai tuần kế tiếp
    const daysUntilNextMonday = (1 + 7 - now.getDay()) % 7 || 7;
    target.setDate(now.getDate() + daysUntilNextMonday);
    target.setHours(5, 1, 0, 0);
  }

  const msToWait = target.getTime() - now.getTime();
  const hoursLeft = (msToWait / (1000 * 60 * 60)).toFixed(2);

  log(`[TARGET TIME] Thời điểm kích hoạt mục tiêu: ${target.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })} (Còn đúng ${hoursLeft} giờ nữa)`);
  log(`[COUNTDOWN] Bắt đầu chế độ ngủ đếm ngược có kiểm tra nhịp tim...`);

  const timer = setInterval(async () => {
    const remainingMs = target.getTime() - Date.now();
    if (remainingMs <= 0) {
      clearInterval(timer);
      log(`⏰ [ALARM FIRED] ĐÃ ĐẾN 05:01 SÁNG THỨ HAI! SÀN EXNESS MỞ CỬA! KÍCH HOẠT QUY TRÌNH TẤT TOÁN VÀNG & DẦU NGAY LẬP TỨC!`);
      await executeMarketReopenExit();
    } else if (remainingMs % (30 * 60 * 1000) < 5000) {
      const remHours = (remainingMs / (1000 * 3600)).toFixed(1);
      log(`⏳ [COUNTDOWN] Vệ binh đang trực chiến. Còn ${remHours} giờ tới thời điểm mở phiên 05:01 Sáng Thứ Hai...`);
    }
  }, 1000);
}

startScheduler().catch(err => {
  log(`[FATAL EXCEPTION] ${err.message}`);
});
