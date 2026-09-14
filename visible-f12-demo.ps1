param(
    [switch]$Stages,
    [string]$ScriptPath
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$demoPath = if ($ScriptPath) {
    [IO.Path]::GetFullPath((Join-Path $projectRoot $ScriptPath))
} else {
    Join-Path $projectRoot "demo.js"
}
$dataPath = Join-Path $projectRoot "data.js"
$outputDir = Join-Path $projectRoot "out"
$browserOutputPath = Join-Path $outputDir "chrome153-visible-f12.json"
$resultOutputPath = Join-Path $outputDir "chrome153-visible-f12-result.json"
$screenshotPath = Join-Path $outputDir "chrome153-visible-f12.png"
$stageOutputPath = Join-Path $outputDir "chrome153-visible-f12-stages.json"
$stageResultPath = Join-Path $outputDir "chrome153-visible-f12-stages-result.json"

if (-not (Test-Path -LiteralPath $demoPath)) {
    throw "demo.js was not found at $demoPath"
}
if (-not (Test-Path -LiteralPath $dataPath)) {
    throw "data.js was not found at $dataPath"
}
if (-not (Test-Path -LiteralPath $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir | Out-Null
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public static class VisibleDevToolsInput
{
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct INPUT
    {
        public uint type;
        public InputUnion value;
    }

    [StructLayout(LayoutKind.Explicit)]
    private struct InputUnion
    {
        [FieldOffset(0)] public MOUSEINPUT mouse;
        [FieldOffset(0)] public KEYBDINPUT keyboard;
        [FieldOffset(0)] public HARDWAREINPUT hardware;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MOUSEINPUT
    {
        public int dx;
        public int dy;
        public uint mouseData;
        public uint flags;
        public uint time;
        public UIntPtr extraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct KEYBDINPUT
    {
        public ushort virtualKey;
        public ushort scanCode;
        public uint flags;
        public uint time;
        public UIntPtr extraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct HARDWAREINPUT
    {
        public uint message;
        public ushort parameterLow;
        public ushort parameterHigh;
    }

    private const uint INPUT_MOUSE = 0;
    private const uint INPUT_KEYBOARD = 1;
    private const uint KEYEVENTF_KEYUP = 0x0002;
    private const uint KEYEVENTF_UNICODE = 0x0004;
    private const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    private const uint MOUSEEVENTF_LEFTUP = 0x0004;
    private const ushort VK_RETURN = 0x0D;
    private const uint WM_CHAR = 0x0102;
    private const uint WM_KEYDOWN = 0x0100;
    private const uint WM_KEYUP = 0x0101;

    private delegate bool EnumWindowsProc(IntPtr window, IntPtr parameter);

    [DllImport("user32.dll")]
    public static extern bool SetProcessDPIAware();

    [DllImport("user32.dll")]
    public static extern uint GetDpiForWindow(IntPtr window);

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr window, out RECT rect);

    [DllImport("user32.dll")]
    public static extern bool ShowWindowAsync(IntPtr window, int command);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr window);

    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(
        IntPtr window,
        IntPtr insertAfter,
        int x,
        int y,
        int width,
        int height,
        uint flags);

    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int x, int y);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(uint count, INPUT[] inputs, int size);

    [DllImport("user32.dll")]
    private static extern bool EnumChildWindows(
        IntPtr parent,
        EnumWindowsProc callback,
        IntPtr parameter);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetClassName(
        IntPtr window,
        StringBuilder className,
        int maximumCount);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(IntPtr window);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern bool PostMessage(
        IntPtr window,
        uint message,
        UIntPtr wordParameter,
        IntPtr longParameter);

    public static void Click(int x, int y)
    {
        SetCursorPos(x, y);
        INPUT[] inputs = new INPUT[2];
        inputs[0].type = INPUT_MOUSE;
        inputs[0].value.mouse.flags = MOUSEEVENTF_LEFTDOWN;
        inputs[1].type = INPUT_MOUSE;
        inputs[1].value.mouse.flags = MOUSEEVENTF_LEFTUP;
        if (SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT))) != 2)
            throw new InvalidOperationException("Could not click the DevTools Console prompt.");
    }

    public static void TypeText(string text, int delayMilliseconds)
    {
        foreach (char character in text)
        {
            INPUT[] inputs = new INPUT[2];
            inputs[0].type = INPUT_KEYBOARD;
            inputs[0].value.keyboard.scanCode = character;
            inputs[0].value.keyboard.flags = KEYEVENTF_UNICODE;
            inputs[1].type = INPUT_KEYBOARD;
            inputs[1].value.keyboard.scanCode = character;
            inputs[1].value.keyboard.flags = KEYEVENTF_UNICODE | KEYEVENTF_KEYUP;
            if (SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT))) != 2)
                throw new InvalidOperationException("Could not type into the DevTools Console.");
            if (delayMilliseconds > 0)
                Thread.Sleep(delayMilliseconds);
        }
    }

    public static void PressEnter()
    {
        INPUT[] inputs = new INPUT[2];
        inputs[0].type = INPUT_KEYBOARD;
        inputs[0].value.keyboard.virtualKey = VK_RETURN;
        inputs[1].type = INPUT_KEYBOARD;
        inputs[1].value.keyboard.virtualKey = VK_RETURN;
        inputs[1].value.keyboard.flags = KEYEVENTF_KEYUP;
        if (SendInput(2, inputs, Marshal.SizeOf(typeof(INPUT))) != 2)
            throw new InvalidOperationException("Could not execute the DevTools Console command.");
    }

    public static IntPtr FindRenderWidget(IntPtr parent)
    {
        IntPtr best = IntPtr.Zero;
        long bestArea = 0;
        EnumChildWindows(parent, delegate(IntPtr window, IntPtr parameter)
        {
            StringBuilder className = new StringBuilder(256);
            GetClassName(window, className, className.Capacity);
            if (className.ToString() != "Chrome_RenderWidgetHostHWND" || !IsWindowVisible(window))
                return true;

            RECT rect;
            if (!GetWindowRect(window, out rect))
                return true;
            long area = (long)(rect.Right - rect.Left) * (rect.Bottom - rect.Top);
            if (area > bestArea)
            {
                best = window;
                bestArea = area;
            }
            return true;
        }, IntPtr.Zero);
        return best;
    }

    public static void TypeTextToWindow(IntPtr window, string text, int delayMilliseconds)
    {
        foreach (char character in text)
        {
            if (!PostMessage(window, WM_CHAR, (UIntPtr)character, IntPtr.Zero))
                throw new InvalidOperationException("Could not send text to the DevTools render widget.");
            if (delayMilliseconds > 0)
                Thread.Sleep(delayMilliseconds);
        }
    }

    public static void PressEnterOnWindow(IntPtr window)
    {
        if (!PostMessage(window, WM_KEYDOWN, (UIntPtr)VK_RETURN, IntPtr.Zero) ||
            !PostMessage(window, WM_KEYUP, (UIntPtr)VK_RETURN, IntPtr.Zero))
            throw new InvalidOperationException("Could not execute the DevTools Console command.");
    }
}

public static class VisibleDevToolsCapture
{
    [DllImport("user32.dll")]
    public static extern bool PrintWindow(IntPtr window, IntPtr deviceContext, uint flags);
}
'@

[VisibleDevToolsInput]::SetProcessDPIAware() | Out-Null

$targets = @(
    Get-Process chrome -ErrorAction SilentlyContinue |
        Where-Object {
            $_.MainWindowHandle -ne 0 -and
            $_.MainWindowTitle -like "DevTools -*" -and
            $_.Path -eq "C:\Program Files\Google\Chrome\Application\chrome.exe"
        } |
        Sort-Object StartTime -Descending
)

if ($targets.Count -eq 0) {
    throw "No visible Google Chrome DevTools window was found. Open F12 Console first."
}

$target = $targets[0]
$chromeVersion = (Get-Item -LiteralPath $target.Path).VersionInfo.ProductVersion
if (-not $chromeVersion.StartsWith("153.")) {
    throw "The visible DevTools window belongs to Chrome $chromeVersion, not Chrome 153."
}

$rect = New-Object VisibleDevToolsInput+RECT
if (-not [VisibleDevToolsInput]::GetWindowRect($target.MainWindowHandle, [ref]$rect)) {
    throw "Could not read the DevTools window rectangle."
}

$promptX = $rect.Left + 80
$promptY = $rect.Top + 170
$oldClipboard = [System.Windows.Forms.Clipboard]::GetDataObject()

try {
    $positionFlags = 0x0001 -bor 0x0002 -bor 0x0040
    [VisibleDevToolsInput]::SetWindowPos(
        $target.MainWindowHandle,
        [IntPtr](-1),
        0,
        0,
        0,
        0,
        $positionFlags
    ) | Out-Null
    [VisibleDevToolsInput]::ShowWindowAsync($target.MainWindowHandle, 9) | Out-Null
    [VisibleDevToolsInput]::SetForegroundWindow($target.MainWindowHandle) | Out-Null
    Start-Sleep -Milliseconds 800
    [VisibleDevToolsInput]::Click($promptX, $promptY)
    Start-Sleep -Milliseconds 300
    $renderWindow = [VisibleDevToolsInput]::FindRenderWidget($target.MainWindowHandle)
    if ($renderWindow -eq [IntPtr]::Zero) {
        throw "Could not locate Chrome_RenderWidgetHostHWND in the DevTools window."
    }

    $demoSource = [IO.File]::ReadAllText($demoPath)
    if ($Stages) {
        $instrumentedLines = New-Object System.Collections.Generic.List[string]
        $instrumentedLines.Add("globalThis.__canvasStages = []")
        $stageNumber = 0
        foreach ($line in ($demoSource -split "\r?\n")) {
            if ($line.Trim() -eq "console.log(data + '')") { continue }
            $instrumentedLines.Add($line)
            if ($line.Trim() -match "^gl\.(stroke|fill|fillText|strokeText)\(") {
                $stageNumber++
                $operation = $Matches[1]
                $stageName = "stage{0:D2}_{1}" -f $stageNumber, $operation
                $instrumentedLines.Add(
                    "globalThis.__canvasStages.push({name:'$stageName',data:Array.from(gl.getImageData(0,0,48,48).data)})"
                )
            }
        }
        $demoSource = $instrumentedLines -join [Environment]::NewLine
    }
    $flatSource = (($demoSource -split "\r?\n") -join ";")
    $demoCommand = "(()=>{$flatSource})()"

    [VisibleDevToolsInput]::SetForegroundWindow($target.MainWindowHandle) | Out-Null
    Start-Sleep -Milliseconds 300
    [VisibleDevToolsInput]::TypeTextToWindow($renderWindow, $demoCommand, 1)
    Start-Sleep -Milliseconds 1500
    [VisibleDevToolsInput]::PressEnterOnWindow($renderWindow)
    Start-Sleep -Milliseconds 3500

    $copyCommand = if ($Stages) {
        "copy(JSON.stringify(globalThis.__canvasStages))"
    } else {
        "copy(JSON.stringify(globalThis.data))"
    }
    [VisibleDevToolsInput]::SetForegroundWindow($target.MainWindowHandle) | Out-Null
    Start-Sleep -Milliseconds 300
    [VisibleDevToolsInput]::TypeTextToWindow($renderWindow, $copyCommand, 2)
    Start-Sleep -Milliseconds 800
    [System.Windows.Forms.Clipboard]::SetText("__CANVAS_CAPTURE_PENDING__")
    [VisibleDevToolsInput]::PressEnterOnWindow($renderWindow)
    Start-Sleep -Milliseconds 1500

    $browserJson = [System.Windows.Forms.Clipboard]::GetText()
    if ($browserJson -eq "__CANVAS_CAPTURE_PENDING__") {
        throw "DevTools did not copy globalThis.data. The Console prompt may not have had focus."
    }

    if ($Stages) {
        $browserStages = ConvertFrom-Json -InputObject $browserJson
        [IO.File]::WriteAllText($stageOutputPath, $browserJson)

        $encodedSource = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($demoSource))
        $oldStageSource = $env:CANVAS_STAGE_SOURCE
        try {
            $env:CANVAS_STAGE_SOURCE = $encodedSource
            $nodeScript = "const s=Buffer.from(process.env.CANVAS_STAGE_SOURCE,'base64').toString('utf8');eval('(()=>{'+s+'})()');process.stdout.write(JSON.stringify(globalThis.__canvasStages));"
            $localStageOutput = @(& node -e $nodeScript 2>&1)
            if ($LASTEXITCODE -ne 0) {
                throw "Local stage capture failed: $($localStageOutput -join [Environment]::NewLine)"
            }
        } finally {
            if ($null -eq $oldStageSource) { Remove-Item Env:CANVAS_STAGE_SOURCE -ErrorAction SilentlyContinue }
            else { $env:CANVAS_STAGE_SOURCE = $oldStageSource }
        }
        $localStages = ConvertFrom-Json -InputObject ([string]($localStageOutput -join ""))
        if ($browserStages.Count -ne $localStages.Count) {
            throw "Stage count differs: Chrome=$($browserStages.Count), local=$($localStages.Count)."
        }

        $stageResults = @()
        for ($stageIndex = 0; $stageIndex -lt $browserStages.Count; $stageIndex++) {
            $browserStagePixels = $browserStages[$stageIndex].data
            $localStagePixels = $localStages[$stageIndex].data
            $stageMismatches = 0
            $stageAbsoluteDifference = 0
            $stageAlphaDifference = 0
            $stageColorDifference = 0
            for ($pixelIndex = 0; $pixelIndex -lt $browserStagePixels.Count; $pixelIndex++) {
                $browserValue = [int]$browserStagePixels[$pixelIndex]
                $localValue = [int]$localStagePixels[$pixelIndex]
                if ($browserValue -eq $localValue) { continue }
                $stageMismatches++
                $difference = [Math]::Abs($browserValue - $localValue)
                $stageAbsoluteDifference += $difference
                if ($pixelIndex % 4 -eq 3) { $stageAlphaDifference += $difference }
                else { $stageColorDifference += $difference }
            }
            $stageResults += [ordered]@{
                name = $browserStages[$stageIndex].name
                mismatches = $stageMismatches
                absoluteDifference = $stageAbsoluteDifference
                alphaDifference = $stageAlphaDifference
                colorDifference = $stageColorDifference
                equal = $stageMismatches -eq 0
            }
        }
        $stageReport = [ordered]@{
            chromeVersion = $chromeVersion
            browserMode = "user-visible-f12-stages"
            stages = $stageResults
            browserStagesPath = $stageOutputPath
        }
        $stageReportJson = $stageReport | ConvertTo-Json -Depth 5 -Compress
        [IO.File]::WriteAllText($stageResultPath, $stageReportJson)
        Write-Output $stageReportJson
        return
    }

    $browserPixels = ConvertFrom-Json -InputObject $browserJson
    if ($browserPixels.Count -ne 48 * 48 * 4) {
        throw "Chrome returned $($browserPixels.Count) values; expected 9216."
    }
    [IO.File]::WriteAllText($browserOutputPath, $browserJson)

    $localOutput = @(& node $dataPath 2>&1)
    if ($LASTEXITCODE -ne 0) {
        throw "data.js failed: $($localOutput -join [Environment]::NewLine)"
    }
    $localLine = [string]($localOutput | Select-Object -Last 1)
    $localPixels = @($localLine.Split(",") | ForEach-Object { [int]$_ })

    $values = [Math]::Max($browserPixels.Count, $localPixels.Count)
    $mismatches = 0
    $absoluteDifference = 0
    $alphaDifference = 0
    $colorDifference = 0
    for ($index = 0; $index -lt $values; $index++) {
        $browserValue = if ($index -lt $browserPixels.Count) { [int]$browserPixels[$index] } else { $null }
        $localValue = if ($index -lt $localPixels.Count) { [int]$localPixels[$index] } else { $null }
        if ($browserValue -eq $localValue) { continue }

        $mismatches++
        $difference = if ($null -eq $browserValue -or $null -eq $localValue) {
            255
        } else {
            [Math]::Abs($browserValue - $localValue)
        }
        $absoluteDifference += $difference
        if ($index % 4 -eq 3) { $alphaDifference += $difference }
        else { $colorDifference += $difference }
    }

    $width = $rect.Right - $rect.Left
    $height = $rect.Bottom - $rect.Top
    $bitmap = New-Object System.Drawing.Bitmap $width, $height
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $deviceContext = $graphics.GetHdc()
    [VisibleDevToolsCapture]::PrintWindow($target.MainWindowHandle, $deviceContext, 2) | Out-Null
    $graphics.ReleaseHdc($deviceContext)
    $graphics.Dispose()
    $bitmap.Save($screenshotPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bitmap.Dispose()

    $result = [ordered]@{
        chromeVersion = $chromeVersion
        browserMode = "user-visible-f12"
        executable = $target.Path
        devToolsProcessId = $target.Id
        devToolsTitle = $target.MainWindowTitle
        values = $values
        mismatches = $mismatches
        absoluteDifference = $absoluteDifference
        alphaDifference = $alphaDifference
        colorDifference = $colorDifference
        equal = $browserPixels.Count -eq $localPixels.Count -and $mismatches -eq 0
        browserDataPath = $browserOutputPath
        screenshotPath = $screenshotPath
    }
    $resultJson = $result | ConvertTo-Json -Compress
    [IO.File]::WriteAllText($resultOutputPath, $resultJson)
    Write-Output $resultJson
} finally {
    if ($null -ne $target -and $target.MainWindowHandle -ne 0) {
        $positionFlags = 0x0001 -bor 0x0002 -bor 0x0040
        [VisibleDevToolsInput]::SetWindowPos(
            $target.MainWindowHandle,
            [IntPtr](-2),
            0,
            0,
            0,
            0,
            $positionFlags
        ) | Out-Null
    }
    if ($null -ne $oldClipboard) {
        [System.Windows.Forms.Clipboard]::SetDataObject($oldClipboard, $true)
    }
}
