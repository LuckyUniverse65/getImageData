param([string]$ScriptPath = 'demo.js', [string]$OutputName = 'demo')
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$scriptFile = [IO.Path]::GetFullPath((Join-Path $projectRoot $ScriptPath))
if (-not $scriptFile.StartsWith($projectRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Script must be inside the project.' }
if ($OutputName -notmatch '^[a-zA-Z0-9_-]+$') { throw 'Invalid output name.' }
$outputDir = Join-Path $projectRoot 'out'
[IO.Directory]::CreateDirectory($outputDir) | Out-Null
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -Path (Join-Path $projectRoot 'tests/VisibleDevTools.cs')
[VisibleDevToolsInput]::SetProcessDPIAware() | Out-Null
$targets = @([VisibleDevToolsInput]::VisibleWindows() | Where-Object {
    $_.Title -like 'DevTools -*' -and (Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue).ProcessName -eq 'chrome'
})
if ($targets.Count -ne 1) { throw 'Expected one existing detached Chrome F12 Console. No browser will be started.' }
$target = $targets[0]
$targetProcess = Get-Process -Id $target.ProcessId
$rect = New-Object VisibleDevToolsInput+RECT
[VisibleDevToolsInput]::GetWindowRect($target.Handle,[ref]$rect) | Out-Null
$oldClipboard = [System.Windows.Forms.Clipboard]::GetDataObject()
$runId = [Guid]::NewGuid().ToString('N')
try {
    [VisibleDevToolsInput]::SetWindowPos($target.Handle,[IntPtr](-1),0,0,0,0,0x0043) | Out-Null
    [VisibleDevToolsInput]::ShowWindowAsync($target.Handle,9) | Out-Null
    [VisibleDevToolsInput]::SetForegroundWindow($target.Handle) | Out-Null
    Start-Sleep -Milliseconds 400
    [VisibleDevToolsInput]::GetWindowRect($target.Handle,[ref]$rect) | Out-Null
    $renderWindow = [VisibleDevToolsInput]::FindRenderWidget($target.Handle)
    if ($renderWindow -eq [IntPtr]::Zero) { throw 'Cannot locate the existing F12 render widget.' }
    [VisibleDevToolsInput]::Click(($rect.Left + 80),($rect.Top + 170))
    Start-Sleep -Milliseconds 200
    [VisibleDevToolsInput]::ControlKey(0x4C)
    Start-Sleep -Milliseconds 300
    [VisibleDevToolsInput]::Click(($rect.Left + 80),($rect.Top + 170))
    [VisibleDevToolsInput]::ControlKey(0x41)
    Start-Sleep -Milliseconds 300
    [VisibleDevToolsInput]::PressKey(0x08)
    Start-Sleep -Milliseconds 300
    $source = [IO.File]::ReadAllText($scriptFile)
    $wrapped = '(()=>{globalThis.__canvasResult=undefined;' + $source + "`n;return globalThis.__canvasResult===undefined?Array.from(globalThis.data):globalThis.__canvasResult;})()"
    $command = "globalThis.__canvasCapture={runId:'$runId',pending:true};Promise.resolve().then(()=>$wrapped).then(value=>{globalThis.__canvasCapture={runId:'$runId',value};copy(JSON.stringify(globalThis.__canvasCapture));},error=>{globalThis.__canvasCapture={runId:'$runId',error:String(error.stack||error)};copy(JSON.stringify(globalThis.__canvasCapture));})"
    $command = '((copyResult)=>{' + $command.Replace('copy(JSON.stringify','copyResult(JSON.stringify') + '})(copy)'
    [System.Windows.Forms.Clipboard]::SetText($command)
    [VisibleDevToolsInput]::ControlKey(0x56)
    Start-Sleep -Milliseconds 1200
    [System.Windows.Forms.Clipboard]::SetText('__CANVAS_PENDING__')
    [VisibleDevToolsInput]::PressEnter()
    $capture = $null
    for ($attempt=0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Milliseconds 1000
        $json = [System.Windows.Forms.Clipboard]::GetText()
        if ($json -eq '__CANVAS_PENDING__' -or -not $json.StartsWith('{')) { continue }
        $candidate = ConvertFrom-Json -InputObject $json
        if ($candidate.runId -eq $runId -and -not $candidate.pending) { $capture=$candidate; break }
    }
    if ($null -eq $capture) { throw 'F12 did not return this run; inspect Console focus. Previous results were not accepted.' }
    if ($capture.error) { throw $capture.error }
    $result = [ordered]@{ runId=$runId; capturedAt=[DateTime]::UtcNow.ToString('o'); browserMode='user-visible-f12'; chromeVersion=(Get-Item -LiteralPath $targetProcess.Path).VersionInfo.ProductVersion; processId=$target.ProcessId; title=$target.Title; script=$ScriptPath; scriptSHA256=(Get-FileHash -LiteralPath $scriptFile -Algorithm SHA256).Hash; value=$capture.value }
    $outputFile = Join-Path $outputDir ($OutputName + '-browser.json')
    [IO.File]::WriteAllText($outputFile,($result | ConvertTo-Json -Depth 30 -Compress))
    [ordered]@{runId=$runId;browserMode='user-visible-f12';chromeVersion=$result.chromeVersion;output=$outputFile} | ConvertTo-Json -Compress
} finally {
    [VisibleDevToolsInput]::SetWindowPos($target.Handle,[IntPtr](-2),0,0,0,0,0x0043) | Out-Null
    $bitmap = New-Object System.Drawing.Bitmap ($rect.Right-$rect.Left),($rect.Bottom-$rect.Top)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $dc=$graphics.GetHdc()
    [VisibleDevToolsCapture]::PrintWindow($target.Handle,$dc,2) | Out-Null
    $graphics.ReleaseHdc($dc)
    $graphics.Dispose()
    $bitmap.Save((Join-Path $outputDir ($OutputName + '-f12.png')))
    $bitmap.Dispose()
    if ($null -ne $oldClipboard) { [System.Windows.Forms.Clipboard]::SetDataObject($oldClipboard,$true) }
}
