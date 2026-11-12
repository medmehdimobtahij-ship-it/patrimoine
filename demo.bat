@echo off
rem Patrimoine : demo hors ligne (donnees inventees, aucun compte externe). Necessite Node.js 18+.
setlocal
cd /d "%~dp0"
if "%PORT%"=="" set "PORT=8787"
node -v >nul 2>nul
if errorlevel 1 (
  echo Node.js introuvable. Installez Node.js 18 ou plus recent : https://nodejs.org
  pause
  exit /b 1
)
if not "%SANS_NAVIGATEUR%"=="1" start "" "http://localhost:%PORT%/?demo"
node tools\serve.mjs %PORT%
