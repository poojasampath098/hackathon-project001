import { useState, useEffect, useRef, useCallback } from "react";
import { X, Mic, Send, Plus, FileText, Image, Camera, Upload, Loader, Paperclip } from "lucide-react";
import { aiApi } from "../services/ai.api";
import { artifactApi } from "../services/artifact.api";
import fiscaRobot from "../assets/fisca-robot-full.png";

const MENU_ITEMS = [
  { label: "Upload Files", icon: FileText, accept: "*/*" },
  { label: "Photos", icon: Image, accept: "image/*" },
  { label: "Screenshot", icon: Camera, accept: null },
];

const VOICE_THREAD_ID = "fisca";

export default function VoiceChatOverlay({ onClose }) {
  const [input, setInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [messages, setMessages] = useState([]);
  const [hasSent, setHasSent] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const chatEndRef = useRef(null);
  const menuRef = useRef(null);
  const fileInputRef = useRef(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingMimeRef = useRef(null);
  const voiceIdRef = useRef(0);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const rafRef = useRef(null);
  const waveformRef = useRef(null);
  const WAVEFORM_BARS = 7;

  const chooseRecordingMime = () => {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
      "audio/ogg",
      "",
    ];
    const found = candidates.find((c) => !c || (window.MediaRecorder && window.MediaRecorder.isTypeSupported(c)));
    return found !== undefined ? found : "";
  };

  const stopMediaStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  };

  const startWaveform = (stream) => {
    stopWaveform();
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.75;
      source.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;

      const data = new Uint8Array(analyser.frequencyBinCount);
      const bars = waveformRef.current;

      const draw = () => {
        analyser.getByteFrequencyData(data);
        if (bars) {
          const nodeCount = bars.children.length || WAVEFORM_BARS;
          for (let i = 0; i < nodeCount; i++) {
            const bar = bars.children[i];
            if (!bar) continue;
            const bin = Math.floor((i / nodeCount) * data.length);
            const value = data[bin] || 0;
            const height = Math.max(4, Math.round((value / 255) * 20));
            bar.style.height = `${height}px`;
          }
        }
        rafRef.current = requestAnimationFrame(draw);
      };
      rafRef.current = requestAnimationFrame(draw);
    } catch {
      audioCtxRef.current = null;
    }
  };

  const stopWaveform = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch {
        // ignore
      }
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
  };

  const appendMessage = (msg) => {
    setMessages((prev) => [...prev, { id: Date.now() + Math.random(), ...msg }]);
  };

  const showGreeting = !hasSent;

  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    return () => {
      stopWaveform();
      stopMediaStream();
    };
  }, []);

  useEffect(() => {
    if (!showMenu) return;
    const handleClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false);
      }
    };
    const handleKey = (e) => {
      if (e.key === "Escape") setShowMenu(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [showMenu]);

  useEffect(() => {
    let cancelled = false;
    aiApi
      .history(VOICE_THREAD_ID)
      .then((res) => {
        if (cancelled) return;
        const persisted = Array.isArray(res?.data?.messages) ? res.data.messages : [];
        if (persisted.length === 0) return;
        setMessages(
          persisted.map((m) => {
            const isFile = m.messageType === "file" || m.messageType === "composed";
            const atts = Array.isArray(m.attachments) ? m.attachments : [];
            const first = atts[0] || null;
            return {
              id: m.id || Date.now() + Math.random(),
              role: m.role === "agent" ? "fisca" : "user",
              type: m.messageType === "composed" ? "composed" : isFile ? "file" : "text",
              text: m.content || first?.name || (isFile ? "File" : ""),
              fileNames: atts.map((a) => a.name || "file"),
              artifact: first
                ? { content: { mimetype: first.mimetype || "", secureUrl: first.secureUrl || null } }
                : null,
            };
          })
        );
        setHasSent(true);
      })
      .catch(() => {
        // History is best-effort; start with an empty conversation.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    const pendingFiles = selectedFiles.filter((f) => f && f.size > 0);
    if ((!text && pendingFiles.length === 0) || isSending) return;

    const userMsgId = Date.now();
    setHasSent(true);
    setIsSending(true);
    setMessages((prev) => [
      ...prev,
      {
        id: userMsgId,
        role: "user",
        type: pendingFiles.length ? "composed" : "text",
        text,
        fileNames: pendingFiles.map((f) => f.name),
      },
    ]);
    setInput("");
    setSelectedFiles([]);

    try {
      const attachmentIds = [];
      if (pendingFiles.length > 0) {
        for (const file of pendingFiles) {
          const res = await artifactApi.upload(file);
          const artifact = res?.data?.artifact;
          if (artifact?.id) {
            attachmentIds.push(artifact.id);
            setMessages((prev) => [
              ...prev,
              {
                id: userMsgId + 1,
                role: "user",
                type: "file",
                text: artifact.name || file.name,
                artifact,
              },
            ]);
          }
        }
      }
      const res = await aiApi.chat(text, attachmentIds, VOICE_THREAD_ID);
      const reply = res?.data?.response || "I couldn't find an answer.";
      setMessages((prev) => [
        ...prev,
        { id: userMsgId + 2, role: "fisca", text: reply },
      ]);
    } catch (err) {
      const isNetwork = typeof err?.status !== "number";
      setMessages((prev) => [
        ...prev,
        {
          id: userMsgId + 2,
          role: "error",
          text: isNetwork
            ? "Network error — could not reach the AI service. Please try again."
            : err?.message || "The AI service rejected the request. Please try again.",
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }, [input, selectedFiles, isSending]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleMenuAction = (item) => {
    setShowMenu(false);
    if (fileInputRef.current) {
      if (item.accept) fileInputRef.current.accept = item.accept;
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const handleFileInputChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const oversized = files.filter((f) => f.size > 5 * 1024 * 1024);
    if (oversized.length > 0) {
      appendMessage({ role: "error", type: "error", text: "Each file must be 5MB or smaller" });
      e.target.value = "";
      return;
    }
    e.target.value = "";
    if (input.trim().length === 0) {
      void sendFilesImmediately(files);
    } else {
      setSelectedFiles((prev) => [...prev, ...files]);
    }
  };

  const sendFilesImmediately = async (files) => {
    if (files.length === 0 || isSending) return;
    const userMsgId = Date.now();
    setHasSent(true);
    setIsSending(true);
    try {
      const attachmentIds = [];
      for (const file of files) {
        const res = await artifactApi.upload(file);
        const artifact = res?.data?.artifact;
        if (artifact?.id) {
          attachmentIds.push(artifact.id);
          setMessages((prev) => [
            ...prev,
            {
              id: userMsgId + 1,
              role: "user",
              type: "file",
              text: artifact.name || file.name,
              artifact,
            },
          ]);
        }
      }
      if (attachmentIds.length === 0) {
        appendMessage({ id: userMsgId + 1, role: "error", type: "error", text: "No files could be uploaded" });
        return;
      }
      const res = await aiApi.chat("", attachmentIds, VOICE_THREAD_ID);
      const reply = res?.data?.response || "Uploaded as artifact.";
      setMessages((prev) => [
        ...prev,
        { id: userMsgId + 2, role: "fisca", text: reply },
      ]);
    } catch (err) {
      const isNetwork = typeof err?.status !== "number";
      setMessages((prev) => [
        ...prev,
        {
          id: userMsgId + 2,
          role: "error",
          type: "error",
          text: isNetwork
            ? "Network error — could not reach the AI service. Please try again."
            : err?.message || "File upload failed",
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const removeSelectedFile = (index) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUploadFiles = async () => {
    if (selectedFiles.length === 0) return;
    setUploadingFiles(true);
    try {
      for (const file of selectedFiles) {
        const res = await artifactApi.upload(file);
        appendMessage({
          role: "user",
          type: "file",
          text: file.name,
          artifact: res?.data?.artifact || null,
        });
      }
      setSelectedFiles([]);
    } catch (err) {
      appendMessage({
        role: "error",
        type: "error",
        text: err.message || "File upload failed",
      });
    } finally {
      setUploadingFiles(false);
    }
  };

  const handleRecordingStop = async () => {
    const chunks = audioChunksRef.current;
    const mime = recordingMimeRef.current;
    let blob;
    try {
      blob = new Blob(chunks, { type: mime || "audio/webm" });
    } catch {
      blob = new Blob(chunks);
    }
    cleanupRecording();

    if (!blob || blob.size === 0) {
      appendMessage({ role: "error", type: "error", text: "Recording was empty" });
      return;
    }

    const ext = mime.includes("mp4")
      ? "m4a"
      : mime.includes("ogg")
      ? "ogg"
      : "webm";
    const file = new File([blob], `voice-message-${voiceIdRef.current++}.${ext}`, {
      type: blob.type || "audio/webm",
    });

    try {
      const res = await artifactApi.upload(file);
      appendMessage({
        role: "user",
        type: "audio",
        text: file.name,
        url: URL.createObjectURL(blob),
        artifact: res?.data?.artifact || null,
      });
      setHasSent(true);
    } catch (err) {
      appendMessage({
        role: "error",
        type: "error",
        text: err.message || "Voice message upload failed",
      });
    }
  };

  const cleanupRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    recordingMimeRef.current = null;
    stopWaveform();
    stopMediaStream();
    setIsListening(false);
  };

  const toggleListening = async () => {
    if (isListening) {
      setIsListening(false);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      return;
    }

    if (!window.MediaRecorder) {
      appendMessage({
        role: "error",
        type: "error",
        text: "Voice recording is not supported in this browser",
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = chooseRecordingMime();
      recordingMimeRef.current = mime;
      audioChunksRef.current = [];

      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      recorder.onstop = handleRecordingStop;
      recorder.onerror = () => {
        appendMessage({ role: "error", type: "error", text: "Recording failed" });
        cleanupRecording();
      };
      mediaRecorderRef.current = recorder;
      try {
        recorder.start();
      } catch {
        appendMessage({ role: "error", type: "error", text: "Could not start recording" });
        cleanupRecording();
        return;
      }
      startWaveform(stream);
      setIsListening(true);
    } catch {
      // Microphone permission denied or audio device unavailable.
      appendMessage({
        role: "error",
        type: "error",
        text: "Microphone access denied or unavailable",
      });
      cleanupRecording();
    }
  };

  return (
    <div
      data-testid="voice-chat-overlay"
      className="fixed inset-0 flex flex-col items-center justify-between"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 99999,
        background:
          "linear-gradient(160deg, #f5f3ff 0%, #ede9fe 30%, #e0d4fc 60%, #ddd6fe 100%)",
      }}
    >
      <style>{`
        @keyframes fiscaFloat {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-8px) rotate(1.5deg); }
        }
        @keyframes pulseRing {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes listenGlow {
          0%, 100% { filter: drop-shadow(0 0 8px rgba(139,92,246,0.3)); }
          50% { filter: drop-shadow(0 0 20px rgba(139,92,246,0.7)); }
        }
        .fisca-greeting-img {
          width: 160px;
          height: auto;
          object-fit: contain;
          background: transparent;
          mix-blend-mode: multiply;
        }
        .fisca-chat-avatar {
          width: 48px;
          height: 48px;
          object-fit: contain;
          background: transparent;
          mix-blend-mode: multiply;
        }
        @media (max-width: 480px) {
          .fisca-greeting-img {
            width: 120px;
          }
          .fisca-chat-avatar {
            width: 36px;
            height: 36px;
          }
        }
      `}</style>

      {/* Close button */}
      <button
        onClick={onClose}
        aria-label="Close"
        style={{
          position: "absolute",
          top: 20,
          right: 20,
          width: 40,
          height: 40,
          borderRadius: "50%",
          background: "rgba(109,40,217,0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "none",
          cursor: "pointer",
          zIndex: 10,
        }}
      >
        <X style={{ width: 20, height: 20, color: "#6d28d9" }} />
      </button>

      {/* Center content */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: showGreeting ? "center" : "flex-end",
          gap: 16,
          padding: showGreeting ? "0 24px" : "0 24px 12px",
          width: "100%",
          maxWidth: 560,
          overflowY: "auto",
        }}
      >
        {/* Greeting (shown until first message) */}
        {showGreeting && (
          <>
            <img
              src={fiscaRobot}
              alt="Fisca robot mascot"
              className="fisca-greeting-img"
              style={{
                animation: isListening
                  ? "listenGlow 2s ease-in-out infinite, fiscaFloat 3.5s ease-in-out infinite"
                  : "fiscaFloat 3.5s ease-in-out infinite",
              }}
            />
            <h1
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: "#4c1d95",
                marginTop: 16,
                fontFamily: "system-ui, sans-serif",
              }}
            >
              Hi, I'm Fisca
            </h1>
            <p
              style={{
                fontSize: 15,
                color: "#7c3aed",
                fontFamily: "system-ui, sans-serif",
              }}
            >
              How can I help you today?
            </p>
          </>
        )}

        {/* Chat messages */}
        {hasSent && (
          <div
            style={{
              width: "100%",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              paddingBottom: 8,
            }}
          >
            {/* Small robot avatar at top when in chat mode */}
            {!showGreeting && (
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
                <img
                  src={fiscaRobot}
                  alt="Fisca"
                  className="fisca-chat-avatar"
                  style={{
                    animation: isListening
                      ? "listenGlow 2s ease-in-out infinite"
                      : undefined,
                  }}
                />
              </div>
            )}
            {messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  display: "flex",
                  justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                }}
              >
                <div
                  style={{
                    maxWidth: "80%",
                    padding: "10px 14px",
                    borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                    background:
                      msg.role === "user"
                        ? "linear-gradient(135deg, #7c3aed, #6d28d9)"
                        : msg.role === "error"
                        ? "rgba(254,226,226,0.9)"
                        : "rgba(255,255,255,0.85)",
                    color: msg.role === "user" ? "#fff" : msg.role === "error" ? "#b91c1c" : "#4c1d95",
                    fontSize: 14,
                    lineHeight: 1.5,
                    fontFamily: "system-ui, sans-serif",
                    backdropFilter: msg.role === "fisca" ? "blur(8px)" : undefined,
                    border:
                      msg.role === "fisca"
                        ? "1px solid rgba(139,92,246,0.15)"
                        : msg.role === "error"
                        ? "1px solid rgba(220,38,38,0.25)"
                        : undefined,
                  }}
                >
                  {msg.type === "composed" ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {(msg.fileNames || []).map((name, i) => (
                        <div
                          key={i}
                          style={{ display: "flex", alignItems: "center", gap: 8, color: "#fff" }}
                        >
                          <Paperclip style={{ width: 16, height: 16 }} />
                          <span>{name}</span>
                        </div>
                      ))}
                      {msg.text ? <span style={{ color: "#fff" }}>{msg.text}</span> : null}
                    </div>
                  ) : msg.type === "file" ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        color: "#fff",
                      }}
                    >
                      <Paperclip style={{ width: 16, height: 16 }} />
                      <span>{msg.text}</span>
                    </div>
                  ) : msg.type === "audio" && msg.url ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          color: "#fff",
                        }}
                      >
                        <Mic style={{ width: 16, height: 16 }} />
                        <span>Voice message</span>
                      </div>
                      <audio controls src={msg.url} style={{ width: 220, height: 36 }} />
                    </div>
                  ) : (
                    msg.text
                  )}
                </div>
              </div>
            ))}
            {isSending && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div
                  style={{
                    maxWidth: "80%",
                    padding: "10px 14px",
                    borderRadius: "16px 16px 16px 4px",
                    background: "rgba(255,255,255,0.85)",
                    color: "#4c1d95",
                    fontSize: 14,
                    lineHeight: 1.5,
                    fontFamily: "system-ui, sans-serif",
                    backdropFilter: "blur(8px)",
                    border: "1px solid rgba(139,92,246,0.15)",
                  }}
                >
                  Thinking...
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        )}
      </div>

      {/* Bottom input area */}
      <div style={{ width: "100%", maxWidth: 560, padding: "0 24px 40px 24px" }}>
        {/* Listening indicator */}
        {isListening && (
          <div
            style={{
              textAlign: "center",
              fontSize: 13,
              color: "#7c3aed",
              fontFamily: "system-ui, sans-serif",
              fontWeight: 500,
              marginBottom: 10,
              letterSpacing: "0.02em",
            }}
          >
            Listening...
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileInputChange}
          style={{ display: "none" }}
        />

        {/* Queued files + Upload */}
        {selectedFiles.length > 0 && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              marginBottom: 10,
            }}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              {selectedFiles.map((f, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    background: "rgba(139,92,246,0.1)",
                    border: "1px solid rgba(139,92,246,0.25)",
                    borderRadius: 8,
                    padding: "6px 10px",
                    color: "#6d28d9",
                    fontSize: 13,
                    fontFamily: "system-ui, sans-serif",
                  }}
                >
                  <Paperclip style={{ width: 14, height: 14 }} />
                  <span>{f.name}</span>
                  <button
                    onClick={() => removeSelectedFile(i)}
                    aria-label="Remove file"
                    style={{
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      color: "#6d28d9",
                      display: "flex",
                      padding: 0,
                    }}
                  >
                    <X style={{ width: 14, height: 14 }} />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={handleUploadFiles}
              disabled={uploadingFiles}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 16px",
                width: "fit-content",
                borderRadius: 9999,
                border: "none",
                cursor: "pointer",
                background: "linear-gradient(135deg, #7c3aed, #6d28d9)",
                color: "#fff",
                fontSize: 13,
                fontFamily: "system-ui, sans-serif",
                opacity: uploadingFiles ? 0.7 : 1,
              }}
            >
              {uploadingFiles ? (
                <Loader className="animate-spin" style={{ width: 16, height: 16, color: "#fff" }} />
              ) : (
                <Upload style={{ width: 16, height: 16, color: "#fff" }} />
              )}
              {uploadingFiles
                ? "Uploading..."
                : `Upload ${selectedFiles.length === 1 ? "File" : "Files"}`}
            </button>
          </div>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            borderRadius: 9999,
            padding: "12px 16px",
            background: "rgba(255,255,255,0.6)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid rgba(139,92,246,0.2)",
            boxShadow: "0 4px 24px rgba(109,40,217,0.12), inset 0 1px 0 rgba(255,255,255,0.8)",
          }}
        >
          {/* Plus / attachment button */}
          <div ref={menuRef} style={{ position: "relative" }}>
            <button
              onClick={() => setShowMenu((v) => !v)}
              aria-label="Attach"
              style={{
                padding: 8,
                borderRadius: "50%",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Plus style={{ width: 18, height: 18, color: "#7c3aed" }} />
            </button>
            {showMenu && (
              <div
                style={{
                  position: "absolute",
                  bottom: "100%",
                  left: "50%",
                  transform: "translateX(-50%)",
                  marginBottom: 8,
                  background: "rgba(255,255,255,0.95)",
                  backdropFilter: "blur(16px)",
                  WebkitBackdropFilter: "blur(16px)",
                  borderRadius: 12,
                  border: "1px solid rgba(139,92,246,0.15)",
                  boxShadow: "0 8px 32px rgba(109,40,217,0.18)",
                  padding: "6px 0",
                  minWidth: 180,
                  zIndex: 20,
                }}
              >
                {MENU_ITEMS.map((item) => (
                  <button
                    key={item.label}
                    onClick={() => handleMenuAction(item)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      padding: "10px 16px",
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      fontSize: 13,
                      color: "#4c1d95",
                      fontFamily: "system-ui, sans-serif",
                      textAlign: "left",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(139,92,246,0.08)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <item.icon style={{ width: 16, height: 16, color: "#7c3aed" }} />
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Text input */}
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask me anything?"
            style={{
              flex: 1,
              fontSize: 14,
              background: "transparent",
              border: "none",
              outline: "none",
              color: "#4c1d95",
              fontFamily: "system-ui, sans-serif",
            }}
          />

          {/* Mic button with pulsing rings */}
          <button
            onClick={toggleListening}
            aria-label={isListening ? "Stop listening" : "Start listening"}
            style={{
              position: "relative",
              padding: 8,
              borderRadius: "50%",
              background: isListening ? "rgba(139,92,246,0.15)" : "transparent",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {isListening && (
              <>
                <span
                  style={{
                    position: "absolute",
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    border: "2px solid rgba(139,92,246,0.4)",
                    animation: "pulseRing 1.5s ease-out infinite",
                  }}
                />
                <span
                  style={{
                    position: "absolute",
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    border: "2px solid rgba(139,92,246,0.3)",
                    animation: "pulseRing 1.5s ease-out infinite 0.5s",
                  }}
                />
              </>
            )}
            {isListening ? (
              <div
                ref={waveformRef}
                aria-hidden="true"
                style={{
                  position: "relative",
                  zIndex: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                  padding: "0 2px",
                }}
              >
                {Array.from({ length: WAVEFORM_BARS }).map((_, i) => (
                  <span
                    key={i}
                    style={{
                      width: 3,
                      height: 8,
                      borderRadius: 999,
                      background: "#8b5cf6",
                      display: "inline-block",
                      verticalAlign: "bottom",
                      transition: "height 90ms ease-out",
                    }}
                  />
                ))}
              </div>
            ) : (
              <Mic style={{ width: 18, height: 18, color: "#7c3aed" }} />
            )}
          </button>

          {/* Send button */}
          <button
            onClick={sendMessage}
            aria-label="Send message"
            style={{
              padding: 8,
              borderRadius: "50%",
              background: input.trim() || selectedFiles.length > 0 ? "#8b5cf6" : "rgba(139,92,246,0.2)",
              border: "none",
              cursor: input.trim() || selectedFiles.length > 0 ? "pointer" : "default",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 0.15s",
            }}
          >
            <Send
              style={{
                width: 18,
                height: 18,
                color: input.trim() || selectedFiles.length > 0 ? "#fff" : "#a78bfa",
              }}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
