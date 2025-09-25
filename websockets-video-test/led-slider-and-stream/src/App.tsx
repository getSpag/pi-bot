import React, { useEffect, useRef, useState } from "react";



const HOST = (import.meta as any).env?.VITE_PI_HOST || window.location.hostname || "192.168.2.252";
const LED_URL = `ws://${HOST}:5000/led_control`;
const VIDEO_URL = `ws://${HOST}:5001/video_feed`;

export default function App() {
  const [brightness, setBrightness] = useState(50);
  const [ledConnected, setLedConnected] = useState(false);
  const [videoConnected, setVideoConnected] = useState(false);
  const [imgSrc, setImgSrc] = useState<string | null>(null);

  const ledWS = useRef<WebSocket | null>(null);
  const videoWS = useRef<WebSocket | null>(null);
  const lastBlobUrl = useRef<string | null>(null);
  const reconnectTimers = useRef<{ led?: any; video?: any }>({});

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

  const onBrightnessChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    setBrightness(value);
    if (ledWS.current && ledWS.current.readyState === WebSocket.OPEN) {
      ledWS.current.send(value.toString());
    }
  };

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: "1.5rem", maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ marginBottom: "0.5rem" }}>LED + DepthAI Video</h1>
      <p style={{ color: "#555", marginTop: 0 }}>
        LED: {ledConnected ? "Connected" : "Disconnected"} · Video: {videoConnected ? "Connected" : "Disconnected"}
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
        <h2 style={{ fontSize: "1.1rem" }}>Live Video</h2>
        <div
          style={{
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
        </div>
      </section>

      <p style={{ fontSize: 12, color: "#666", marginTop: "1rem" }}>
        Using host: {HOST}. Override with VITE_PI_HOST.
      </p>
    </div>
  );
}
