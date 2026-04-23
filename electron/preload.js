const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron:    true,
  // Setup flow (setup.html)
  pickDbFolder:  ()       => ipcRenderer.invoke('pick-db-folder'),
  pickDbFile:    ()       => ipcRenderer.invoke('pick-db-file'),
  completeSetup: (data)   => ipcRenderer.invoke('complete-setup', data),
  // Settings (SettingsView)
  getConfig:     ()       => ipcRenderer.invoke('get-config'),
  changeKey:     (newKey) => ipcRenderer.invoke('change-key', { newKey }),
  resetConfig:   ()       => ipcRenderer.invoke('reset-config'),
})
