import React, { useEffect, useRef, useState } from "react";



const HOST = (import.meta as any).env?.VITE_PI_HOST || window.location.hostname || "192.168.2.252";
const LED_URL = `ws://${HOST}:5000/led_control`;
const VIDEO_URL = `ws://${HOST}:5001/video_feed`;
const ROOMBA_URL = `ws://${HOST}:5002/roomba_control`;

export default function App() {
  const [brightness, setBrightness] = useState(50);
  const [ledConnected, setLedConnected] = useState(false);
  const [videoConnected, setVideoConnected] = useState(false);
  const [roombaConnected, setRoombaConnected] = useState(false);
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [roombaStatus, setRoombaStatus] = useState<string>("Disconnected");

  const ledWS = useRef<WebSocket | null>(null);
  const videoWS = useRef<WebSocket | null>(null);
  const roombaWS = useRef<WebSocket | null>(null);
  const lastBlobUrl = useRef<string | null>(null);
  const reconnectTimers = useRef<{ led?: any; video?: any; roomba?: any }>({});

  // LED WebSocket
  useEffect(() => {
    const connectLed = () => {
      const ws = new WebSocket(LED_URL);
      ledWS.current = ws;

      ws.onopen = () => setLedConnected(true);
      ws.onclose = () => {
        setLedConnected(false);
        reconnectTimers.current.led = setTimeout(connectLed, 1000);
      };
      ws.onerror = () => ws.close();
    };

    connectLed();
    return () => {
      if (reconnectTimers.current.led) clearTimeout(reconnectTimers.current.led);
      ledWS.current?.close();
    };
  }, []);

  // Video WebSocket
  useEffect(() => {
    const connectVideo = () => {
      const ws = new WebSocket(VIDEO_URL);
      ws.binaryType = "arraybuffer";
      videoWS.current = ws;

      ws.onopen = () => setVideoConnected(true);
      ws.onclose = () => {
        setVideoConnected(false);
        reconnectTimers.current.video = setTimeout(connectVideo, 1000);
      };
      ws.onerror = () => ws.close();

      ws.onmessage = (ev) => {
        const blob = new Blob([ev.data], { type: "image/jpeg" });
        const url = URL.createObjectURL(blob);
        if (lastBlobUrl.current) URL.revokeObjectURL(lastBlobUrl.current);
        lastBlobUrl.current = url;
        setImgSrc(url);
      };
    };

    connectVideo();
    return () => {
      if (reconnectTimers.current.video) clearTimeout(reconnectTimers.current.video);
      videoWS.current?.close();
      if (lastBlobUrl.current) URL.revokeObjectURL(lastBlobUrl.current);
    };
  }, []);

  // Roomba WebSocket
  useEffect(() => {
    const connectRoomba = () => {
      const ws = new WebSocket(ROOMBA_URL);
      roombaWS.current = ws;

      ws.onopen = () => {
        setRoombaConnected(true);
        setRoombaStatus("Connected");
      };
      ws.onclose = () => {
        setRoombaConnected(false);
        setRoombaStatus("Disconnected");
        reconnectTimers.current.roomba = setTimeout(connectRoomba, 1000);
      };
      ws.onerror = () => ws.close();

      ws.onmessage = (ev) => {
        try {
          const response = JSON.parse(ev.data);
          if (response.status === "success") {
            setRoombaStatus(`Connected - Last command: ${response.command}`);
          } else if (response.error) {
            setRoombaStatus(`Error: ${response.error}`);
          }
        } catch (e) {
          console.error("Failed to parse Roomba response:", e);
        }
      };
    };

    connectRoomba();
    return () => {
      if (reconnectTimers.current.roomba) clearTimeout(reconnectTimers.current.roomba);
      roombaWS.current?.close();
    };
  }, []);

  const onBrightnessChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    setBrightness(value);
    if (ledWS.current && ledWS.current.readyState === WebSocket.OPEN) {
      ledWS.current.send(value.toString());
    }
  };

  // Roomba control functions
  const sendRoombaCommand = (command: any) => {
    if (roombaWS.current && roombaWS.current.readyState === WebSocket.OPEN) {
      roombaWS.current.send(JSON.stringify(command));
    }
  };

  const driveRoomba = (velocity: number, radius: number = 0) => {
    sendRoombaCommand({ command: "drive", velocity, radius });
  };

  const stopRoomba = () => {
    sendRoombaCommand({ command: "stop" });
  };

  const cleanRoomba = () => {
    sendRoombaCommand({ command: "clean" });
  };

  const dockRoomba = () => {
    sendRoombaCommand({ command: "dock" });
  };

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: "1.5rem", maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ marginBottom: "0.5rem" }}>Pi-Bot Control Panel</h1>
      <p style={{ color: "#555", marginTop: 0 }}>
        LED: {ledConnected ? "Connected" : "Disconnected"} · Video: {videoConnected ? "Connected" : "Disconnected"} · Roomba: {roombaConnected ? "Connected" : "Disconnected"}
      </p>

      <section style={{ marginTop: "1.5rem" }}>
        <h2 style={{ fontSize: "1.1rem" }}>LED Brightness</h2>
        <input
          type="range"
          min={0}
          max={100}
          value={brightness}
          onChange={onBrightnessChange}
          style={{ width: "100%" }}
        />
        <div style={{ marginTop: 8 }}>Brightness: {brightness}</div>
      </section>

      <section style={{ marginTop: "1.5rem" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Roomba Control</h2>
        <div style={{ marginBottom: "0.5rem", fontSize: "0.9rem", color: "#666" }}>
          Status: {roombaStatus}
        </div>
        
        {/* Gamepad-style directional controls */}
        <div style={{ 
          display: "grid", 
          gridTemplateColumns: "1fr 1fr 1fr", 
          gap: "8px", 
          maxWidth: "200px",
          marginBottom: "1rem"
        }}>
          <div></div>
          <button
            onClick={() => driveRoomba(100, 0)}
            onMouseDown={() => driveRoomba(100, 0)}
            onMouseUp={stopRoomba}
            onMouseLeave={stopRoomba}
            disabled={!roombaConnected}
            style={{
              padding: "12px",
              fontSize: "16px",
              border: "2px solid #333",
              borderRadius: "8px",
              background: roombaConnected ? "#4CAF50" : "#ccc",
              color: "white",
              cursor: roombaConnected ? "pointer" : "not-allowed"
            }}
          >
            ↑
          </button>
          <div></div>
          
          <button
            onClick={() => driveRoomba(100, 1)}
            onMouseDown={() => driveRoomba(100, 1)}
            onMouseUp={stopRoomba}
            onMouseLeave={stopRoomba}
            disabled={!roombaConnected}
            style={{
              padding: "12px",
              fontSize: "16px",
              border: "2px solid #333",
              borderRadius: "8px",
              background: roombaConnected ? "#4CAF50" : "#ccc",
              color: "white",
              cursor: roombaConnected ? "pointer" : "not-allowed"
            }}
          >
            ←
          </button>
          
          <button
            onClick={stopRoomba}
            disabled={!roombaConnected}
            style={{
              padding: "12px",
              fontSize: "16px",
              border: "2px solid #333",
              borderRadius: "8px",
              background: roombaConnected ? "#f44336" : "#ccc",
              color: "white",
              cursor: roombaConnected ? "pointer" : "not-allowed"
            }}
          >
            STOP
          </button>
          
          <button
            onClick={() => driveRoomba(100, -1)}
            onMouseDown={() => driveRoomba(100, -1)}
            onMouseUp={stopRoomba}
            onMouseLeave={stopRoomba}
            disabled={!roombaConnected}
            style={{
              padding: "12px",
              fontSize: "16px",
              border: "2px solid #333",
              borderRadius: "8px",
              background: roombaConnected ? "#4CAF50" : "#ccc",
              color: "white",
              cursor: roombaConnected ? "pointer" : "not-allowed"
            }}
          >
            →
          </button>
          
          <div></div>
          <button
            onClick={() => driveRoomba(-100, 0)}
            onMouseDown={() => driveRoomba(-100, 0)}
            onMouseUp={stopRoomba}
            onMouseLeave={stopRoomba}
            disabled={!roombaConnected}
            style={{
              padding: "12px",
              fontSize: "16px",
              border: "2px solid #333",
              borderRadius: "8px",
              background: roombaConnected ? "#4CAF50" : "#ccc",
              color: "white",
              cursor: roombaConnected ? "pointer" : "not-allowed"
            }}
          >
            ↓
          </button>
          <div></div>
        </div>

        {/* Additional command buttons */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            onClick={cleanRoomba}
            disabled={!roombaConnected}
            style={{
              padding: "8px 16px",
              fontSize: "14px",
              border: "2px solid #333",
              borderRadius: "6px",
              background: roombaConnected ? "#2196F3" : "#ccc",
              color: "white",
              cursor: roombaConnected ? "pointer" : "not-allowed"
            }}
          >
            🧹 Clean
          </button>
          
          <button
            onClick={dockRoomba}
            disabled={!roombaConnected}
            style={{
              padding: "8px 16px",
              fontSize: "14px",
              border: "2px solid #333",
              borderRadius: "6px",
              background: roombaConnected ? "#FF9800" : "#ccc",
              color: "white",
              cursor: roombaConnected ? "pointer" : "not-allowed"
            }}
          >
            🏠 Dock
          </button>
        </div>
      </section>

      <section style={{ marginTop: "1.5rem" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Live Video with Roomba Controls</h2>
        <div
          style={{
            position: "relative",
            width: 640,
            maxWidth: "100%",
            aspectRatio: "4 / 3",
            border: "2px solid #222",
            borderRadius: 6,
            background: "#000",
            overflow: "hidden",
          }}
        >
          {imgSrc ? (
            <img src={imgSrc} alt="DepthAI" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          ) : (
            <div style={{ color: "#aaa", padding: "1rem" }}>Waiting for frames...</div>
          )}
          
          {/* Roomba Controls Overlay */}
          <div
            style={{
              position: "absolute",
              top: "10px",
              right: "10px",
              background: "rgba(0, 0, 0, 0.7)",
              padding: "10px",
              borderRadius: "8px",
              color: "white",
              fontSize: "12px",
            }}
          >
            <div style={{ marginBottom: "8px", fontWeight: "bold" }}>Roomba Control</div>
            <div style={{ marginBottom: "4px" }}>Status: {roombaStatus}</div>
            
            {/* Mini directional controls */}
            <div style={{ 
              display: "grid", 
              gridTemplateColumns: "1fr 1fr 1fr", 
              gap: "4px", 
              width: "120px",
              marginTop: "8px"
            }}>
              <div></div>
              <button
                onClick={() => driveRoomba(100, 0)}
                onMouseDown={() => driveRoomba(100, 0)}
                onMouseUp={stopRoomba}
                onMouseLeave={stopRoomba}
                disabled={!roombaConnected}
                style={{
                  padding: "6px",
                  fontSize: "12px",
                  border: "1px solid #333",
                  borderRadius: "4px",
                  background: roombaConnected ? "#4CAF50" : "#ccc",
                  color: "white",
                  cursor: roombaConnected ? "pointer" : "not-allowed"
                }}
              >
                ↑
              </button>
              <div></div>
              
              <button
                onClick={() => driveRoomba(100, 1)}
                onMouseDown={() => driveRoomba(100, 1)}
                onMouseUp={stopRoomba}
                onMouseLeave={stopRoomba}
                disabled={!roombaConnected}
                style={{
                  padding: "6px",
                  fontSize: "12px",
                  border: "1px solid #333",
                  borderRadius: "4px",
                  background: roombaConnected ? "#4CAF50" : "#ccc",
                  color: "white",
                  cursor: roombaConnected ? "pointer" : "not-allowed"
                }}
              >
                ←
              </button>
              
              <button
                onClick={stopRoomba}
                disabled={!roombaConnected}
                style={{
                  padding: "6px",
                  fontSize: "10px",
                  border: "1px solid #333",
                  borderRadius: "4px",
                  background: roombaConnected ? "#f44336" : "#ccc",
                  color: "white",
                  cursor: roombaConnected ? "pointer" : "not-allowed"
                }}
              >
                STOP
              </button>
              
              <button
                onClick={() => driveRoomba(100, -1)}
                onMouseDown={() => driveRoomba(100, -1)}
                onMouseUp={stopRoomba}
                onMouseLeave={stopRoomba}
                disabled={!roombaConnected}
                style={{
                  padding: "6px",
                  fontSize: "12px",
                  border: "1px solid #333",
                  borderRadius: "4px",
                  background: roombaConnected ? "#4CAF50" : "#ccc",
                  color: "white",
                  cursor: roombaConnected ? "pointer" : "not-allowed"
                }}
              >
                →
              </button>
              
              <div></div>
              <button
                onClick={() => driveRoomba(-100, 0)}
                onMouseDown={() => driveRoomba(-100, 0)}
                onMouseUp={stopRoomba}
                onMouseLeave={stopRoomba}
                disabled={!roombaConnected}
                style={{
                  padding: "6px",
                  fontSize: "12px",
                  border: "1px solid #333",
                  borderRadius: "4px",
                  background: roombaConnected ? "#4CAF50" : "#ccc",
                  color: "white",
                  cursor: roombaConnected ? "pointer" : "not-allowed"
                }}
              >
                ↓
              </button>
              <div></div>
            </div>

            {/* Mini command buttons */}
            <div style={{ display: "flex", gap: "4px", marginTop: "8px" }}>
              <button
                onClick={cleanRoomba}
                disabled={!roombaConnected}
                style={{
                  padding: "4px 8px",
                  fontSize: "10px",
                  border: "1px solid #333",
                  borderRadius: "4px",
                  background: roombaConnected ? "#2196F3" : "#ccc",
                  color: "white",
                  cursor: roombaConnected ? "pointer" : "not-allowed"
                }}
              >
                🧹
              </button>
              
              <button
                onClick={dockRoomba}
                disabled={!roombaConnected}
                style={{
                  padding: "4px 8px",
                  fontSize: "10px",
                  border: "1px solid #333",
                  borderRadius: "4px",
                  background: roombaConnected ? "#FF9800" : "#ccc",
                  color: "white",
                  cursor: roombaConnected ? "pointer" : "not-allowed"
                }}
              >
                🏠
              </button>
            </div>
          </div>
        </div>
      </section>

      <p style={{ fontSize: 12, color: "#666", marginTop: "1rem" }}>
        Using host: {HOST}. Override with VITE_PI_HOST.
      </p>
    </div>
  );
}
