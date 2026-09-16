@echo off
echo ========================================================
echo   KHOI DONG CHROME TRADE CO LAP (PORT 9222 + DoH 1.1.1.1)
echo   TradingView (Brain) + Exness (Execution)
echo   KHONG ANH HUONG DEN CHROME CONG VIEC DANG MO
echo ========================================================

start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir=C:\Users\game\AppData\Local\Google\Chrome\User_Data_Trade --no-first-run --no-default-browser-check --start-minimized --disable-background-timer-throttling --disable-backgrounding-occluded-windows --disable-renderer-backgrounding "https://www.tradingview.com/chart/" "https://my.exness.com/webtrading/"
