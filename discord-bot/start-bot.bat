 @echo off
title Vault Bot - Auto Restart
chcp 65001 >nul
cd /d "%~dp0"

:loop
echo [%date% %time%] Bot baslatiliyor...
node src/index.js
echo [%date% %time%] Bot kapandi! 3 saniye icinde yeniden baslatiliyor...
timeout /t 3 /nobreak >nul
goto loop
