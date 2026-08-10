# GenieX Model Manager

Desktop app for browsing, downloading, loading, and chatting with [GenieX](https://aihub.qualcomm.com/geniex) models on Qualcomm Snapdragon Windows PCs. Optional [OpenCode](https://github.com/anomalyco/opencode) coding UI is embedded for local agent workflows.

## Demo

[![Watch the demo](https://img.youtube.com/vi/H0uQf1l3JHk/maxresdefault.jpg)](https://youtu.be/H0uQf1l3JHk)

## Download (Windows ARM64)

> After you create the GitHub repo, replace `NeuronVS/GenieX-UI` below with your real path  
> (example: `NeuronVS/GenieX-UI`). The link always points at the **latest release** —  
> you do **not** need to edit the README when you ship a new version.

[![Download Windows ARM64](https://img.shields.io/github/v/release/NeuronVS/GenieX-UI?label=Download%20Windows%20ARM64&style=for-the-badge)](https://github.com/NeuronVS/GenieX-UI/releases/latest/download/GenieX-Model-Manager-Setup-arm64.exe)

Or open the [latest release](https://github.com/NeuronVS/GenieX-UI/releases/latest) page.

**Simple install:** download the `.exe` → Next → Install → launch **GenieX Model Manager**. On first run, use the in-app button to install the GenieX CLI if prompted.

## Ship a new installer (automated)

1. Push this project to GitHub
2. Replace `NeuronVS/GenieX-UI` in this README with your repo
3. Bump `"version"` in `package.json` if needed
4. Tag and push:

```bash
git tag v0.1.0
git push origin v0.1.0
```

GitHub Actions (`Release Windows ARM64`) builds on `windows-11-arm` and attaches  
`GenieX-Model-Manager-Setup-arm64.exe` to that release. The download badge/button updates itself via `/releases/latest`.

You can also run the workflow manually from the **Actions** tab (builds an artifact; tagging creates the public release).

## Dev

```powershell
npm.cmd install
npm.cmd run dev
```

See [commands.md](./commands.md) for packaging, OpenCode, and end-user notes.

## Features

- Marketplace (Qualcomm AI Hub + Hugging Face)
- My Models — load / unload
- Chat against the local OpenAI-compatible GenieX server
- Code — embed OpenCode pointed at GenieX
- NPU + Memory usage in the sidebar
