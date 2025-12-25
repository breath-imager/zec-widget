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
  onChartDataUpdate: (callback) => {
    ipcRenderer.on('chart-data-update', (event, data) => callback(data))
  },
  removeChartDataListener: () => {
    ipcRenderer.removeAllListeners('chart-data-update')
  },
  // Window controls
  setAlwaysOnTop: (flag) => ipcRenderer.invoke('set-always-on-top', flag),
  getAlwaysOnTop: () => ipcRenderer.invoke('get-always-on-top'),
  resizeWindow: (width, height) => ipcRenderer.invoke('resize-window', width, height),
  // Chart data fetching
  fetchChartData: (period) => ipcRenderer.invoke('fetch-chart-data', period)
})