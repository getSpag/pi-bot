import { WebSocketServer, WebSocket } from 'ws';
import * as Gpio from 'rpi-gpio';
import * as cv from 'opencv4nodejs';

// ---------- PWM Setup ----------
const PWM_PIN = 18;
const PWM_FREQUENCY = 100; // Hz
const INITIAL_DUTY_CYCLE = 50; // 50%

let pwm: Gpio.GPIO | null = null;
let currentValue = 0;

// Initialize GPIO
async function initializeGPIO(): Promise<void> {
  try {
    Gpio.setMode(Gpio.MODE_BCM);
    Gpio.setup(PWM_PIN, Gpio.DIR_OUT);
    
    // Start PWM with initial duty cycle
    pwm = new Gpio.GPIO(PWM_PIN);
    await pwm.pwmWrite(INITIAL_DUTY_CYCLE);
    console.log(`PWM initialized on pin ${PWM_PIN} with ${INITIAL_DUTY_CYCLE}% duty cycle`);
  } catch (error) {
    console.error('Failed to initialize GPIO:', error);
    throw error;
  }
}

// ---------- Global video clients set ----------
const videoClients = new Set<WebSocket>();

// ---------- LED Control ----------
function ledHandler(ws: WebSocket): void {
  console.log('LED client connected');
  
  ws.on('message', (data: Buffer) => {
    try {
      const message = data.toString();
      const value = parseInt(message, 10);
      
      if (isNaN(value)) {
        console.log(`Invalid LED value: ${message}`);
        return;
      }
      
      // Clamp value between 0-100
      const clampedValue = Math.max(0, Math.min(100, value));
      
      if (pwm) {
        pwm.pwmWrite(clampedValue);
        currentValue = clampedValue;
        console.log(`Set LED brightness to ${clampedValue}`);
      } else {
        console.log('PWM not initialized');
      }
    } catch (error) {
      console.error('Error handling LED message:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('LED client disconnected');
  });
  
  ws.on('error', (error) => {
    console.error('LED client error:', error);
  });
}

// ---------- Video Client Manager ----------
function videoClientHandler(ws: WebSocket): void {
  console.log('Video client connected');
  videoClients.add(ws);
  
  ws.on('close', () => {
    videoClients.delete(ws);
    console.log('Video client disconnected');
  });
  
  ws.on('error', (error) => {
    console.error('Video client error:', error);
    videoClients.delete(ws);
  });
}

// ---------- Global Video Streamer ----------
async function videoStreamer(): Promise<void> {
  try {
    // Initialize camera (using OpenCV as alternative to DepthAI)
    const cap = new cv.VideoCapture(0);
    
    if (!cap.isOpened()) {
      console.error('Failed to open camera');
      return;
    }
    
    console.log('Video streamer started');
    
    while (true) {
      try {
        const frame = cap.read();
        
        if (frame.empty) {
          console.log('Empty frame received');
          continue;
        }
        
        // Resize frame to match original dimensions (640x400)
        const resizedFrame = frame.resize(640, 400);
        
        // Only process frames if clients are connected
        if (videoClients.size > 0) {
          // Encode frame as JPEG
          const encoded = cv.imencode('.jpg', resizedFrame);
          const buffer = Buffer.from(encoded);
          
          // Send to all connected video clients
          const disconnectedClients: WebSocket[] = [];
          
          for (const client of videoClients) {
            try {
              if (client.readyState === WebSocket.OPEN) {
                client.send(buffer);
              } else {
                disconnectedClients.push(client);
              }
            } catch (error) {
              console.error('Error sending frame to client:', error);
              disconnectedClients.push(client);
            }
          }
          
          // Clean up disconnected clients
          disconnectedClients.forEach(client => videoClients.delete(client));
        }
        
        // Yield control to prevent blocking
        await new Promise(resolve => setTimeout(resolve, 10));
        
      } catch (error) {
        console.error('Error in video streaming loop:', error);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  } catch (error) {
    console.error('Video streamer error:', error);
  }
}

// ---------- Main ----------
async function main(): Promise<void> {
  try {
    // Initialize GPIO
    await initializeGPIO();
    
    // Start video streamer task
    const streamerPromise = videoStreamer();
    
    // Create WebSocket servers
    const ledServer = new WebSocketServer({ 
      port: 5000, 
      host: '0.0.0.0' 
    });
    
    const videoServer = new WebSocketServer({ 
      port: 5001, 
      host: '0.0.0.0' 
    });
    
    // Handle LED server connections
    ledServer.on('connection', ledHandler);
    
    // Handle video server connections
    videoServer.on('connection', videoClientHandler);
    
    console.log('WebSocket servers running:');
    console.log('  ws://<PI_IP>:5000 (LED control)');
    console.log('  ws://<PI_IP>:5001 (Video feed)');
    
    // Handle server errors
    ledServer.on('error', (error) => {
      console.error('LED server error:', error);
    });
    
    videoServer.on('error', (error) => {
      console.error('Video server error:', error);
    });
    
    // Wait for video streamer (this will run indefinitely)
    await streamerPromise;
    
  } catch (error) {
    console.error('Main error:', error);
    cleanup();
    process.exit(1);
  }
}

// ---------- Cleanup ----------
function cleanup(): void {
  try {
    if (pwm) {
      pwm.pwmWrite(0);
      pwm.destroy();
    }
    Gpio.destroy();
    console.log('GPIO cleanup completed');
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nReceived SIGINT, shutting down gracefully...');
  cleanup();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM, shutting down gracefully...');
  cleanup();
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  cleanup();
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  cleanup();
  process.exit(1);
});

// Start the server
if (require.main === module) {
  main().catch((error) => {
    console.error('Failed to start server:', error);
    cleanup();
    process.exit(1);
  });
}
