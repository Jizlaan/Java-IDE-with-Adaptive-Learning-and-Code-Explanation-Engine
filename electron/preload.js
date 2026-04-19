// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onFileOpened: (callback) => ipcRenderer.on('file-opened', (_event, value) => callback(value)),
  onTriggerRun: (callback) => ipcRenderer.on('trigger-run', () => callback()),
  onRequestSave: (callback) => ipcRenderer.on('request-save', () => callback()),
  saveFile: (content) => ipcRenderer.invoke('save-file', content)
});
