@echo off
REM Pervane Test Laboratuvari - degisiklikleri hemen yeni surum olarak GitHub'a yukler.
REM Kullanim: cift tikla (kucuk surum: 1.0.x)
REM           veya: surum-yayinla.bat minor   (yeni ozellik: 1.x.0)
REM           veya: surum-yayinla.bat major   (buyuk degisiklik: x.0.0)
set BUMP=%1
if "%BUMP%"=="" set BUMP=patch
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\surum-yayinla.ps1" -Bump %BUMP%
pause
