# Neuron — commands & install

## For simple users (recommended)

You do **not** need Node, npm, or a terminal.

### 1. Install the app

1. Get the installer:  
   `Neuron-Setup-arm64.exe`  
   (from the GitHub Release — see **Build the Windows installer** below)
2. Double-click the installer
3. Click through Next → choose a folder (optional) → Install
4. Launch **Neuron** from the Start Menu or desktop shortcut

This is a normal Windows app installer (NSIS), built with Electron.

### 2. First launch

1. The app checks for the **GenieX CLI** (Qualcomm’s local NPU runtime)
2. If it’s missing, use the on-screen **Install** button
3. When that finishes, the main window opens with **Chat** ready

### 3. Everyday use

1. **My Models** — download from Qualcomm / Hugging Face, or Import; then **Load** a model
2. **Chat** — talk to the loaded model  
   Or use [AnythingLLM](https://anythingllm.com) with:  
   - Base URL: `http://127.0.0.1:18181/v1`  
   - Model: the loaded model name  
   - No API key
3. **Marketplace** — install more Neuron apps (Code, Photos, and more as they ship)
4. **Code** (optional) — install from Marketplace, then Settings → OpenCode CLI → Start

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

`https://github.com/<owner>/<repo>/releases/latest/download/Neuron-Setup-arm64.exe`

### Local

```powershell
npm.cmd install
npm.cmd run package
```

Output:

```
release\Neuron-Setup-arm64.exe
```

### Dev (not for end users)

```powershell
npm.cmd run dev
```

PowerShell may block `npm.ps1` — use `npm.cmd`.

---

## Optional: OpenCode (Code app)

Not required for My Models / Chat.

1. Marketplace → install **Code**
2. Settings → OpenCode CLI → **Install OpenCode**
3. Load a model → set a project folder → open Code → **Start**

Or manually:

```powershell
npm.cmd install -g --allow-scripts=opencode-ai opencode-ai
```

---

## Apps catalog

- Bundled fallback: `catalog/apps.json`
- Remote (when available): `https://raw.githubusercontent.com/NeuronVS/neuron-apps/main/apps.json`

---

## Live server notes

- Packaged app: ship the NSIS `.exe` from `release/`
- GenieX CLI is installed on first run inside the app
- OpenCode is optional and installed from Settings
- Some Qualcomm AI Hub catalog models may fail to pull due to licensing; HuggingFace GGUF or **Import Model** still work
