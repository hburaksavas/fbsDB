#define WIN32_LEAN_AND_MEAN
#include <windows.h>

// A native apphost keeps the ZIP root tidy without adding a second .NET runtime.
// Do not load the WinUI app into this process: its resources and DLLs stay together.
static WCHAR application[32768];
static WCHAR directory[32768];
static WCHAR command[32768];

static void fail(DWORD error)
{
    WCHAR *message = NULL;
    FormatMessageW(FORMAT_MESSAGE_ALLOCATE_BUFFER | FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS,
        NULL, error, 0, (LPWSTR)&message, 0, NULL);
    MessageBoxW(NULL, message ? message : L"Could not start app\\FbsDb.exe. Extract the entire ZIP before starting fbsDB.",
        L"fbsDB could not start", MB_OK | MB_ICONERROR);
    if (message) LocalFree(message);
    ExitProcess(error ? error : ERROR_FILE_NOT_FOUND);
}

void WINAPI wWinMainCRTStartup(void)
{
    DWORD length = GetModuleFileNameW(NULL, application, ARRAYSIZE(application));
    if (!length) fail(GetLastError());
    if (length >= ARRAYSIZE(application) - 32) fail(ERROR_FILENAME_EXCED_RANGE);
    WCHAR *filename = application;
    for (WCHAR *at = application; *at; at++) if (*at == L'\\' || *at == L'/') filename = at + 1;
    lstrcpyW(filename, L"app");
    lstrcpyW(directory, application);
    lstrcatW(application, L"\\FbsDb.exe");

    // Preserve the caller's quoting and arguments exactly after the executable.
    const WCHAR *arguments = GetCommandLineW();
    if (*arguments == L'"') {
        arguments++;
        while (*arguments && *arguments != L'"') arguments++;
        if (*arguments) arguments++;
    } else while (*arguments && *arguments != L' ' && *arguments != L'\t') arguments++;
    if (lstrlenW(application) + lstrlenW(arguments) + 3 >= ARRAYSIZE(command)) fail(ERROR_BAD_LENGTH);
    lstrcpyW(command, L"\"");
    lstrcatW(command, application);
    lstrcatW(command, L"\"");
    lstrcatW(command, arguments);

    STARTUPINFOW startup;
    PROCESS_INFORMATION process;
    GetStartupInfoW(&startup);
    if (!CreateProcessW(application, command, NULL, NULL, FALSE, 0, NULL, directory, &startup, &process)) fail(GetLastError());
    CloseHandle(process.hThread);
    CloseHandle(process.hProcess);
    ExitProcess(0);
}
