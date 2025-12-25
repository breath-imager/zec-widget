# ZEC Price Widget

A minimal Electron widget for displaying Zcash (ZEC) price in real-time.

## Features

- Real-time ZEC price updates from Binance API
- Interactive price chart with 24-hour history
- Time period selector (1H, 4H, 1D, 1W) for price changes
- Sound notifications when price crosses $100 thresholds
- Pin to top functionality
- Chart toggle
- Auto-launch on system startup

## Development

```bash
# Install dependencies
yarn install

# Run in development mode
yarn start
```

## Building Standalone Executable

### macOS

```bash
# Build for macOS
yarn build:mac

# Or build for all platforms
yarn build
```

The built application will be in the `dist` folder.

### First Build

On first build, electron-builder will download Electron binaries. This may take a few minutes.

## Auto-Launch

The app is configured to automatically launch at system startup. This is enabled by default.

To disable auto-launch:
- macOS: System Settings → General → Login Items → Remove "ZEC Widget"

## Installation

After building, you can:

1. **macOS**: 
   - Open the `.dmg` file from the `dist` folder
   - Drag "ZEC Widget" to Applications
   - The app will launch automatically on login

2. **Manual Installation**:
   - Copy the built app to your Applications folder
   - The app will automatically add itself to login items

## Requirements

- macOS 10.13 or later
- Internet connection for price data

## License

Copyright cyberglobacore 2025
