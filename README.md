# Flowo

Flowo is a calm, local-first focus and task-tracking desktop application for developers. It is built with React, TypeScript, and Tauri 2.

## Install Flowo (end users)

Flowo is distributed as a Windows desktop installer. **You do not need to install Rust, Node.js, npm, or any other development tools.**

1. Download the latest installer from the [GitHub Releases page](https://github.com/JagNanda/task-tracker/releases), or use the installer provided to you by the application's distributor.
2. Choose one of the available Windows packages:
   - `Flowo_<version>_x64-setup.exe` — recommended for most people.
   - `Flowo_<version>_x64_en-US.msi` — useful for managed or administrative deployments.
3. Open the downloaded installer and follow the on-screen instructions.
4. Launch **Flowo** from the Start menu or desktop shortcut.

Flowo uses the Microsoft Edge WebView2 Runtime, which is already present on most current Windows systems. If Windows reports that it is missing, install WebView2 when prompted and then open Flowo again.

Only install packages obtained from this repository or another source you trust. Development tools are required only when building the application from source, as described below.

## Build from source (developers)

### Prerequisites

To develop or build Flowo, make sure you have:

- [Node.js](https://nodejs.org/) and npm
- [Rust](https://www.rust-lang.org/tools/install)
- The platform-specific dependencies listed in the [Tauri prerequisites guide](https://v2.tauri.app/start/prerequisites/)

On Windows, this generally includes Microsoft C++ Build Tools and WebView2.

### Install dependencies

Clone the repository and install the JavaScript dependencies:

```bash
git clone https://github.com/JagNanda/task-tracker.git
cd task-tracker
npm ci
```

Rust dependencies are downloaded automatically the first time the Tauri application is run or built.

### Run the desktop application

Start Flowo in desktop development mode:

```bash
npm run tauri dev
```

This starts the Vite development server and opens the native Tauri window. Source changes are reflected during development.

### Run the web interface only

To work on the React interface in a browser:

```bash
npm run dev
```

Then open [http://localhost:1420](http://localhost:1420). Features that depend on Tauri's native APIs may not work in browser-only mode.

### Build

Create a production desktop build:

```bash
npm run tauri build
```

Build artifacts and installers are written beneath `src-tauri/target/release/bundle/`. The current Tauri configuration produces MSI and NSIS installers on Windows.

To build only the web interface:

```bash
npm run build
```

The web output is written to `dist/` and can be previewed with `npm run preview`.

## Disclaimer

This project was entirely vibe coded. Review and test the code carefully before relying on it for important workflows or data. It is provided as-is, without any guarantee that it is bug-free, secure, or suitable for a particular purpose.
