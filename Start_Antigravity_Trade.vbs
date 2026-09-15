' Start_Antigravity_Trade.vbs - Tu dong khoi dong Bot Trade khi mo may tinh Windows
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\game\Documents\app\trade"
WScript.Sleep 6000
WshShell.Run "node auto_starter.js", 0, False
