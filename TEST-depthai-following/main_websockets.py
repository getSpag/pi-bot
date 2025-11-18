import asyncio
import websockets
import depthai as dai
import cv2

# ---------- Global video clients set ----------

video_clients = set()

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

# ---------- Global Video Streamer ----------
async def video_streamer():
    global video_clients
    # Create pipeline
    # https://docs.luxonis.com/software-v3/depthai/examples/camera/camera_output/


    #########################################################

    # extra!!
    # neural network selection / starting
    # way to get data control loop

    #########################################################

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
    
    # Start video streamer task
    # Needs to run independently of clients connecting
    streamer_task = asyncio.create_task(video_streamer()) # should this happen for the led_slider too?
    
    # Start WebSocket servers (no router needed)
    # Whenever a client connects to these ports, these functions are called
    video_server = websockets.serve(video_client_handler, "0.0.0.0", 5001)
    
    print("WebSocket servers running:")
    print("  ws://<PI_IP>:5001 (Video feed)")


    # This will start all servers and the background tasks concurrently. 
    await asyncio.gather(video_server, streamer_task)

    
    # async with websockets.serve(led_handler, "0.0.0.0", 5000):
    #     print("WebSocket server running at ws://0.0.0.0:5000")
    #     await asyncio.Future()  # run forever

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Socket Terminated")
    except Exception as e:
        print(f"Error: {e}")

