Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$targetZip = "D:\Dashboard_Setup.zip"
$rootDir = "d:\Dashbord Setup"

if (Test-Path $targetZip) {
    Remove-Item $targetZip -Force
}

$zip = [System.IO.Compression.ZipFile]::Open($targetZip, [System.IO.Compression.ZipArchiveMode]::Create)

$excludeDirs = @('node_modules', '.git', 'dist', '.gemini')

Get-ChildItem -Path $rootDir -Recurse | Where-Object {
    $item = $_
    if ($item.PSIsContainer) { return $false }
    $rel = $item.FullName.Substring($rootDir.Length)
    $parts = $rel.Split([System.IO.Path]::DirectorySeparatorChar)
    foreach ($p in $parts) {
        if ($excludeDirs -contains $p) { return $false }
    }
    return $true
} | ForEach-Object {
    $relPath = $_.FullName.Substring($rootDir.Length + 1)
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, $relPath) | Out-Null
}

$zip.Dispose()
Write-Host "ZIP_SUCCESSFULLY_CREATED_AT_D_DRIVE"
