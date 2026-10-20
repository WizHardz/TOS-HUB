# Creates a "TOS HUB" shortcut on your desktop that opens TOS HUB.exe from this folder.
# It only creates a shortcut. It doesn't install anything or change any settings.
$folder = Split-Path -Parent $MyInvocation.MyCommand.Path
$exe    = Join-Path $folder 'TOS HUB.exe'
if (-not (Test-Path -LiteralPath $exe)) {
    Write-Host "Couldn't find TOS HUB.exe in this folder. Keep all the files together and try again."
    exit 1
}
$desktop = [Environment]::GetFolderPath('Desktop')
$shell   = New-Object -ComObject WScript.Shell
$lnk     = $shell.CreateShortcut((Join-Path $desktop 'TOS HUB.lnk'))
$lnk.TargetPath       = $exe
$lnk.WorkingDirectory = $folder
$lnk.Description      = 'TOS HUB'
$lnk.IconLocation     = "$exe,0"
$lnk.Save()
Write-Host ""
Write-Host "Done! 'TOS HUB' is on your desktop."
Write-Host "Tip: open it, then right-click its taskbar icon and choose 'Pin to taskbar'."
Write-Host "Keep this folder where it is - the shortcut points to it."
