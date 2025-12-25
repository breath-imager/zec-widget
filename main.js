// Electron API must be loaded first - Electron's runtime provides this
// Yarn PnP setup should happen after Electron modules are loaded
const { app, BrowserWindow, ipcMain } = require('electron')

// Enable Yarn PnP for other dependencies (cheerio, etc.)
// In production builds, PnP might not be available, so handle gracefully
try {
  const pnpPath = require('path').join(__dirname, '.pnp.cjs')
  if (require('fs').existsSync(pnpPath)) {
    require(pnpPath).setup()
  }
} catch (e) {
  // PnP not available, continue without it (normal in packaged apps)
  if (!app.isPackaged) {
    console.warn('Yarn PnP not available:', e.message)
  }
}
const path = require('node:path')
const https = require('node:https')

let mainWindow = null

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 500,
    frame: false,
    transparent: false,
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })
  
  // Load index.html - handle both development and production paths
  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, 'index.html'))
  } else {
    mainWindow.loadFile('index.html')
  }
}

let lastChartFetch = 0
const CHART_FETCH_INTERVAL = 30000 // Fetch chart data every 30 seconds
const PRICE_FETCH_INTERVAL = 1000 // Fetch price every 1 second (60 req/min, well within 1200/min limit)
let lastPriceHistory = []
let lastPriceData = null
let consecutiveRateLimitErrors = 0
let isRateLimited = false

// Fetch ZEC price and market data from Binance API
function fetchZecPrice() {
  return new Promise((resolve, reject) => {
    // Fetch current price with 24h change from Binance (ZEC/USDT pair)
    const priceUrl = 'https://api.binance.com/api/v3/ticker/24hr?symbol=ZECUSDT'
    
    const request = https.get(priceUrl, (response) => {
      // Check for rate limiting or errors
      if (response.statusCode === 429) {
        consecutiveRateLimitErrors++
        isRateLimited = true
        console.warn(`Rate limited by Binance API (${consecutiveRateLimitErrors} consecutive), using cached data`)
        
        // Use last known price if available
        if (lastPriceData) {
          const priceData = {
            price: lastPriceData.price,
            change24h: lastPriceData.change24h || 0,
            timestamp: new Date().toISOString(),
            history: lastPriceHistory,
            historicalData: lastPriceData.historicalData || null
          }
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('price-update', priceData)
          }
          resolve(priceData)
          return
        }
        reject(new Error('Rate limited and no cached data available'))
        return
      }
      
      // Reset rate limit counter on successful request
      if (response.statusCode === 200) {
        consecutiveRateLimitErrors = 0
        isRateLimited = false
      }
      
      if (response.statusCode !== 200) {
        const error = new Error(`API returned status ${response.statusCode}`)
        console.error('Error fetching ZEC price:', error)
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('price-update', {
            error: error.message,
            timestamp: new Date().toISOString()
          })
        }
        reject(error)
        return
      }
      
      let data = ''
      
      response.on('data', (chunk) => {
        data += chunk
      })
      
      response.on('end', () => {
        try {
          const json = JSON.parse(data)
          
          // Binance API returns: { lastPrice, priceChangePercent, ... }
          if (json.lastPrice && parseFloat(json.lastPrice) > 0) {
            const price = parseFloat(json.lastPrice)
            const change24h = parseFloat(json.priceChangePercent) || 0
            const now = Date.now()
            const shouldFetchChart = (now - lastChartFetch) >= CHART_FETCH_INTERVAL
            
            if (shouldFetchChart) {
              // Fetch historical data for chart from Binance (last 24 hours, 1 hour intervals)
              // Binance klines endpoint: returns OHLCV data
              const chartUrl = 'https://api.binance.com/api/v3/klines?symbol=ZECUSDT&interval=1h&limit=24'
              // Also fetch weekly data (7 days, daily intervals) for 1W period calculation
              const weeklyUrl = 'https://api.binance.com/api/v3/klines?symbol=ZECUSDT&interval=1d&limit=7'
              
              https.get(chartUrl, (chartResponse) => {
                if (chartResponse.statusCode === 200) {
                  let chartData = ''
                  
                  chartResponse.on('data', (chunk) => {
                    chartData += chunk
                  })
                  
                  chartResponse.on('end', () => {
                    try {
                      const chartJson = JSON.parse(chartData)
                      // Binance klines format: [timestamp, open, high, low, close, volume, ...]
                      // Convert to [timestamp, price] format for compatibility
                      lastPriceHistory = chartJson.map(kline => [
                        kline[0], // timestamp in ms
                        parseFloat(kline[4]) // close price
                      ])
                      lastChartFetch = now
                      
                      const priceData = {
                        price: price,
                        change24h: change24h,
                        timestamp: new Date().toISOString(),
                        history: lastPriceHistory,
                        historicalData: chartJson // Store full klines data for period calculations
                      }
                      lastPriceData = priceData
                      
                      // Send price to renderer
                      if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('price-update', priceData)
                      }
                      
                      resolve(priceData)
                    } catch (error) {
                      console.error('Error parsing chart data:', error)
                      // If chart fails, still send price data
                      const priceData = {
                        price: price,
                        change24h: change24h,
                        timestamp: new Date().toISOString(),
                        history: lastPriceHistory,
                        historicalData: null
                      }
                      lastPriceData = priceData
                      
                      if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('price-update', priceData)
                      }
                      resolve(priceData)
                    }
                  })
                } else {
                  // Chart fetch failed, use cached history
                  const priceData = {
                    price: price,
                    change24h: change24h,
                    timestamp: new Date().toISOString(),
                    history: lastPriceHistory,
                    historicalData: lastPriceData?.historicalData || null
                  }
                  lastPriceData = priceData
                  
                  if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('price-update', priceData)
                  }
                  resolve(priceData)
                }
              }).on('error', (error) => {
                console.error('Error fetching chart:', error)
                // If chart fails, still send price data with cached history
                const priceData = {
                  price: price,
                  change24h: change24h,
                  timestamp: new Date().toISOString(),
                  history: lastPriceHistory,
                  historicalData: lastPriceData?.historicalData || null
                }
                lastPriceData = priceData
                
                if (mainWindow && !mainWindow.isDestroyed()) {
                  mainWindow.webContents.send('price-update', priceData)
                }
                resolve(priceData)
              })
            } else {
              // Use cached chart data, just update price
              const priceData = {
                price: price,
                change24h: change24h,
                timestamp: new Date().toISOString(),
                history: lastPriceHistory,
                historicalData: lastPriceData?.historicalData || null
              }
              lastPriceData = priceData
              
              // Send price to renderer
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('price-update', priceData)
              }
              
              resolve(priceData)
            }
          } else {
            const error = new Error('Price data not found in Binance API response')
            console.error('Error parsing ZEC price:', error, 'Response:', json)
            // Send error to renderer
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('price-update', {
                error: error.message,
                timestamp: new Date().toISOString()
              })
            }
            reject(error)
          }
        } catch (error) {
          console.error('Error parsing ZEC price:', error)
          // Send error to renderer
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('price-update', {
              error: error.message,
              timestamp: new Date().toISOString()
            })
          }
          reject(error)
        }
      })
    })
    
    request.on('error', (error) => {
      console.error('Error fetching ZEC price:', error)
      // Send error to renderer
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('price-update', {
          error: error.message,
          timestamp: new Date().toISOString()
        })
      }
      // Don't reject, just log - we'll retry on next interval
      resolve(null)
    })
    
    // Set timeout to prevent hanging requests
    request.setTimeout(5000, () => {
      request.destroy()
      const error = new Error('Request timeout')
      console.error('Request timeout:', error)
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('price-update', {
          error: error.message,
          timestamp: new Date().toISOString()
        })
      }
      resolve(null)
    })
  })
}

// Fetch chart data for a specific time period
function fetchChartDataForPeriod(period) {
  return new Promise((resolve, reject) => {
    let interval, limit
    
    switch (period) {
      case '1H':
        interval = '1m'
        limit = 60 // 60 minutes = 1 hour
        break
      case '4H':
        interval = '5m'
        limit = 48 // 48 * 5min = 240min = 4 hours
        break
      case '1D':
        interval = '1h'
        limit = 24 // 24 hours
        break
      case '1W':
        interval = '1d'
        limit = 7 // 7 days
        break
      default:
        interval = '1h'
        limit = 24
    }
    
    const chartUrl = `https://api.binance.com/api/v3/klines?symbol=ZECUSDT&interval=${interval}&limit=${limit}`
    
    https.get(chartUrl, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`API returned status ${response.statusCode}`))
        return
      }
      
      let data = ''
      
      response.on('data', (chunk) => {
        data += chunk
      })
      
      response.on('end', () => {
        try {
          const chartJson = JSON.parse(data)
          // Convert to [timestamp, price] format
          const history = chartJson.map(kline => [
            kline[0], // timestamp in ms
            parseFloat(kline[4]) // close price
          ])
          
          resolve({
            history: history,
            historicalData: chartJson,
            period: period
          })
        } catch (error) {
          reject(error)
        }
      })
    }).on('error', (error) => {
      reject(error)
    })
  })
}

// Set app to launch at login (startup)
function setAutoLaunch(enabled) {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: false,
    name: 'ZEC Widget'
  })
}

// Enable auto-launch by default
app.whenReady().then(() => {
  // Set auto-launch on startup
  setAutoLaunch(true)
  
  // IPC handler for manual price fetch
  ipcMain.handle('fetch-price', async () => {
    return await fetchZecPrice()
  })
  
  // IPC handler for fetching chart data for a specific period
  ipcMain.handle('fetch-chart-data', async (event, period) => {
    try {
      const chartData = await fetchChartDataForPeriod(period)
      // Send chart data update to renderer
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('chart-data-update', chartData)
      }
      return chartData
    } catch (error) {
      console.error('Error fetching chart data:', error)
      return { error: error.message }
    }
  })
  
  // IPC handler for always-on-top
  ipcMain.handle('set-always-on-top', async (event, flag) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setAlwaysOnTop(flag)
      return flag
    }
    return false
  })
  
  // IPC handler to get always-on-top state
  ipcMain.handle('get-always-on-top', async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      return mainWindow.isAlwaysOnTop()
    }
    return false
  })
  
  // IPC handler to resize window
  ipcMain.handle('resize-window', async (event, width, height) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setSize(width, height)
      return { width, height }
    }
    return null
  })
  
  // IPC handler to get/set auto-launch
  ipcMain.handle('get-auto-launch', async () => {
    const loginItemSettings = app.getLoginItemSettings()
    return loginItemSettings.openAtLogin
  })
  
  ipcMain.handle('set-auto-launch', async (event, enabled) => {
    setAutoLaunch(enabled)
    return enabled
  })
  
  createWindow()
  
  // Fetch price immediately
  fetchZecPrice()
  
  // Set up auto-refresh every 1 second for price updates
  // Binance allows 1200 requests/minute, so 1 req/sec (60/min) is well within limits
  // Rate limit handling will use cached data if we hit limits
  setInterval(fetchZecPrice, PRICE_FETCH_INTERVAL)
})

// Handle app activation (macOS)
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})