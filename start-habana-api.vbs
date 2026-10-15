Set WshShell = CreateObject("WScript.Shell")

' 3. Iniciar el Backend (API) silenciosamente
' Entramos a la carpeta y ejecutamos npm start
WshShell.Run "cmd.exe /c cd C:\Dev\Habana Express Store\habana-express-api && npm start", 0, False