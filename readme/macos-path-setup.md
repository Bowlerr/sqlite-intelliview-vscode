# macOS Setup: Add `sqlite3` and `sqlcipher` to `PATH`

This guide installs `sqlite3` and `sqlcipher` on macOS and ensures your shell `PATH` can find them.

## 1. Install Homebrew (if needed)

Homebrew is the simplest way to install both tools.

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

## 2. Ensure Homebrew is on your `PATH`

Add one of these to `~/.zprofile` (zsh default on macOS):

- Apple Silicon (`/opt/homebrew`):

```bash
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
```

- Intel (`/usr/local`):

```bash
echo 'eval "$(/usr/local/bin/brew shellenv)"' >> ~/.zprofile
```

Apply it now:

```bash
source ~/.zprofile
```

## 3. Install `sqlite3` and `sqlcipher`

```bash
brew install sqlite
brew install sqlcipher
```

## 4. Verify both commands

```bash
which sqlite3
which sqlcipher
sqlite3 --version
sqlcipher -version
```

Expected install locations are usually:
- Apple Silicon: `/opt/homebrew/bin`
- Intel: `/usr/local/bin`

## 5. VS Code

Restart VS Code after installation so extensions use the updated environment.

## Troubleshooting

- `sqlcipher` not found:
  - Run `brew info sqlcipher` and confirm install succeeded.
  - Re-run `source ~/.zprofile`.
- Homebrew command not found:
  - PATH is not loaded yet; re-open terminal and run `source ~/.zprofile`.
- VS Code still does not detect tools:
  - Fully quit and reopen VS Code.
