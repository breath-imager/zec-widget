let currentPrice = 0
let previousPrice = 0
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

// Play Mario win sound from audio file
function playTriumphSound() {
  const audio = new Audio('mario-win.wav')
  audio.volume = 0.7
  audio.play().catch(error => {
    console.error('Error playing triumph sound:', error)
  })
}

// Play Price is Right fail sound from audio file
function playBuzzerSound() {
  const audio = new Audio('priceisright-fail.wav')
  audio.volume = 0.7
  audio.play().catch(error => {
    console.error('Error playing buzzer sound:', error)
  })
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
    document.getElementById('price-dollars').textContent = 'Error'
    document.getElementById('price-cents').textContent = ''
    document.getElementById('change-badge').textContent = '--'
    previousPrice = 0 // Reset on error
  } else {
    const newPrice = priceData.price
    const dollarsElement = document.getElementById('price-dollars')
    const centsElement = document.getElementById('price-cents')
    
    // Animate price change if it changed
    if (previousPrice > 0 && newPrice !== previousPrice) {
      // Parse old and new prices
      const oldFormatted = previousPrice.toFixed(2)
      const newFormatted = newPrice.toFixed(2)
      
      const oldParts = oldFormatted.split('.')
      const newParts = newFormatted.split('.')
      const oldDollars = oldParts[0]
      const oldCents = oldParts[1]
      const newDollars = newParts[0]
      const newCents = newParts[1]
      
      // Determine animation direction
      const isUp = newPrice > previousPrice
      const animationClass = isUp ? 'animate-up' : 'animate-down'
      
      // Animate dollars if they changed
      if (oldDollars !== newDollars) {
        dollarsElement.classList.remove('animate-up', 'animate-down')
        void dollarsElement.offsetWidth // Force reflow
        dollarsElement.textContent = newDollars
        dollarsElement.classList.add(animationClass)
        setTimeout(() => {
          dollarsElement.classList.remove('animate-up', 'animate-down')
          dollarsElement.style.color = '#ffffff'
        }, 600)
      } else {
        dollarsElement.textContent = newDollars
      }
      
      // Animate cents if they changed
      if (oldCents !== newCents) {
        centsElement.classList.remove('animate-up', 'animate-down')
        void centsElement.offsetWidth // Force reflow
        centsElement.textContent = newCents
        centsElement.classList.add(animationClass)
        setTimeout(() => {
          centsElement.classList.remove('animate-up', 'animate-down')
          centsElement.style.color = '#ffffff'
        }, 600)
      } else {
        centsElement.textContent = newCents
      }
      
      // Check for hundred threshold crossings and play sounds
      checkHundredThreshold(newPrice)
    } else {
      // First load or no change - just update text
      const formatted = newPrice.toFixed(2)
      const parts = formatted.split('.')
      dollarsElement.textContent = parts[0]
      centsElement.textContent = parts[1]
    }
    
    previousPrice = newPrice
    currentPrice = newPrice
    currentPriceData = priceData
    
    // Update change badge for selected period
    updateChangeBadge()
  }
})


// Fetch initial price
window.electronAPI.fetchPrice().then((priceData) => {
  if (priceData && !priceData.error) {
    currentPrice = priceData.price
    previousPrice = priceData.price // Set initial previous price
    currentPriceData = priceData
    
    // Set initial price display
    const formatted = priceData.price.toFixed(2)
    const parts = formatted.split('.')
    document.getElementById('price-dollars').textContent = parts[0]
    document.getElementById('price-cents').textContent = parts[1]
    
    // Initialize the hundred level (don't play sound on initial load)
    if (lastHundredLevel === null) {
      lastHundredLevel = Math.floor(priceData.price / 100)
    }
    
    // Update change badge for selected period
    updateChangeBadge()
  }
})


// Handle change badge click - cycle through time periods
const changeBadge = document.getElementById('change-badge')
changeBadge.addEventListener('click', async () => {
  const currentIndex = timePeriods.indexOf(selectedPeriod)
  const nextIndex = (currentIndex + 1) % timePeriods.length
  selectedPeriod = timePeriods[nextIndex]
  updateChangeBadge()
  
  // Fetch chart data for the new period to update the change calculation
  try {
    const chartData = await window.electronAPI.fetchChartData(selectedPeriod)
    if (chartData && !chartData.error && currentPriceData) {
      // Update currentPriceData with new historical data for period calculation
      currentPriceData.historicalData = chartData.historicalData
      updateChangeBadge()
    }
  } catch (error) {
    console.error('Error fetching chart data:', error)
  }
})


// Handle sound test buttons
const testTriumphBtn = document.getElementById('test-triumph')
const testBuzzerBtn = document.getElementById('test-buzzer')

if (testTriumphBtn) {
  testTriumphBtn.addEventListener('click', () => {
    playTriumphSound()
  })
}

if (testBuzzerBtn) {
  testBuzzerBtn.addEventListener('click', () => {
    playBuzzerSound()
  })
}

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
