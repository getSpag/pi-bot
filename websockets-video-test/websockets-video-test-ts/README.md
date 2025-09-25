# TypeScript WebSocket Server

This is a TypeScript conversion of the Python WebSocket server for LED control and video streaming on Raspberry Pi.

## Installation

1. Install Node.js and npm on your Raspberry Pi
2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

Run the server with tsx:
```bash
npm start
# or directly with tsx
tsx main.ts
```

## Features

- **LED Control WebSocket** (port 5000): Accepts brightness values 0-100
- **Video Streaming WebSocket** (port 5001): Streams camera feed as JPEG frames
- **GPIO PWM Control**: Controls LED brightness via PWM on GPIO pin 18
- **Graceful Shutdown**: Handles SIGINT/SIGTERM for clean GPIO cleanup

## Dependencies

- `ws`: WebSocket server library
- `rpi-gpio`: Raspberry Pi GPIO control
- `opencv4nodejs`: Camera capture and image processing
- `tsx`: TypeScript execution (dev dependency)

## Notes

- The video streaming uses OpenCV instead of DepthAI for broader compatibility
- GPIO pin 18 is used for PWM control (configurable in code)
- Camera index 0 is used by default (configurable in code)
- Frame size is set to 640x400 to match original implementation

## Troubleshooting

- Ensure camera permissions are set correctly
- Check that GPIO pins are not in use by other processes
- Verify camera is connected and working with `v4l2-ctl --list-devices`
