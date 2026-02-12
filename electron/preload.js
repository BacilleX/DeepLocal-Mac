const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    minimize: () => ipcRenderer.invoke('app:minimize'),
    hide: () => ipcRenderer.invoke('app:hide'),
    onTriggerTranslate: (callback) => ipcRenderer.on('trigger-translate', (_event, value) => callback(value)),
    getModels: () => ipcRenderer.invoke('app:get-models'),
    translate: (payload) => ipcRenderer.invoke('app:translate', payload),
    onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (_event, value) => callback(value)),
    getVersion: () => ipcRenderer.invoke('app:get-version'),
});
