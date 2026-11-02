using System.Runtime.InteropServices;

namespace FbsDb.Services;

// Windows taskbar button progress. Only states without a percentage are exposed: a running query has no reliable progress value.
public static class TaskbarProgress
{
    public enum State { None = 0, Indeterminate = 1, Error = 4 }

    [ComImport, Guid("56FDF344-FD6D-11d0-958A-006097C9A090"), ClassInterface(ClassInterfaceType.None)]
    private class TaskbarListClass { }

    [ComImport, Guid("ea1afb91-9e28-4b86-90e9-9e9f8a5eefaf"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface ITaskbarList3
    {
        // ITaskbarList
        [PreserveSig] int HrInit();
        [PreserveSig] int AddTab(IntPtr hwnd);
        [PreserveSig] int DeleteTab(IntPtr hwnd);
        [PreserveSig] int ActivateTab(IntPtr hwnd);
        [PreserveSig] int SetActiveAlt(IntPtr hwnd);
        // ITaskbarList2
        [PreserveSig] int MarkFullscreenWindow(IntPtr hwnd, [MarshalAs(UnmanagedType.Bool)] bool fullscreen);
        // ITaskbarList3
        [PreserveSig] int SetProgressValue(IntPtr hwnd, ulong completed, ulong total);
        [PreserveSig] int SetProgressState(IntPtr hwnd, int flags);
    }

    private static ITaskbarList3? _list;

    public static bool TrySet(IntPtr window, State state)
    {
        if (window == IntPtr.Zero) return false;
        try
        {
            _list ??= (ITaskbarList3)new TaskbarListClass();
            _list.HrInit();
            return _list.SetProgressState(window, (int)state) >= 0;
        }
        catch (Exception error) when (error is COMException or InvalidCastException or PlatformNotSupportedException) { _list = null; return false; }
    }
}
