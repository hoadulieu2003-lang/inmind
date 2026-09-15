const http = require('http');
const config = require('./config.json');
const riskManager = require('./risk_manager.js');

class TradeEngine {
  constructor(port = config.cdp.port) {
    this.port = port;
    this.tvTabId = null;
    this.exnessTabId = null;
  }

  /**
   * Khám phá và liên kết các tab đang mở
   */
  async discoverTabs() {
    return new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${this.port}/json/list`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const list = JSON.parse(data);
            const pages = list.filter(t => t.type === 'page');
            
            const tv = pages.find(p => p.url.includes('tradingview.com'));
            const exness = pages.find(p => p.url.includes('my.exness.com/webtrading'));

            if (tv) this.tvTabId = tv.id;
            if (exness) this.exnessTabId = exness.id;

            resolve({
              tradingView: tv ? { id: tv.id, title: tv.title } : null,
              exness: exness ? { id: exness.id, title: exness.title } : null
            });
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', reject);
    });
  }

  /**
   * Đọc trạng thái tài khoản và giá thị trường thời gian thực trên Exness
   */
  async getExnessState() {
    if (!this.exnessTabId) await this.discoverTabs();
    if (!this.exnessTabId) throw new Error('Không tìm thấy tab Exness Webtrading!');

    return this.evaluateScript(this.exnessTabId, `(() => {
      const bottomBar = document.body.innerText;
      const balanceMatch = bottomBar.match(/Tài sản:\\s*([\\d,.]+)\\s*USD/);
      const freeMarginMatch = bottomBar.match(/Tiền Ký Quỹ Khả Dụng:\\s*([\\d,.]+)\\s*USD/);
      const equityMatch = bottomBar.match(/Số dư:\\s*([\\d,.]+)\\s*USD/);

      const sellBtn = document.querySelector('.OrderButton_sell__f2c8b') || document.querySelector('[class*="OrderButton_sell"]');
      const buyBtn = document.querySelector('.OrderButton_buy__f2c8b') || document.querySelector('[class*="OrderButton_buy"]');

      const sellText = sellBtn ? sellBtn.innerText.replace(/\\s+/g, ' ') : '';
      const buyText = buyBtn ? buyBtn.innerText.replace(/\\s+/g, ' ') : '';

      const sellPrice = parseFloat(sellText.replace(/[^0-9.]/g, ''));
      const buyPrice = parseFloat(buyText.replace(/[^0-9.]/g, ''));

      const volInput = document.getElementById('_r_4e_') || document.querySelector('input[value="0.01"]');
      const tpInput = document.getElementById('_r_4f_');
      const slInput = document.getElementById('_r_4h_');

      return {
        balance: balanceMatch ? parseFloat(balanceMatch[1].replace(/,/g, '')) : 10000,
        freeMargin: freeMarginMatch ? parseFloat(freeMarginMatch[1].replace(/,/g, '')) : 10000,
        equity: equityMatch ? parseFloat(equityMatch[1].replace(/,/g, '')) : 10000,
        sellPrice: isNaN(sellPrice) ? null : sellPrice,
        buyPrice: isNaN(buyPrice) ? null : buyPrice,
        spread: (!isNaN(sellPrice) && !isNaN(buyPrice)) ? +(buyPrice - sellPrice).toFixed(3) : 0,
        currentVolume: volInput ? volInput.value : '0.01',
        ready: !!(sellBtn && buyBtn)
      };
    })()`);
  }

  /**
   * Đặt các tham số lệnh trên Exness Webtrading
   */
  async setOrderParameters({ volume, stopLoss, takeProfit }) {
    if (!this.exnessTabId) await this.discoverTabs();
    
    return this.evaluateScript(this.exnessTabId, `(() => {
      function setReactInputValue(input, val) {
        if (!input) return false;
        const lastVal = input.value;
        input.value = val;
        const event = new Event('input', { bubbles: true });
        const tracker = input._valueTracker;
        if (tracker) tracker.setValue(lastVal);
        input.dispatchEvent(event);
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }

      // 1. Điền Volume
      const volInput = document.getElementById('_r_4e_') || Array.from(document.querySelectorAll('input')).find(i => i.value && !isNaN(parseFloat(i.value)));
      if (volInput && ${volume !== undefined}) {
        setReactInputValue(volInput, '${volume}');
      }

      // 2. Điền Take Profit (Chốt lời)
      const tpInput = document.getElementById('_r_4f_');
      if (tpInput && ${takeProfit !== undefined}) {
        setReactInputValue(tpInput, '${takeProfit}');
      }

      // 3. Điền Stop Loss (Cắt lỗ)
      const slInput = document.getElementById('_r_4h_');
      if (slInput && ${stopLoss !== undefined}) {
        setReactInputValue(slInput, '${stopLoss}');
      }

      return {
        setVolume: volInput ? volInput.value : null,
        setTP: tpInput ? tpInput.value : null,
        setSL: slInput ? slInput.value : null
      };
    })()`);
  }

  /**
   * Thực thi lệnh thị trường trên Exness Webtrading
   */
  async executeMarketOrder({ action, volume, stopLoss, takeProfit }) {
    const isBuy = action.toUpperCase() === 'BUY';
    const isSell = action.toUpperCase() === 'SELL';

    if (!isBuy && !isSell) throw new Error('Hành động không hợp lệ, phải là BUY hoặc SELL');

    // 1. Chọn hướng Mua/Bán trước để kích hoạt panel
    const initialSelector = isBuy ? '.OrderButton_buy__f2c8b' : '.OrderButton_sell__f2c8b';
    await this.evaluateScript(this.exnessTabId, `(() => {
      const btn = document.querySelector('${initialSelector}');
      if (btn) btn.click();
    })()`);

    // 2. Điền thông số lệnh (Volume, SL, TP)
    await this.setOrderParameters({ volume, stopLoss, takeProfit });

    // 3. Click nút Xác nhận (Confirm button)
    const confirmPrefix = isBuy ? 'Xác nhận Mua' : 'Xác nhận Bán';
    return this.evaluateScript(this.exnessTabId, `(() => {
      const confirmBtn = Array.from(document.querySelectorAll('button')).find(b => {
        return b.innerText.includes('${confirmPrefix}') || b.innerText.includes('Xác nhận');
      });
      if (confirmBtn) {
        confirmBtn.click();
        return { success: true, clicked: confirmBtn.innerText.trim(), time: new Date().toISOString() };
      }
      return { success: false, error: 'Không tìm thấy nút xác nhận lệnh' };
    })()`);
  }

  /**
   * Helper gửi lệnh evaluate script qua WebSocket CDP
   */
  async evaluateScript(tabId, script) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${this.port}/devtools/page/${tabId}`);
      ws.onopen = () => {
        ws.send(JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: { expression: script, returnByValue: true }
        }));
      };
      ws.onmessage = (e) => {
        const res = JSON.parse(e.data);
        ws.close();
        if (res.result && res.result.result) {
          resolve(res.result.result.value);
        } else {
          resolve(res);
        }
      };
      ws.onerror = reject;
    });
  }
}

module.exports = new TradeEngine();
