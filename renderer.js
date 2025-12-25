let priceHistory = []
let currentPrice = 0
let currentPriceData = null
let selectedPeriod = '1D' // 1H, 4H, 1D, 1W
let lastHundredLevel = null // Track the last hundred level (e.g., 4 for $400s, 5 for $500s)

// Time periods in order
const timePeriods = ['1H', '4H', '1D', '1W']

// Calculate price change for a specific period
function calculatePeriodChange(priceData, period) {
  if (!priceData || !priceData.price) return 0
  
  const currentPrice = priceData.price
  let pastPrice = null
  
  if (period === '1D') {
    // Use the 24h change from API
    return priceData.change24h || 0
  }
  
  // For other periods, calculate from historical data
  if (!priceData.historicalData || priceData.historicalData.length === 0) {
    return priceData.change24h || 0 // Fallback to 24h change
  }
  
  const now = Date.now()
  let targetTime = 0
  
  switch (period) {
    case '1H':
      targetTime = now - (60 * 60 * 1000) // 1 hour ago
      break
    case '4H':
      targetTime = now - (4 * 60 * 60 * 1000) // 4 hours ago
      break
    case '1W':
      targetTime = now - (7 * 24 * 60 * 60 * 1000) // 7 days ago
      break
    default:
      return priceData.change24h || 0
  }
  
  // Find the closest historical price point
  // historicalData is klines format: [timestamp, open, high, low, close, ...]
  for (let i = priceData.historicalData.length - 1; i >= 0; i--) {
    const kline = priceData.historicalData[i]
    const klineTime = kline[0]
    if (klineTime <= targetTime) {
      pastPrice = parseFloat(kline[4]) // close price
      break
    }
  }
  
  // If we need 1W data and don't have it in hourly data, try to find it
  if (period === '1W' && !pastPrice) {
    // Try to find the oldest data point (might be from daily klines)
    if (priceData.historicalData && priceData.historicalData.length > 0) {
      // Sort by timestamp and get the oldest
      const sorted = [...priceData.historicalData].sort((a, b) => a[0] - b[0])
      const oldest = sorted[0]
      if (oldest && oldest[0] <= targetTime) {
        pastPrice = parseFloat(oldest[4])
      }
    }
    // If still no data, fallback to 24h change
    if (!pastPrice) {
      return priceData.change24h || 0
    }
  }
  
  if (!pastPrice) {
    return priceData.change24h || 0 // Fallback
  }
  
  // Calculate percentage change
  const change = ((currentPrice - pastPrice) / pastPrice) * 100
  return change
}

// Update the change badge display
function updateChangeBadge() {
  if (!currentPriceData) return
  
  const change = calculatePeriodChange(currentPriceData, selectedPeriod)
  const changeBadge = document.getElementById('change-badge')
  changeBadge.textContent = `${change >= 0 ? '+' : ''}${change.toFixed(2)}% ${selectedPeriod}`
  changeBadge.classList.toggle('negative', change < 0)
}

// Generate and play triumph sound (ascending notes)
function playTriumphSound() {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)()
  const notes = [523.25, 659.25, 783.99] // C5, E5, G5 - major chord
  let noteIndex = 0
  
  function playNote(frequency, startTime) {
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()
    
    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)
    
    oscillator.frequency.value = frequency
    oscillator.type = 'sine'
    
    gainNode.gain.setValueAtTime(0.3, startTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.3)
    
    oscillator.start(startTime)
    oscillator.stop(startTime + 0.3)
  }
  
  notes.forEach((note, index) => {
    playNote(note, audioContext.currentTime + index * 0.15)
  })
}

// Generate and play wrong buzzer sound (descending harsh tone)
function playBuzzerSound() {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)()
  const oscillator = audioContext.createOscillator()
  const gainNode = audioContext.createGain()
  
  oscillator.connect(gainNode)
  gainNode.connect(audioContext.destination)
  
  oscillator.type = 'sawtooth'
  oscillator.frequency.setValueAtTime(200, audioContext.currentTime)
  oscillator.frequency.exponentialRampToValueAtTime(100, audioContext.currentTime + 0.5)
  
  gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5)
  
  oscillator.start(audioContext.currentTime)
  oscillator.stop(audioContext.currentTime + 0.5)
}

// Check if price crossed a hundred threshold and play appropriate sound
function checkHundredThreshold(newPrice) {
  if (newPrice <= 0) return
  
  // Calculate which "hundred" we're in (e.g., $450 -> 4, $500 -> 5)
  const currentHundredLevel = Math.floor(newPrice / 100)
  
  // Only trigger if we have a previous level and it changed
  if (lastHundredLevel !== null && currentHundredLevel !== lastHundredLevel) {
    if (currentHundredLevel > lastHundredLevel) {
      // Price went up to a new higher hundred
      playTriumphSound()
    } else if (currentHundredLevel < lastHundredLevel) {
      // Price went down to a lower hundred
      playBuzzerSound()
    }
  }
  
  // Update the last level
  lastHundredLevel = currentHundredLevel
}

// Set up price update listener
window.electronAPI.onPriceUpdate((priceData) => {
  if (priceData.error) {
    document.getElementById('price').textContent = `Error: ${priceData.error}`
    document.getElementById('change-badge').textContent = '--'
  } else {
    const previousPrice = currentPrice
    currentPrice = priceData.price
    currentPriceData = priceData
    document.getElementById('price').textContent = `$${priceData.price.toFixed(2)}`
    
    // Check for hundred threshold crossings and play sounds
    if (previousPrice !== priceData.price) {
      checkHundredThreshold(priceData.price)
    }
    
    // Update change badge for selected period
    updateChangeBadge()
    
    // Update chart if history data is available and period is 1D (default from API)
    // For other periods, chart will be updated when period changes via fetchChartData
    if (priceData.history && priceData.history.length > 0 && selectedPeriod === '1D') {
      priceHistory = priceData.history.map(([timestamp, price]) => ({
        time: timestamp,
        price: price
      }))
      drawChart()
    }
  }
})

// Draw the price chart
function drawChart() {
  if (priceHistory.length === 0) return
  
  const svg = document.getElementById('chart-svg')
  const container = document.getElementById('chart')
  const width = container.clientWidth
  const height = container.clientHeight
  
  svg.setAttribute('width', width)
  svg.setAttribute('height', height)
  
  // Clear previous chart
  svg.innerHTML = ''
  
  // Calculate min/max for scaling
  const prices = priceHistory.map(d => d.price)
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)
  const priceRange = maxPrice - minPrice || 1
  
  // Padding for the chart
  const padding = { top: 10, right: 10, bottom: 10, left: 10 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom
  
  // Create path for the line
  let pathData = ''
  let areaPathData = ''
  
  priceHistory.forEach((point, index) => {
    const x = padding.left + (index / (priceHistory.length - 1)) * chartWidth
    const y = padding.top + chartHeight - ((point.price - minPrice) / priceRange) * chartHeight
    
    if (index === 0) {
      pathData += `M ${x} ${y}`
      areaPathData = `M ${x} ${padding.top + chartHeight} L ${x} ${y} `
    } else {
      pathData += ` L ${x} ${y}`
      areaPathData += `L ${x} ${y} `
    }
    
    if (index === priceHistory.length - 1) {
      areaPathData += `L ${x} ${padding.top + chartHeight} Z`
    }
  })
  
  // Draw area under the line
  const areaPath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  areaPath.setAttribute('d', areaPathData)
  areaPath.setAttribute('class', 'chart-area')
  svg.appendChild(areaPath)
  
  // Draw the line
  const linePath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  linePath.setAttribute('d', pathData)
  linePath.setAttribute('class', 'chart-line')
  svg.appendChild(linePath)
  
  // Add mouse move handler for tooltip
  svg.addEventListener('mousemove', (e) => {
    const rect = svg.getBoundingClientRect()
    const x = e.clientX - rect.left
    const index = Math.round(((x - padding.left) / chartWidth) * (priceHistory.length - 1))
    const clampedIndex = Math.max(0, Math.min(index, priceHistory.length - 1))
    const point = priceHistory[clampedIndex]
    
    if (point) {
      const tooltip = document.getElementById('tooltip')
      const tooltipTime = document.getElementById('tooltip-time')
      const tooltipPrice = document.getElementById('tooltip-price')
      
      const date = new Date(point.time)
      const time = date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      })
      
      tooltipTime.textContent = time
      tooltipPrice.textContent = `$${point.price.toFixed(2)}`
      
      tooltip.style.left = `${x}px`
      tooltip.style.top = `${e.clientY - rect.top - 40}px`
      tooltip.classList.add('visible')
    }
  })
  
  svg.addEventListener('mouseleave', () => {
    document.getElementById('tooltip').classList.remove('visible')
  })
}

// Fetch initial price
window.electronAPI.fetchPrice().then((priceData) => {
  if (priceData && !priceData.error) {
    currentPrice = priceData.price
    currentPriceData = priceData
    document.getElementById('price').textContent = `$${priceData.price.toFixed(2)}`
    
    // Initialize the hundred level (don't play sound on initial load)
    if (lastHundredLevel === null) {
      lastHundredLevel = Math.floor(priceData.price / 100)
    }
    
    // Update change badge for selected period
    updateChangeBadge()
    
    if (priceData.history && priceData.history.length > 0) {
      priceHistory = priceData.history.map(([timestamp, price]) => ({
        time: timestamp,
        price: price
      }))
      drawChart()
    }
  }
})

// Handle window resize
window.addEventListener('resize', () => {
  if (priceHistory.length > 0) {
    drawChart()
  }
})

// Handle chart toggle
const chartToggle = document.getElementById('chart-toggle')
const chartContainer = document.getElementById('chart-container')

// Window dimensions
const WIDTH_WITH_CHART = 400
const HEIGHT_WITH_CHART = 500
const WIDTH_WITHOUT_CHART = 400
const HEIGHT_WITHOUT_CHART = 180 // Approximate height without chart

// Handle chart toggle change
chartToggle.addEventListener('change', async (e) => {
  const showChart = e.target.checked
  
  if (showChart) {
    chartContainer.classList.remove('hidden')
    window.electronAPI.resizeWindow(WIDTH_WITH_CHART, HEIGHT_WITH_CHART)
    // Fetch chart data for current period when chart is enabled
    try {
      const chartData = await window.electronAPI.fetchChartData(selectedPeriod)
      if (chartData && !chartData.error && chartData.history) {
        priceHistory = chartData.history.map(([timestamp, price]) => ({
          time: timestamp,
          price: price
        }))
        drawChart()
      }
    } catch (error) {
      console.error('Error fetching chart data:', error)
    }
  } else {
    chartContainer.classList.add('hidden')
    window.electronAPI.resizeWindow(WIDTH_WITHOUT_CHART, HEIGHT_WITHOUT_CHART)
  }
})

// Handle change badge click - cycle through time periods
const changeBadge = document.getElementById('change-badge')
changeBadge.addEventListener('click', async () => {
  const currentIndex = timePeriods.indexOf(selectedPeriod)
  const nextIndex = (currentIndex + 1) % timePeriods.length
  selectedPeriod = timePeriods[nextIndex]
  updateChangeBadge()
  
  // Fetch and update chart data for the new period
  if (document.getElementById('chart-toggle').checked) {
    try {
      const chartData = await window.electronAPI.fetchChartData(selectedPeriod)
      if (chartData && !chartData.error && chartData.history) {
        priceHistory = chartData.history.map(([timestamp, price]) => ({
          time: timestamp,
          price: price
        }))
        drawChart()
      }
    } catch (error) {
      console.error('Error fetching chart data:', error)
    }
  }
})

// Listen for chart data updates from main process
window.electronAPI.onChartDataUpdate((chartData) => {
  if (chartData && !chartData.error && chartData.history) {
    priceHistory = chartData.history.map(([timestamp, price]) => ({
      time: timestamp,
      price: price
    }))
    drawChart()
  }
})

// Handle pin to top checkbox
const pinCheckbox = document.getElementById('pin-checkbox')

// Get initial state
window.electronAPI.getAlwaysOnTop().then((isPinned) => {
  pinCheckbox.checked = isPinned
})

// Handle checkbox change
pinCheckbox.addEventListener('change', (e) => {
  const isPinned = e.target.checked
  window.electronAPI.setAlwaysOnTop(isPinned)
})
