# Qualcomm GenieX Model Manager

Desktop app for browsing, downloading, loading, and chatting with [GenieX](https://aihub.qualcomm.com/geniex) models on Qualcomm Snapdragon Windows PCs. Optional [OpenCode](https://github.com/anomalyco/opencode) coding UI is embedded for local agent workflows.

> **Rebrand ahead:** this product is becoming **Neuron**. The GenieX CLI / local NPU runtime stays Qualcomm GenieX under the hood.

## Demo

[![Watch the demo](https://img.youtube.com/vi/H0uQf1l3JHk/maxresdefault.jpg)](https://youtu.be/H0uQf1l3JHk)

## Download (Windows ARM64)


[![Download Windows ARM64](https://img.shields.io/github/v/release/NeuronVS/GenieX-UI?label=Download%20Windows%20ARM64&style=for-the-badge)](https://github.com/NeuronVS/GenieX-UI/releases/latest/download/GenieX-Model-Manager-Setup-arm64.exe)

Or open the [latest release](https://github.com/NeuronVS/GenieX-UI/releases/latest) page.

**Simple install:** download the `.exe` → Next → Install → launch **GenieX Model Manager**. On first run, use the in-app button to install the GenieX CLI if prompted.


## Features (today)

- Marketplace (Qualcomm AI Hub + Hugging Face)
- My Models — load / unload
- Chat against the local OpenAI-compatible GenieX server
- Code — embed OpenCode pointed at GenieX
- NPU + Memory usage in the sidebar

## Upcoming

### Neuron shell

- Product rename to **Neuron** (UI, installer name, window title)
- Default left menu focuses on installed apps — **Chat** only out of the box
- **Marketplace** becomes an **Apps** catalog (above Settings), not the model browser

### My Models

Model browsing moves under **My Models** with tabs:

- Local Models
- Qualcomm
- Optimized
- Hugging Face
- Import Model

### Apps Marketplace

- Pull an app list from a GitHub catalog (`apps.json`, e.g. NeuronVS/neuron-apps)
- Install / uninstall mini-apps from the catalog
- Installed apps appear on the left menu
- An app can declare required models — if missing, Neuron downloads them before the app is ready

### Planned mini-apps (structure first; full UIs later)

| App | Intent |
|-----|--------|
| **Chat** | Built-in default — talk to a loaded local model |
| **Code** | OpenCode as an installable app (not always in the nav) |
| **Photo Editor** | Local LLM image edit / upscale / colorize (Photoshop Express–style) |
| **Photos** | Characterize images, folders, people tags; open in Photo Editor when installed |
| **File Organizer** | Read docs/PDFs with a local LLM; organize and index |
| **Small Business** | State-aware setup flow (questions + flowchart); later taxes / transactions |
| **Website Builder** | Build/edit a small site in-app (Replit-like); later one-click publish + hosting |

### Later

- Richer **Optimized** model catalog
- Website Builder publish / hosting options via our server
- Small Business expansions (taxes, transactions)
