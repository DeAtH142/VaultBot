Set-Location c:\Users\nailc\Desktop\test\discord-bot
$files = @(Get-ChildItem src\commands\*.js) + @(Get-ChildItem src\*.js) + @(Get-ChildItem src\utils\*.js)
$bad = @()
foreach ($f in $files) {
  $bytes = [System.IO.File]::ReadAllBytes($f.FullName)
  $text = [System.Text.Encoding]::UTF8.GetString($bytes)
  $replacementCount = ($text.ToCharArray() | Where-Object { [int]$_ -eq 0xFFFD }).Count
  if ($replacementCount -gt 0) { $bad += "$($f.Name) ($replacementCount bozuk karakter)" }
}
Write-Output "Taranan dosya: $($files.Count)"
if ($bad.Count -gt 0) { Write-Output "BOZUK DOSYALAR:"; $bad | ForEach-Object { Write-Output "  $_" } }
else { Write-Output "HEPSI TEMIZ UTF-8" }
