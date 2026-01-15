@echo off
setlocal enabledelayedexpansion

:: ================================
:: 🚀 CONFIGURACIÓN
:: ================================
set "TARGET_DIR=C:\Users\gabry\Desktop\Habana Express Store\test"
set "OUTPUT_FILE=habana_express_store_code.txt"

echo Borrando archivo anterior...
del "%OUTPUT_FILE%" >nul 2>&1

echo Escaneando proyecto: %TARGET_DIR%
echo Iniciando exportación...
echo.

:: ================================
:: 📌 Recorrer todos los archivos
:: ================================
for /r "%TARGET_DIR%" %%F in (*) do (

    set "file=%%F"
    set "skip=false"

    :: ❌ Ignorar carpeta uploads
    if /i not "!file:uploads\=!"=="!file!" (
        set "skip=true"
    )

    :: ❌ Ignorar archivos .bat
    if /i "!file:~-4!"==".bat" (
        set "skip=true"
    )

    :: ❌ Ignorar archivo .gitignore
    if /i "!file:~-9!"==".gitignore" (
        set "skip=true"
    )

    if "!skip!"=="true" (
        rem Saltar archivo
    ) else (
        echo Archivo encontrado: %%F

        (
            echo ============================================
            echo Archivo: %%F
            echo ============================================
            type "%%F"
            echo.
            echo.
        ) >> "%OUTPUT_FILE%"
    )
)

echo.
echo Exportación completada.
echo Archivo generado: %OUTPUT_FILE%

pause
