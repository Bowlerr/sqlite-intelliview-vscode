# Windows Setup: Add `sqlite3` and `sqlcipher` to `PATH`

This guide installs `sqlite3` and `sqlcipher` on Windows, then adds them to your `PATH` so tools like SQLite IntelliView can find them.

## 1. Install `sqlite3`

Use one of these options:

### Option A (recommended): `winget`

```powershell
winget install --id SQLite.SQLite -e
```

### Option B: Chocolatey

```powershell
choco install sqlite
```

### Option C: Manual download

1. Go to https://www.sqlite.org/download.html
2. Download the Windows tools ZIP (`sqlite-tools-win-x64-*.zip`).
3. Extract to a stable folder, for example: `C:\sqlite`

If you use Option C, you must add `C:\sqlite` to `PATH` (steps below).

## 2. Install `sqlcipher`

On Windows, the most common route is MSYS2:

1. Install MSYS2 from https://www.msys2.org/
2. Open the **MSYS2 MINGW64** terminal.
3. Run:

```bash
pacman -Syu
pacman -S --needed mingw-w64-x86_64-sqlcipher
```

This typically installs `sqlcipher.exe` under:
- `C:\msys64\mingw64\bin`

## 3. Add folders to Windows `PATH`

1. Press `Win`, search for `environment variables`, open **Edit the system environment variables**.
2. Click **Environment Variables...**.
3. Under **User variables** (recommended) or **System variables**, select `Path` and click **Edit...**.
4. Click **New** and add each folder that contains the executables:
   - `C:\sqlite` (if you used manual SQLite install)
   - `C:\msys64\mingw64\bin` (MSYS2 SQLCipher install)
5. Click **OK** on all dialogs to save.

## 4. Verify from a new terminal

Close and reopen PowerShell or Command Prompt, then run:

```powershell
where sqlite3
where sqlcipher
sqlite3 --version
sqlcipher -version
```

If these return valid paths/versions, setup is complete.

## 5. VS Code

Restart VS Code after changing `PATH` so extensions pick up the new environment.

## Troubleshooting

- `where sqlcipher` returns nothing:
  - Confirm the install folder actually contains `sqlcipher.exe`.
  - Recheck the exact PATH entry in Environment Variables.
- Command works in one terminal but not another:
  - Fully close and reopen the terminal (or sign out/in on Windows).
- Still failing in VS Code:
  - Fully quit and reopen VS Code.
