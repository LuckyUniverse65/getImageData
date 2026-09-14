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

    public sealed class DesktopWindow
    {
        public IntPtr Handle;
        public uint ProcessId;
        public string Title;
        public string ClassName;
    }

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(IntPtr window, StringBuilder text, int count);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);

    public static DesktopWindow[] VisibleWindows()
    {
        var windows = new List<DesktopWindow>();
        EnumWindows(delegate(IntPtr window, IntPtr parameter)
        {
            if (!IsWindowVisible(window)) return true;
            var title = new StringBuilder(1024);
            var className = new StringBuilder(256);
            GetWindowText(window, title, title.Capacity);
            GetClassName(window, className, className.Capacity);
            uint processId;
            GetWindowThreadProcessId(window, out processId);
            windows.Add(new DesktopWindow { Handle = window, ProcessId = processId,
                Title = title.ToString(), ClassName = className.ToString() });
            return true;
        }, IntPtr.Zero);
        return windows.ToArray();
    }

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

    public static void ControlKey(ushort key)
    {
        INPUT[] inputs = new INPUT[4];
        for (int i=0;i<4;i++) inputs[i].type=INPUT_KEYBOARD;
        inputs[0].value.keyboard.virtualKey=0x11;
        inputs[1].value.keyboard.virtualKey=key;
        inputs[2].value.keyboard.virtualKey=key;
        inputs[2].value.keyboard.flags=KEYEVENTF_KEYUP;
        inputs[3].value.keyboard.virtualKey=0x11;
        inputs[3].value.keyboard.flags=KEYEVENTF_KEYUP;
        if (SendInput(4,inputs,Marshal.SizeOf(typeof(INPUT)))!=4) throw new InvalidOperationException("Could not send Console shortcut.");
    }

    public static void PressKey(ushort key)
    {
        INPUT[] inputs=new INPUT[2];
        inputs[0].type=inputs[1].type=INPUT_KEYBOARD;
        inputs[0].value.keyboard.virtualKey=inputs[1].value.keyboard.virtualKey=key;
        inputs[1].value.keyboard.flags=KEYEVENTF_KEYUP;
        SendInput(2,inputs,Marshal.SizeOf(typeof(INPUT)));
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
