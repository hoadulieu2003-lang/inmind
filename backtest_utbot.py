import sys
sys.stdout.reconfigure(encoding='utf-8')
import urllib.request
import json
import time
import math

def fetch_klines(symbol="PAXGUSDT", interval="15m", total_bars=5000):
    bars = []
    end_time = int(time.time() * 1000)
    limit = 1000
    
    print(f"Đang kéo {total_bars} nến {interval} của {symbol} từ Binance...")
    while len(bars) < total_bars:
        url = f"https://api.binance.com/api/v3/klines?symbol={symbol}&interval={interval}&limit={limit}&endTime={end_time}"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        try:
            with urllib.request.urlopen(req) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                if not data:
                    break
                # prepend older bars
                bars = data + bars
                end_time = data[0][0] - 1
                time.sleep(0.2)
        except Exception as e:
            print("Lỗi kéo dữ liệu:", e)
            break
            
    # deduplicate and sort
    seen = set()
    unique_bars = []
    for b in bars:
        if b[0] not in seen:
            seen.add(b[0])
            unique_bars.append(b)
    unique_bars.sort(key=lambda x: x[0])
    return unique_bars[-total_bars:]

def run_backtest(bars, keyvalue=1, atrperiod=10, dema_len=200, rr_ratio=1.5, use_filter=True):
    # Parse OHLCV
    opens = [float(b[1]) for b in bars]
    highs = [float(b[2]) for b in bars]
    lows = [float(b[3]) for b in bars]
    closes = [float(b[4]) for b in bars]
    n = len(closes)
    
    # 1. Calculate ATR
    tr = [0.0] * n
    tr[0] = highs[0] - lows[0]
    for i in range(1, n):
        tr[i] = max(highs[i] - lows[i], abs(highs[i] - closes[i-1]), abs(lows[i] - closes[i-1]))
    
    # RMA / Wilder's ATR
    atr = [0.0] * n
    atr[0] = tr[0]
    for i in range(1, n):
        atr[i] = (atr[i-1] * (atrperiod - 1) + tr[i]) / atrperiod

    # 2. Calculate DEMA 200
    alpha = 2.0 / (dema_len + 1.0)
    ema1 = [0.0] * n
    ema1[0] = closes[0]
    for i in range(1, n):
        ema1[i] = alpha * closes[i] + (1 - alpha) * ema1[i-1]
    
    ema2 = [0.0] * n
    ema2[0] = ema1[0]
    for i in range(1, n):
        ema2[i] = alpha * ema1[i] + (1 - alpha) * ema2[i-1]
        
    dema = [2 * ema1[i] - ema2[i] for i in range(n)]

    # 3. UT Bot Alerts Trailing Stop
    trail_stop = [0.0] * n
    buy_signals = [False] * n
    sell_signals = [False] * n

    for i in range(1, n):
        src = closes[i]
        src_prev = closes[i-1]
        nLoss = keyvalue * atr[i]
        prev_stop = trail_stop[i-1]

        if src > prev_stop and src_prev > prev_stop:
            curr_stop = max(prev_stop, src - nLoss)
        elif src < prev_stop and src_prev < prev_stop:
            curr_stop = min(prev_stop, src + nLoss)
        elif src > prev_stop:
            curr_stop = src - nLoss
        else:
            curr_stop = src + nLoss
        trail_stop[i] = curr_stop

        crossover = (src_prev <= prev_stop) and (src > curr_stop)
        crossunder = (src_prev >= prev_stop) and (src < curr_stop)

        buy_signals[i] = (src > curr_stop) and crossover
        sell_signals[i] = (src < curr_stop) and crossunder

    trades = []
    in_pos = False
    pos_type = None
    entry_price = 0.0
    sl_price = 0.0
    tp_price = 0.0
    entry_idx = 0

    start_bar = dema_len + 50 if use_filter else 50

    for i in range(start_bar, n):
        if not in_pos:
            # Check Buy
            buy_cond = buy_signals[i] and (closes[i] > dema[i]) if use_filter else buy_signals[i]
            if buy_cond:
                in_pos = True
                pos_type = 'BUY'
                entry_price = closes[i]
                entry_idx = i
                sl_dist = max(entry_price - trail_stop[i], 1.2 * atr[i])
                sl_price = entry_price - sl_dist
                tp_price = entry_price + rr_ratio * sl_dist
                continue

            # Check Sell
            sell_cond = sell_signals[i] and (closes[i] < dema[i]) if use_filter else sell_signals[i]
            if sell_cond:
                in_pos = True
                pos_type = 'SELL'
                entry_price = closes[i]
                entry_idx = i
                sl_dist = max(trail_stop[i] - entry_price, 1.2 * atr[i])
                sl_price = entry_price + sl_dist
                tp_price = entry_price - rr_ratio * sl_dist
                continue
        else:
            # In position: check exit on high/low of subsequent bars
            h = highs[i]
            l = lows[i]

            if pos_type == 'BUY':
                hit_tp = h >= tp_price
                hit_sl = l <= sl_price
                if hit_sl and hit_tp:
                    # Worst case: hit SL first
                    trades.append({'type': 'BUY', 'r': -1.0, 'bars': i - entry_idx})
                    in_pos = False
                elif hit_tp:
                    trades.append({'type': 'BUY', 'r': rr_ratio, 'bars': i - entry_idx})
                    in_pos = False
                elif hit_sl:
                    trades.append({'type': 'BUY', 'r': -1.0, 'bars': i - entry_idx})
                    in_pos = False

            elif pos_type == 'SELL':
                hit_tp = l <= tp_price
                hit_sl = h >= sl_price
                if hit_sl and hit_tp:
                    trades.append({'type': 'SELL', 'r': -1.0, 'bars': i - entry_idx})
                    in_pos = False
                elif hit_tp:
                    trades.append({'type': 'SELL', 'r': rr_ratio, 'bars': i - entry_idx})
                    in_pos = False
                elif hit_sl:
                    trades.append({'type': 'SELL', 'r': -1.0, 'bars': i - entry_idx})
                    in_pos = False

    # Stats calculation
    total_trades = len(trades)
    if total_trades == 0:
        return None

    wins = [t for t in trades if t['r'] > 0]
    losses = [t for t in trades if t['r'] < 0]
    win_rate = len(wins) / total_trades * 100

    total_gain = sum(t['r'] for t in wins)
    total_loss = abs(sum(t['r'] for t in losses)) if losses else 0.0001
    profit_factor = total_gain / total_loss
    net_r = sum(t['r'] for t in trades)

    # Max Drawdown in R
    equity_curve = [0.0]
    peak = 0.0
    max_dd = 0.0
    curr = 0.0
    for t in trades:
        curr += t['r']
        equity_curve.append(curr)
        if curr > peak:
            peak = curr
        dd = peak - curr
        if dd > max_dd:
            max_dd = dd

    return {
        'total_trades': total_trades,
        'win_rate': win_rate,
        'profit_factor': profit_factor,
        'net_r': net_r,
        'max_dd_r': max_dd,
        'wins': len(wins),
        'losses': len(losses)
    }

if __name__ == '__main__':
    bars = fetch_klines(symbol="PAXGUSDT", interval="15m", total_bars=5000)
    print(f"Đã tải {len(bars)} cây nến thực tế từ Binance. Bắt đầu mô phỏng kiểm định định lượng...")

    print("\n--- THỬ NGHIỆM 1: UT Bot (Key=1, ATR=10) KHÔNG CÓ BỘ LỌC DEMA 200 (Đánh thuần túy) ---")
    res_raw = run_backtest(bars, keyvalue=1, atrperiod=10, dema_len=200, rr_ratio=1.5, use_filter=False)
    print(f"Tổng lệnh: {res_raw['total_trades']}, Win Rate: {res_raw['win_rate']:.1f}%, Profit Factor: {res_raw['profit_factor']:.2f}, Net R: {res_raw['net_r']:.1f}R, Max DD: {res_raw['max_dd_r']:.1f}R")

    print("\n--- THỬ NGHIỆM 2: UT Bot (Key=1, ATR=10) + DEMA 200 (Chiến lược hiện tại của Anh) ---")
    res_dema = run_backtest(bars, keyvalue=1, atrperiod=10, dema_len=200, rr_ratio=1.5)
    print(f"Tổng lệnh: {res_dema['total_trades']}, Win Rate: {res_dema['win_rate']:.1f}%, Profit Factor: {res_dema['profit_factor']:.2f}, Net R: {res_dema['net_r']:.1f}R, Max DD: {res_dema['max_dd_r']:.1f}R")

    print("\n--- THỬ NGHIỆM 3: UT Bot (Key=2, ATR=10) + DEMA 200 (Làm mượt tín hiệu) ---")
    res_key2 = run_backtest(bars, keyvalue=2, atrperiod=10, dema_len=200, rr_ratio=1.5)
    print(f"Tổng lệnh: {res_key2['total_trades']}, Win Rate: {res_key2['win_rate']:.1f}%, Profit Factor: {res_key2['profit_factor']:.2f}, Net R: {res_key2['net_r']:.1f}R, Max DD: {res_key2['max_dd_r']:.1f}R")

    print("\n--- THỬ NGHIỆM 4: UT Bot (Key=2, ATR=10) + DEMA 200 với R:R = 1:2.0 ---")
    res_rr2 = run_backtest(bars, keyvalue=2, atrperiod=10, dema_len=200, rr_ratio=2.0)
    print(f"Tổng lệnh: {res_rr2['total_trades']}, Win Rate: {res_rr2['win_rate']:.1f}%, Profit Factor: {res_rr2['profit_factor']:.2f}, Net R: {res_rr2['net_r']:.1f}R, Max DD: {res_rr2['max_dd_r']:.1f}R")
