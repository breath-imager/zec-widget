const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // Price fetching
  fetchPrice: () => ipcRenderer.invoke('fetch-price'),
  onPriceUpdate: (callback) => {
    ipcRenderer.on('price-update', (event, data) => callback(data))
  },
  removePriceListener: () => {
    ipcRenderer.removeAllListeners('price-update')
  },
  // Window controls
  setAlwaysOnTop: (flag) => ipcRenderer.invoke('set-always-on-top', flag),
  getAlwaysOnTop: () => ipcRenderer.invoke('get-always-on-top'),
  resizeWindow: (width, height) => ipcRenderer.invoke('resize-window', width, height)
})