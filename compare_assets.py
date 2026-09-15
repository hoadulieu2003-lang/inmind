import sys
sys.stdout.reconfigure(encoding='utf-8')
import urllib.request
import json
from backtest_utbot import run_backtest, fetch_klines

def test_symbol(sym, total_bars=3000):
    bars = fetch_klines(symbol=sym, interval="15m", total_bars=total_bars)
    print(f"\n==================== {sym} ({len(bars)} nến M15) ====================")
    for k in [1, 2, 3]:
        for atr in [10]:
            res = run_backtest(bars, keyvalue=k, atrperiod=atr, dema_len=200, rr_ratio=1.5)
            if res:
                print(f"Key={k}, ATR={atr} + DEMA 200: Số lệnh={res['total_trades']:3d} | WinRate={res['win_rate']:4.1f}% | PF={res['profit_factor']:4.2f} | Net R={res['net_r']:5.1f}R | Max DD={res['max_dd_r']:4.1f}R")

if __name__ == '__main__':
    test_symbol("PAXGUSDT", total_bars=3000) # Gold
    test_symbol("BTCUSDT", total_bars=3000)  # Bitcoin
