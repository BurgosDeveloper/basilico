@echo off
title Actualizando Accesos Directos - Basilico POS
echo =========================================================
echo ACTUALIZANDO ACCESOS DIRECTOS Y RUTAS DE ICONOS PARA ESTA PC
echo =========================================================
echo.
echo Por favor, espera mientras configuramos el icono y las rutas para esta PC...
node scripts/build-export.js
echo.
echo Accesos directos generados en la carpeta "export".
pause
