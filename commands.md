# GenieX Model Manager — commands & install

## For simple users (recommended)

You do **not** need Node, npm, or a terminal.

### 1. Install the app

1. Get the installer file:  
   `GenieX Model Manager-Setup-0.1.0-arm64.exe`  
   (from whoever builds/releases this project — see **Build the Windows installer** below)
2. Double-click the installer
3. Click through Next → choose a folder (optional) → Install
4. Launch **GenieX Model Manager** from the Start Menu or desktop shortcut

This is a normal Windows app installer (NSIS), built with Electron.

### 2. First launch

1. The app checks for the **GenieX CLI**
2. If it’s missing, use the on-screen **Install** button (downloads Qualcomm’s GenieX installer)
3. When that finishes, the main window opens

### 3. Everyday use

1. **Marketplace** — download a model (Qualcomm AI Hub or HuggingFace)
2. **My Models** — click **Load** on a model
3. **Chat** — talk to the loaded model  
   Or use [AnythingLLM](https://anythingllm.com) with:  
   - Base URL: `http://127.0.0.1:18181/v1`  
   - Model: the loaded model name  
   - No API key
4. **Code** (optional) — Settings → install OpenCode, pick a project folder, then **Start**

### Requirements

- Windows on **Snapdragon** (ARM64), e.g. X Elite / X2 Elite
- Internet for first GenieX install and model downloads
- Enough disk space for models

---

## Build the Windows installer (developers)

### Automated (GitHub Actions)

Push a version tag — CI builds ARM64 on `windows-11-arm` and publishes a Release:

```bash
git tag v0.1.0
git push origin v0.1.0
```

Users download:

`https://github.com/<owner>/<repo>/releases/latest/download/GenieX-Model-Manager-Setup-arm64.exe`

(That URL never changes; no README edits per release. Swap `OWNER/REPO` in `README.md` once.)

### Local

```powershell
npm.cmd install
npm.cmd run package
```

Output:

```
release\GenieX-Model-Manager-Setup-arm64.exe
```

### Dev (not for end users)

```powershell
npm.cmd run dev
```

PowerShell may block `npm.ps1` — use `npm.cmd`.

---

## Optional: OpenCode (Code screen)

Not required for Marketplace / My Models / Chat.

In the app: **Settings → OpenCode CLI → Install OpenCode**

Or manually:

```powershell
npm.cmd install -g --allow-scripts=opencode-ai opencode-ai
```

Then: load a model → set a project folder → **Code → Start** (or **Pop out**).

---

## Live server notes

- Packaged app: ship the NSIS `.exe` from `release/`
- GenieX CLI is installed on first run inside the app
- OpenCode is optional and installed from Settings
- Some Qualcomm AI Hub catalog models may fail to pull due to licensing; HuggingFace GGUF or **Import Local** still work
