param(
    [ValidateSet('Capture','Build','Test')][string]$Action,
    [string]$ScriptPath = 'tests/browser-cases.js',
    [string]$OutputName = 'compatibility'
)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
switch ($Action) {
    'Capture' {
        & "$PSScriptRoot/visible-f12-demo.ps1" -ScriptPath $ScriptPath -OutputName $OutputName
        if (-not $?) { throw 'F12 capture failed.' }
    }
    'Build' {
        & cargo build --release
        if ($LASTEXITCODE -ne 0) { throw 'Native build failed.' }
        Copy-Item -LiteralPath 'target/release/webgl.dll' -Destination 'webgl.node' -Force
    }
    'Test' {
        & node test.js
        if ($LASTEXITCODE -ne 0) { throw 'Canvas tests failed.' }
    }
}
