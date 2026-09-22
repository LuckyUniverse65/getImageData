$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$osInfo = Get-CimInstance Win32_OperatingSystem
$processors = @(Get-CimInstance Win32_Processor | Select-Object Name, Manufacturer, NumberOfCores, NumberOfLogicalProcessors)
$graphics = @(Get-CimInstance Win32_VideoController | Select-Object Name, AdapterCompatibility, DriverVersion, DriverDate, PNPDeviceID)
$fontFiles = @()
$fontRoots = @((Join-Path $env:WINDIR 'Fonts'), (Join-Path $env:LOCALAPPDATA 'Microsoft\Windows\Fonts'))
foreach ($fontRoot in $fontRoots) {
    if (Test-Path -LiteralPath $fontRoot) {
        foreach ($file in Get-ChildItem -LiteralPath $fontRoot -File) {
            if ($file.Extension -notin '.ttf', '.ttc', '.otf', '.fon') { continue }
            try {
                $fontFiles += [ordered]@{path=$file.FullName; bytes=$file.Length; sha256=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash}
            } catch {
                $fontFiles += [ordered]@{path=$file.FullName; error=$_.Exception.Message}
            }
        }
    }
}
$result = [ordered]@{
    os=[ordered]@{caption=$osInfo.Caption; version=$osInfo.Version; build=$osInfo.BuildNumber; architecture=$osInfo.OSArchitecture; productType=$osInfo.ProductType}
    cpu=$processors
    graphics=$graphics
    fontFiles=$fontFiles
    fontInventoryNote='Installed font files; actual typefaces used by Canvas are reported separately from native diagnostics.'
}
$result | ConvertTo-Json -Depth 8 -Compress
