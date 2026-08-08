$targetZip = "D:\Dashboard_Setup.zip"
$rootDir = "d:\Dashbord Setup"

if (Test-Path $targetZip) {
    Remove-Item $targetZip -Force
}

$items = Get-ChildItem -Path $rootDir | Where-Object { 
    $_.Name -ne 'node_modules' -and $_.Name -ne '.git' -and $_.Name -ne 'create_zip.ps1' 
}

Compress-Archive -Path $items.FullName -DestinationPath $targetZip -Force

Write-Host "ZIP_CREATED_SUCCESSFULLY"
