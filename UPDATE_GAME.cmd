@echo off
cd /d "%~dp0"
node tools\build.mjs
if errorlevel 1 (
  echo Build failed. Please check the message above.
  pause
  exit /b 1
)
start "" "%~dp0index.html"
