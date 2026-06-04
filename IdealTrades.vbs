Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

projectPath = fso.GetParentFolderName(WScript.ScriptFullName)
appPath = projectPath & "\Helper\App"

shell.Run "%ComSpec% /c cd /d """ & appPath & """ && npm run dev", 0, False
WScript.Sleep 2500
shell.Run "http://localhost:6776", 1, False
