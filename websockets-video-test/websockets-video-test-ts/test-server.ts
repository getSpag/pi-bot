import { WebSocketServer, WebSocket } from 'ws';

// Test version without GPIO and camera dependencies
console.log('Starting test WebSocket server...');

// ---------- Global video clients set ----------
const videoClients = new Set<WebSocket>();

// ---------- LED Control (Test Version) ----------
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
      console.log(`[TEST] Would set LED brightness to ${clampedValue}%`);
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

// ---------- Test Video Streamer ----------
async function testVideoStreamer(): Promise<void> {
  console.log('Test video streamer started');
  
  let frameCount = 0;
  
  while (true) {
    try {
      // Simulate video frames
      if (videoClients.size > 0) {
        const testFrame = Buffer.from(`Test frame ${frameCount++}`);
        
        // Send to all connected video clients
        const disconnectedClients: WebSocket[] = [];
        
        for (const client of videoClients) {
          try {
            if (client.readyState === WebSocket.OPEN) {
              client.send(testFrame);
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
        
        console.log(`[TEST] Sent frame ${frameCount} to ${videoClients.size} clients`);
      }
      
      // Wait 1 second between frames
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error('Error in test video streaming loop:', error);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

// ---------- Main ----------
async function main(): Promise<void> {
  try {
    // Start test video streamer task
    const streamerPromise = testVideoStreamer();
    
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
    
    console.log('Test WebSocket servers running:');
    console.log('  ws://<PI_IP>:5000 (LED control - test mode)');
    console.log('  ws://<PI_IP>:5001 (Video feed - test mode)');
    console.log('Send numbers 0-100 to LED server to test brightness control');
    console.log('Connect to video server to receive test frames');
    
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
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nReceived SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Start the test server
if (require.main === module) {
  main().catch((error) => {
    console.error('Failed to start test server:', error);
    process.exit(1);
  });
}
