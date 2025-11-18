import React, { useEffect, useRef, useState } from "react";



const HOST = (import.meta as any).env?.VITE_PI_HOST || window.location.hostname || "192.168.2.252";
const VIDEO_URL = `ws://${HOST}:5001/video_feed`;

export default function App() {
  const [videoConnected, setVideoConnected] = useState(false);
  const [imgSrc, setImgSrc] = useState<string | null>(null);

  const videoWS = useRef<WebSocket | null>(null);
  const lastBlobUrl = useRef<string | null>(null);
  const reconnectTimers = useRef<{ video?: any }>({});

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

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: "1.5rem", maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ marginBottom: "0.5rem" }}>Pi-Bot Control Panel</h1>
      <p style={{ color: "#555", marginTop: 0 }}>
        Video: {videoConnected ? "Connected" : "Disconnected"}
      </p>

      <section style={{ marginTop: "1.5rem" }}>
        <h2 style={{ fontSize: "1.1rem" }}>Live Video</h2>
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
        </div>
      </section>

      <p style={{ fontSize: 12, color: "#666", marginTop: "1rem" }}>
        Using host: {HOST}. Override with VITE_PI_HOST.
      </p>
    </div>
  );
}
