const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, clipboard, nativeImage, systemPreferences } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const isDev = !app.isPackaged;

let mainWindow;
let tray;
let isQuitting = false;
let keyListenerProcess = null;
let lastCmdCTime = 0;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 900,
        height: 600,
        show: false,
        frame: false,
        titleBarStyle: 'hiddenInset',
        skipTaskbar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    const startUrl = isDev
        ? 'http://localhost:5173'
        : `file://${path.join(__dirname, '../dist/index.html')}`;

    mainWindow.loadURL(startUrl);

    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
        return false;
    });

    // Hide window when clicking outside (blur)
    mainWindow.on('blur', () => {
        if (!isQuitting) {
            mainWindow.hide();
        }
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        require('electron').shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });
}

function createTray() {
    const iconPath = path.join(__dirname, '../public/tray-icon.png');
    const icon = nativeImage.createFromPath(iconPath);

    tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);

    const contextMenu = Menu.buildFromTemplate([
        { label: 'Show DeepLocal', click: () => toggleWindow() },
        { type: 'separator' },
        {
            label: 'Quit', click: () => {
                isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setToolTip('DeepLocal - Offline Translator');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => toggleWindow());
}

function toggleWindow() {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) {
        mainWindow.hide();
    } else {
        mainWindow.show();
        mainWindow.focus();
    }
}

// ─── Native Key Listener Setup (Pre-compiled) ───
function setupNativeKeyListener() {
    /* 
       We look for the 'key_listener' binary.
       PROD: process.resourcesPath/key_listener (packaged via extraResources)
       DEV:  ../extraResources/key_listener (relative to electron/main.js)
    */

    let binaryPath;
    if (isDev) {
        binaryPath = path.join(__dirname, '../extraResources/key_listener');
    } else {
        // In production, extraResources puts it in Contents/Resources
        // process.resourcesPath points to Contents/Resources
        binaryPath = path.join(process.resourcesPath, 'key_listener');
    }

    // Attempt to be flexible if initial path is wrong (Electron builder behavior varies)
    if (!fs.existsSync(binaryPath) && !isDev) {
        // Also check if it's directly in app directory (rare but possible)
        const altPath = path.join(path.dirname(app.getPath('exe')), 'resources', 'key_listener');
        if (fs.existsSync(altPath)) binaryPath = altPath;
    }

    if (!fs.existsSync(binaryPath)) {
        console.error('[KeyListener] Binary NOT FOUND at:', binaryPath);
        if (!isQuitting) {
            const { dialog } = require('electron');
            dialog.showErrorBox('Missing Component', `Could not find key listener binary at:\n${binaryPath}\n\nPlease reinstall the app.`);
        }
        return;
    }

    const startProcess = () => {
        if (keyListenerProcess) return;

        console.log('[KeyListener] Spawning:', binaryPath);
        try {
            keyListenerProcess = spawn(binaryPath);

            keyListenerProcess.stdout.on('data', (data) => {
                const output = data.toString().trim();
                const lines = output.split('\n');
                lines.forEach(line => {
                    if (line === 'CMD_C') {
                        const now = Date.now();
                        const delta = now - lastCmdCTime;
                        console.log(`[KeyListener] Cmd+C detected. Delta: ${delta}ms`);

                        // 600ms double-press window
                        if (lastCmdCTime > 0 && delta < 600) {
                            console.log('[KeyListener] Double detected! Triggering translation...');
                            lastCmdCTime = 0; // Reset

                            // Wait briefly for clipboard to stabilize
                            setTimeout(() => {
                                const text = clipboard.readText();
                                if (text && text.trim() && mainWindow) {
                                    mainWindow.show();
                                    mainWindow.focus();
                                    mainWindow.webContents.send('trigger-translate', text);
                                }
                            }, 100);
                        } else {
                            lastCmdCTime = now;
                        }
                    } else if (line === 'started') {
                        console.log('[KeyListener] Native monitor started.');
                    }
                });
            });

            keyListenerProcess.stderr.on('data', (data) => {
                console.error('[KeyListener] Stderr:', data.toString());
            });

            keyListenerProcess.on('exit', (code) => {
                console.log(`[KeyListener] Exited with code ${code}. Restarting...`);
                keyListenerProcess = null;
                // Restart unless quitting
                if (!isQuitting) {
                    setTimeout(startProcess, 2000);
                }
            });

            keyListenerProcess.unref();
        } catch (e) {
            console.error('[KeyListener] Spawn error:', e);
        }
    };

    startProcess();
}

app.whenReady().then(() => {
    if (app.dock) app.dock.hide();

    // Launch at login (menu bar only, no visible window on boot)
    app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true });

    createWindow();
    createTray();

    // Check for updates
    checkForUpdates();

    // Check Accessibility Permissions
    const trusted = systemPreferences.isTrustedAccessibilityClient(true);
    console.log('[Accessibility] Trusted:', trusted);

    if (!trusted) {
        const { dialog } = require('electron');
        dialog.showMessageBox({
            type: 'warning',
            title: 'Accessibility Permission Needed',
            message: 'DeepLocal needs Accessibility access to detect hotkeys.',
            detail: 'Please enable DeepLocal in System Settings > Privacy & Security > Accessibility.',
            buttons: ['Open Settings', 'OK']
        }).then(({ response }) => {
            if (response === 0) {
                require('electron').shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
            }
        });
    }

    setupNativeKeyListener();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('before-quit', () => {
    isQuitting = true;
});

app.on('will-quit', () => {
    if (keyListenerProcess) {
        keyListenerProcess.kill();
        keyListenerProcess = null;
    }
});

// --- Update Checker ---
const UPDATE_CHECK_URL = 'https://api.github.com/repos/YOUR_USERNAME/DeepLocal-Mac/releases/latest'; // TODO: Replace with your actual repo

function checkForUpdates() {
    const { net, dialog, shell, app } = require('electron');
    const request = net.request(UPDATE_CHECK_URL);

    request.on('response', (response) => {
        let data = '';
        response.on('data', (chunk) => {
            data += chunk;
        });
        response.on('end', () => {
            console.log('[Update] Status:', response.statusCode);
            if (response.statusCode === 200) {
                try {
                    const release = JSON.parse(data);
                    const latestVersion = release.tag_name.replace('v', '');
                    const currentVersion = app.getVersion();

                    console.log(`[Update] Current: ${currentVersion}, Latest: ${latestVersion}`);

                    if (latestVersion !== currentVersion && latestVersion > currentVersion) {
                        dialog.showMessageBox({
                            type: 'info',
                            title: 'Update Available',
                            message: `A new version (${latestVersion}) is available.`,
                            detail: 'Would you like to download it now?',
                            buttons: ['Download', 'Later'],
                            defaultId: 0,
                            cancelId: 1
                        }).then(({ response }) => {
                            if (response === 0) {
                                shell.openExternal(release.html_url);
                            }
                        });
                    }
                } catch (e) {
                    console.error('[Update] Error parsing response:', e);
                }
            }
        });
    });
    request.on('error', (error) => {
        console.error('[Update] Request error:', error);
    });
    request.end();
}

// IPC Handling
ipcMain.handle('app:minimize', () => mainWindow.minimize());
ipcMain.handle('app:hide', () => mainWindow.hide());

// Ollama Integration
const OLLAMA_HOST = 'http://127.0.0.1:11434';

ipcMain.handle('app:get-models', async () => {
    try {
        const response = await fetch(`${OLLAMA_HOST}/api/tags`);
        if (!response.ok) throw new Error('Failed to fetch models');
        return await response.json();
    } catch (error) {
        console.error('Ollama Error:', error);
        return { models: [], error: error.message };
    }
});

ipcMain.handle('app:translate', async (event, { model, prompt }) => {
    try {
        const response = await fetch(`${OLLAMA_HOST}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                prompt,
                stream: false
            }),
        });
        if (!response.ok) throw new Error('Translation failed');
        return await response.json();
    } catch (error) {
        console.error('Translation Error:', error);
        throw error;
    }
});
