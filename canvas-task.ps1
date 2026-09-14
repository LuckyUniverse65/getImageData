param(
    [ValidateSet('Capture','Build','Test','Inspect')][string]$Action,
    [string]$ScriptPath = 'tests/browser-cases.js',
    [string]$OutputName = 'compatibility'
)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
switch ($Action) {
    'Inspect' {
        Add-Type -AssemblyName System.Drawing
        Add-Type -Path (Join-Path $PSScriptRoot 'tests/VisibleDevTools.cs')
        [VisibleDevToolsInput]::SetProcessDPIAware() | Out-Null
        [IO.Directory]::CreateDirectory((Join-Path $PSScriptRoot 'out')) | Out-Null
        foreach ($window in [VisibleDevToolsInput]::VisibleWindows()) {
            $process = Get-Process -Id $window.ProcessId -ErrorAction SilentlyContinue
            if ($process.ProcessName -ne 'chrome') { continue }
            $window | Select-Object Handle,ProcessId,Title,ClassName | ConvertTo-Json -Compress
            $rect = New-Object VisibleDevToolsInput+RECT
            [VisibleDevToolsInput]::GetWindowRect($window.Handle,[ref]$rect) | Out-Null
            if ($rect.Right -le $rect.Left -or $rect.Bottom -le $rect.Top) { continue }
            $bitmap = New-Object System.Drawing.Bitmap ($rect.Right-$rect.Left),($rect.Bottom-$rect.Top)
            $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
            $dc = $graphics.GetHdc()
            [VisibleDevToolsCapture]::PrintWindow($window.Handle,$dc,2) | Out-Null
            $graphics.ReleaseHdc($dc)
            $graphics.Dispose()
            $bitmap.Save((Join-Path $PSScriptRoot ('out/window-' + $window.Handle + '.png')))
            $bitmap.Dispose()
        }
    }
    'Capture' {
        & node "$PSScriptRoot/capture-cdp.cjs" $ScriptPath ('cdp-' + $OutputName)
        if ($LASTEXITCODE -ne 0) { throw 'CDP capture failed.' }
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
