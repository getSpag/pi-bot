import asyncio
import websockets
import depthai as dai
import cv2
import json
import sys
from typing import Optional, List

import RPi.GPIO as GPIO
import time

try:
    import serial  # type: ignore
    import serial.tools.list_ports  # type: ignore
except Exception as exc:  # pragma: no cover
    print("pyserial is required. Install with: pip install -r requirements.txt", file=sys.stderr)
    raise

# ---------- PWM Setup ----------

# Set the GPIO mode (BCM or BOARD)
GPIO.setmode(GPIO.BCM)

# Choose a GPIO pin for PWM
pwm_pin = 18 

# Setup the chosen pin as an output
GPIO.setup(pwm_pin, GPIO.OUT)

# Create a PWM object with the pin and frequency (Hz)
pwm = GPIO.PWM(pwm_pin, 100) # 100 Hz frequency

# Start PWM with an initial duty cycle (0-100)
pwm.start(50) # 50% duty cycle

value = 0

# ---------- Global video clients set ----------

video_clients = set()

# ---------- Roomba Setup ----------

# Global Roomba serial connection
roomba_serial: Optional[serial.Serial] = None

# Global Roomba drive state
roomba_driving = False
roomba_velocity = 0
roomba_radius = 0
roomba_drive_task: Optional[asyncio.Task] = None

def list_serial_ports() -> List[str]:
    ports = serial.tools.list_ports.comports()
    return [p.device for p in ports]

def pick_port(preferred_path: str = "/dev/ttyACM0") -> Optional[str]:
    available = list_serial_ports()
    print("Available ports:")
    for p in available:
        print(p)
    if preferred_path in available:
        return preferred_path
    return available[0] if available else None

def write_bytes(ser: serial.Serial, values: List[int]) -> None:
    ser.write(bytes(values))
    ser.flush()

async def initialize_roomba() -> bool:
    """Initialize Roomba connection and put it in safe mode"""
    global roomba_serial
    try:
        port_path = pick_port("/dev/ttyACM0")
        if not port_path:
            print("No serial ports found for Roomba.", file=sys.stderr)
            return False

        print(f"Connecting to Roomba at {port_path} @ 115200...")
        roomba_serial = serial.Serial(port=port_path, baudrate=115200, timeout=1)
        
        # Start (Roomba OI: Start = 128)
        write_bytes(roomba_serial, [128])
        await asyncio.sleep(0.1)

        # Safe mode (131). For Full mode, use 132
        write_bytes(roomba_serial, [131])
        await asyncio.sleep(0.1)
        
        print("Roomba initialized and in safe mode")
        return True
    except Exception as e:
        print(f"Failed to initialize Roomba: {e}")
        return False


# ---------- LED Control ----------
async def led_handler(ws):
    print("LED client connected")
    try:
        async for message in ws:
            try:
                value = int(message)
                value = max(0, min(100, value))  # clamp 0–100
                pwm.ChangeDutyCycle(value)
                # TODO: hook into actual LED brightness code here (e.g., PWM)
                print(f"Set LED brightness to {value}")
            except ValueError:
                print(f"Invalid LED value: {message}")
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        print("LED client disconnected")

# ---------- Video Client Manager ----------
async def video_client_handler(ws):
    global video_clients  # Add this line
    print("Video client connected")
    video_clients.add(ws)
    try:
        # Just keep the connection alive
        await ws.wait_closed()
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        video_clients.discard(ws)
        print("Video client disconnected")

# ---------- Roomba Control ----------
async def roomba_handler(ws):
    global roomba_serial
    print("Roomba client connected")
    try:
        async for message in ws:
            try:
                # Parse JSON command
                command = json.loads(message)
                print(command)
                command_type = command.get("command")
                
                if not roomba_serial:
                    await ws.send(json.dumps({"error": "Roomba not initialized"}))
                    continue
                
                if command_type == "drive":
                    # Drive command: {"command": "drive", "velocity": 100, "radius": 0}
                    velocity = command.get("velocity", 0)
                    radius = command.get("radius", 0)
                    
                    # Clamp velocity to valid range (-500 to 500 mm/s)
                    velocity = max(-500, min(500, velocity))
                    # Clamp radius to valid range (-2000 to 2000 mm)
                    radius = max(-2000, min(2000, radius))
                    
                    # Update global drive state
                    roomba_velocity = velocity
                    roomba_radius = radius
                    roomba_driving = True
                    
                    # Convert to high/low bytes and send drive command
                    vel_high = (velocity >> 8) & 0xFF
                    vel_low = velocity & 0xFF
                    rad_high = (radius >> 8) & 0xFF
                    rad_low = radius & 0xFF
                    
                    write_bytes(roomba_serial, [137, vel_high, vel_low, rad_high, rad_low])
                    print(f"Roomba drive started: velocity={velocity}, radius={radius}")
                    await ws.send(json.dumps({"status": "success", "command": "drive", "velocity": velocity, "radius": radius}))
                    
                    # Keep sending drive commands until roomba_driving becomes False
                    while roomba_driving:
                        await asyncio.sleep(0.1)  # Wait 100ms
                        if roomba_driving and roomba_serial:
                            write_bytes(roomba_serial, [137, vel_high, vel_low, rad_high, rad_low])
                
                elif command_type == "stop":
                    # Stop command - stop the continuous drive
                    roomba_driving = False
                    write_bytes(roomba_serial, [137, 0, 0, 0, 0])  # Stop drive
                    write_bytes(roomba_serial, [173])  # Stop command
                    print("Roomba stopped")
                    await ws.send(json.dumps({"status": "success", "command": "stop"}))
                
                elif command_type == "clean":
                    # Stop any ongoing drive and start cleaning cycle
                    roomba_driving = False
                    write_bytes(roomba_serial, [135])
                    print("Roomba cleaning started")
                    await ws.send(json.dumps({"status": "success", "command": "clean"}))
                
                elif command_type == "dock":
                    # Stop any ongoing drive and return to dock
                    roomba_driving = False
                    write_bytes(roomba_serial, [143])
                    print("Roomba returning to dock")
                    await ws.send(json.dumps({"status": "success", "command": "dock"}))
                
                elif command_type == "status":
                    # Send current status
                    await ws.send(json.dumps({"status": "success", "roomba_connected": roomba_serial is not None, "driving": roomba_driving}))
                
                else:
                    await ws.send(json.dumps({"error": f"Unknown command: {command_type}"}))
                    
            except json.JSONDecodeError:
                await ws.send(json.dumps({"error": "Invalid JSON format"}))
            except Exception as e:
                print(f"Roomba command error: {e}")
                await ws.send(json.dumps({"error": str(e)}))
                
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        print("Roomba client disconnected")

# ---------- Global Video Streamer ----------
async def video_streamer():
    global video_clients
    # Create pipeline
    # https://docs.luxonis.com/software-v3/depthai/examples/camera/camera_output/
    with dai.Pipeline() as pipeline:
        # Define source and output
        cam = pipeline.create(dai.node.Camera).build()
        videoQueue = cam.requestOutput((640,400)).createOutputQueue()

        # Connect to device and start pipeline
        pipeline.start()
        while pipeline.isRunning():
            videoIn = videoQueue.get() #frame
            assert isinstance(videoIn, dai.ImgFrame)
            # cv2.imshow("video", videoIn.getCvFrame())


            # if cv2.waitKey(1) == ord("q"):
            #     break
            if video_clients:  # Only process frames if clients are connected
                # Get the frame data (DepthAI 3.0 returns frame object)
                frame_data = videoIn.getCvFrame()
                ok, buffer = cv2.imencode(".jpg", frame_data)
                if ok:
                    # Send to all connected video clients
                    disconnected_clients = set()
                    for client in video_clients:
                        try:
                            await client.send(buffer.tobytes())
                        except websockets.exceptions.ConnectionClosed:
                            disconnected_clients.add(client)
                    
                    # Clean up disconnected clients
                    video_clients -= disconnected_clients
            
            # CRITICAL: Yield control back to event loop
            # OTHERWISE THIS IS A BLOCKIGN CALL!
            await asyncio.sleep(0.01)


# ---------- Main ----------
async def main():
    
    # Initialize Roomba connection
    roomba_initialized = await initialize_roomba()
    if not roomba_initialized:
        print("Warning: Roomba initialization failed, Roomba commands will not work")
    
    # Start video streamer task
    # Needs to run independently of clients connecting
    streamer_task = asyncio.create_task(video_streamer()) # should this happen for the led_slider too?
    
    # Start WebSocket servers (no router needed)
    # Whenever a client connects to these ports, these functions are called
    led_server = websockets.serve(led_handler, "0.0.0.0", 5000)
    video_server = websockets.serve(video_client_handler, "0.0.0.0", 5001)
    roomba_server = websockets.serve(roomba_handler, "0.0.0.0", 5002)
    
    print("WebSocket servers running:")
    print("  ws://<PI_IP>:5000 (LED control)")
    print("  ws://<PI_IP>:5001 (Video feed)")
    print("  ws://<PI_IP>:5002 (Roomba control)")


    # This will start all servers and the background tasks concurrently. 
    await asyncio.gather(led_server, video_server, roomba_server, streamer_task)

    
    # async with websockets.serve(led_handler, "0.0.0.0", 5000):
    #     print("WebSocket server running at ws://0.0.0.0:5000")
    #     await asyncio.Future()  # run forever

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pwm.stop()
        GPIO.cleanup()
        if roomba_serial:
            roomba_serial.close()
        print("Socket Terminated")
    except Exception as e:
        pwm.stop()
        GPIO.cleanup()
        if roomba_serial:
            roomba_serial.close()
        print(f"Error: {e}")