@echo off
title Cortai
cd /d "%~dp0"

if not exist node_modules (
  echo Instalando dependencias do app...
  call npm install || goto erro
)

if not exist engine\.venv (
  echo Preparando o motor Python...
  call npm run engine:setup || goto erro
)

echo Abrindo o Cortai...
call npm run dev
goto :eof

:erro
echo.
echo Falhou. Veja a mensagem acima.
pause
