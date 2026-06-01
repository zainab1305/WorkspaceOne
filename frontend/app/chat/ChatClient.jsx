"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { socket } from "@/lib/socket";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { buildVoiceNotePlaybackUrl } from "@/lib/messageMedia";

function IconMic() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.93V21h2v-3.07A7 7 0 0 0 19 11h-2Z" fill="currentColor" />
    </svg>
  );
}

function IconStopSquare() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M6 6h12v12H6z" fill="currentColor" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 6h2v8h-2V9Zm4 0h2v8h-2V9ZM7 9h2v8H7V9Zm-1 12h12a2 2 0 0 0 2-2V7H4v12a2 2 0 0 0 2 2Z" fill="currentColor" />
    </svg>
  );
}

function IconSend() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path d="M3 20v-6l11-2L3 10V4l18 8-18 8Z" fill="currentColor" />
    </svg>
  );
}

function formatDurationLabel(totalSeconds) {
  const safeSeconds = Math.max(0, Math.round(Number(totalSeconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function getSupportedVoiceMimeType() {
  if (typeof window === "undefined" || !window.MediaRecorder) {
    return "audio/webm";
  }

  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
    "audio/mp4",
  ];

  return candidates.find((candidate) => window.MediaRecorder.isTypeSupported(candidate)) || "audio/webm";
}

function VoiceNotePlayer({ src, durationSeconds = 0, isMe = false }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioSrc = typeof src === "string" ? src.trim() : "";
  const hasAudioSrc = Boolean(audioSrc);

  useEffect(() => {
    if (!hasAudioSrc) {
      const resetId = window.requestAnimationFrame(() => {
        setIsPlaying(false);
        setProgress(0);
      });

      return () => window.cancelAnimationFrame(resetId);
    }

    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }

    const resetId = window.requestAnimationFrame(() => {
      setIsPlaying(false);
      setProgress(0);
    });

    return () => window.cancelAnimationFrame(resetId);
  }, [hasAudioSrc, audioSrc]);

  useEffect(() => {
    if (!hasAudioSrc) return undefined;

    const audio = audioRef.current;
    if (!audio) return undefined;

    const updateProgress = () => {
      if (!audio.duration || Number.isNaN(audio.duration) || audio.duration <= 0) {
        setProgress(0);
        return;
      }

      setProgress(Math.min(100, Math.max(0, (audio.currentTime / audio.duration) * 100)));
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => {
      setIsPlaying(false);
      setProgress(100);
    };

    audio.addEventListener("timeupdate", updateProgress);
    audio.addEventListener("loadedmetadata", updateProgress);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", updateProgress);
      audio.removeEventListener("loadedmetadata", updateProgress);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [hasAudioSrc, audioSrc]);

  const togglePlayback = async () => {
    if (!hasAudioSrc) return;

    const audio = audioRef.current;
    if (!audio) return;

    try {
      if (audio.paused) {
        await audio.play();
      } else {
        audio.pause();
      }
    } catch {
      setIsPlaying(false);
    }
  };

  const barHeights = [12, 18, 10, 22, 14, 24, 12, 20, 16, 26, 14, 19];
  const activeIndex = Math.round((progress / 100) * barHeights.length);

  return (
    <div className={`cc-audio-card ${isMe ? "cc-audio-card--me" : ""}`}>
      <button
        type="button"
        className="cc-audio-toggle"
        onClick={togglePlayback}
        disabled={!hasAudioSrc}
        aria-label={isPlaying ? "Pause voice message" : "Play voice message"}
      >
        {isPlaying ? (
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M7 5h4v14H7V5Zm6 0h4v14h-4V5Z" fill="currentColor" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M8 5v14l11-7-11-7Z" fill="currentColor" /></svg>
        )}
      </button>

      <div className="cc-audio-content">
        <div className="cc-audio-wave" aria-hidden="true">
          {barHeights.map((height, index) => (
            <span
              key={`${audioSrc || "voice-note"}-${index}`}
              className={`cc-audio-wave-bar ${index < activeIndex ? "is-active" : ""}`}
              style={{ height: `${height}px` }}
            />
          ))}
        </div>

        <div className="cc-audio-meta-row">
          <span className="cc-audio-label">Voice message</span>
          <span className="cc-audio-duration">{formatDurationLabel(durationSeconds)}</span>
        </div>

        <div className="cc-audio-progress" aria-hidden="true">
          <span className="cc-audio-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {hasAudioSrc ? <audio ref={audioRef} src={audioSrc} preload="metadata" /> : null}
    </div>
  );
}

export default function ChatClient({ roomId }) {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  // The active channel — read from URL query param
  const channelId = searchParams.get("channel") || "";

  const [message, setMessage] = useState("");
  const [announcementText, setAnnouncementText] = useState("");
  const [messages, setMessages] = useState([]);
  const [canManageMessages, setCanManageMessages] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [replyDraft, setReplyDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [sendError, setSendError] = useState("");
  const [announcementsOpen, setAnnouncementsOpen] = useState(false);
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [toast, setToast] = useState(null);
  const [channelName, setChannelName] = useState("");
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voiceDraft, setVoiceDraft] = useState(null);
  const endOfMessagesRef = useRef(null);
  const messageBoardRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordingStreamRef = useRef(null);
  const recordingChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const recordingStartRef = useRef(0);
  const voiceDraftUrlRef = useRef("");

  useEffect(() => {
    return () => {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;

      if (recordingStreamRef.current) {
        recordingStreamRef.current.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
      }

      if (voiceDraftUrlRef.current) {
        URL.revokeObjectURL(voiceDraftUrlRef.current);
        voiceDraftUrlRef.current = "";
      }
    };
  }, []);

  // Clear any pending toast timeout on unmount to prevent state updates after unmount
  useEffect(() => {
    return () => {
      window.clearTimeout(showToast.timeoutId);
      showToast.timeoutId = null;
    };
  }, []);

  function discardVoiceDraft() {
    if (voiceDraftUrlRef.current) {
      URL.revokeObjectURL(voiceDraftUrlRef.current);
      voiceDraftUrlRef.current = "";
    }

    setVoiceDraft(null);
    setRecordingSeconds(0);
  }

  function stopActiveRecording() {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }

  async function startVoiceRecording() {
    if (!session?.user || !channelId) return;

    setSendError("");

    if (voiceDraft) {
      discardVoiceDraft();
    }

    if (!navigator?.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setSendError("Voice recording is not supported in this browser");
      return;
    }

    let stream = null;

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedVoiceMimeType();
      const recorder = new MediaRecorder(stream, { mimeType });

      recordingChunksRef.current = [];
      recordingStartRef.current = Date.now();
      setRecordingSeconds(0);
      setIsRecordingVoice(true);

      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds(Math.max(1, Math.round((Date.now() - recordingStartRef.current) / 1000)));
      }, 250);

      recorder.ondataavailable = (event) => {
        if (event.data?.size) {
          recordingChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        window.clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;

        if (recordingStreamRef.current) {
          recordingStreamRef.current.getTracks().forEach((track) => track.stop());
          recordingStreamRef.current = null;
        }

        setIsRecordingVoice(false);

        const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || mimeType || "audio/webm" });
        recordingChunksRef.current = [];
        const duration = Math.max(1, Math.round((Date.now() - recordingStartRef.current) / 1000));
        recordingStartRef.current = 0;

        if (!blob.size) {
          setSendError("No audio was captured");
          return;
        }

        const objectUrl = URL.createObjectURL(blob);
        voiceDraftUrlRef.current = objectUrl;

        const draftMimeType = recorder.mimeType || mimeType || "audio/webm";
        const extension = draftMimeType.includes("ogg") ? "ogg" : draftMimeType.includes("mp4") ? "m4a" : draftMimeType.includes("mpeg") ? "mp3" : "webm";

        setVoiceDraft({
          blob,
          url: objectUrl,
          duration,
          mimeType: draftMimeType,
          fileName: `voice-note-${Date.now()}.${extension}`,
        });
      };

      mediaRecorderRef.current = recorder;
      recordingStreamRef.current = stream;
      recorder.start();
    } catch (err) {
      setIsRecordingVoice(false);
      setSendError(err.message || "Unable to access the microphone");

      // Ensure stream is always stopped, even if MediaRecorder creation failed
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      if (recordingStreamRef.current) {
        recordingStreamRef.current.getTracks().forEach((track) => track.stop());
        recordingStreamRef.current = null;
      }
    }
  }

  async function sendVoiceMessage() {
    if (!voiceDraft || !session?.user || !channelId) return;

    setSendError("");

    try {
      const audioFile = new File([voiceDraft.blob], voiceDraft.fileName, { type: voiceDraft.mimeType });
      const formData = new FormData();
      formData.append("audio", audioFile);
      formData.append("duration", String(voiceDraft.duration));
      formData.append("mimeType", voiceDraft.mimeType);
      formData.append("fileName", voiceDraft.fileName);

      const response = await fetch(`/api/rooms/${roomId}/channels/${channelId}/messages/voice`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to send voice message");
      }

      const sentMessage = {
        ...data.message,
        roomId,
        channelId,
        messageType: "audio",
        message: data.message.message || "Voice message",
      };

      socket.emit("sendMessage", sentMessage);
      upsertMessage(sentMessage);
      discardVoiceDraft();
      showToast("Voice message sent");
    } catch (err) {
      setSendError(err.message || "Failed to send voice message");
    }
  }

  function showToast(msg, type = "success") {
    setToast({ message: msg, type });
    window.clearTimeout(showToast.timeoutId);
    showToast.timeoutId = window.setTimeout(() => setToast(null), 2200);
  }

  const pinnedMessages = useMemo(() => {
    return [...messages]
      .filter((item) => item.isPinned)
      .sort((l, r) => {
        const lt = new Date(l.pinnedAt || l.createdAt || 0).getTime();
        const rt = new Date(r.pinnedAt || r.createdAt || 0).getTime();
        return rt - lt;
      });
  }, [messages]);

  const announcements = useMemo(() => {
    return [...messages]
      .filter((item) => item.type === "announcement")
      .sort((l, r) => new Date(r.createdAt || 0) - new Date(l.createdAt || 0));
  }, [messages]);

  const currentUserLabel = useMemo(
    () => session?.user?.name || session?.user?.email || "You",
    [session?.user?.name, session?.user?.email]
  );

  const upsertMessage = (incoming) => {
    if (!incoming?._id) return;
    setMessages((current) => {
      const idx = current.findIndex((item) => item._id === incoming._id);
      if (idx < 0) return [...current, incoming];
      const next = [...current];
      next[idx] = { ...next[idx], ...incoming };
      return next;
    });
  };

  const updatePinnedMessage = (incoming) => {
    if (!incoming?.message?._id) return;
    setMessages((current) => {
      const next = [...current];
      const index = next.findIndex((item) => item._id === incoming.message._id);
      if (index >= 0) next[index] = { ...next[index], ...incoming.message };
      return next;
    });
  };

  const removeMessageFromState = (messageId) => {
    setMessages((current) => current.filter((item) => item._id !== messageId));
  };

  /* ─── Load messages whenever channelId changes ─── */
  useEffect(() => {
    if (!channelId) {
      // Wait for LeftSidebar to auto-select a channel
      const resetLoadingId = window.requestAnimationFrame(() => setLoading(false));
      return () => window.cancelAnimationFrame(resetLoadingId);
    }

    let isMounted = true;

    async function loadData() {
      setLoading(true);
      setLoadError("");
      setMessages([]);

      try {
        const [messagesRes, membersRes, channelsRes] = await Promise.all([
          fetch(`/api/rooms/${roomId}/channels/${channelId}/messages`, { cache: "no-store" }),
          fetch(`/api/rooms/${roomId}/members`, { cache: "no-store" }),
          fetch(`/api/rooms/${roomId}/channels`, { cache: "no-store" }),
        ]);

        const messagesData = await messagesRes.json();
        const membersData = await membersRes.json();
        const channelsData = await channelsRes.json();

        if (!messagesRes.ok) throw new Error(messagesData.error || "Failed to fetch messages");
        if (!membersRes.ok) throw new Error(membersData.error || "Failed to fetch room info");

        if (isMounted) {
          setMessages(messagesData.messages || []);
          setCanManageMessages(Boolean(membersData.canManageMembers));
          const ch = (channelsData.channels || []).find((c) => c._id === channelId);
          if (ch) setChannelName(ch.name);
        }
      } catch (err) {
        if (isMounted) setLoadError(err.message || "Unable to load channel");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [roomId, channelId]);

  /* ─── Socket events ─── */
  useEffect(() => {
    if (!roomId || !session?.user) return;

    if (!socket.connected) socket.connect();

    const onReceiveMessage = (data) => {
      if (data?.roomId !== roomId) return;
      // Only show messages for the active channel
      if (channelId && data?.channelId && String(data.channelId) !== channelId) return;
      upsertMessage(data);
    };

    const onAnnouncementCreated = (data) => {
      if (data?.roomId !== roomId) return;
      upsertMessage(data);
    };

    const onMessagePinned = (data) => {
      if (data?.roomId !== roomId) return;
      updatePinnedMessage(data);
    };

    const onMessageDeleted = (data) => {
      if (data?.roomId !== roomId) return;
      removeMessageFromState(data.messageId);
    };

    socket.on("receiveMessage", onReceiveMessage);
    socket.on("announcementCreated", onAnnouncementCreated);
    socket.on("messagePinned", onMessagePinned);
    socket.on("messageDeleted", onMessageDeleted);

    socket.emit(
      "joinRoom",
      {
        roomId,
        user: {
          id: session.user.id || session.user.email,
          name: session.user.name,
          email: session.user.email,
        },
      },
      () => {}
    );

    return () => {
      socket.off("receiveMessage", onReceiveMessage);
      socket.off("announcementCreated", onAnnouncementCreated);
      socket.off("messagePinned", onMessagePinned);
      socket.off("messageDeleted", onMessageDeleted);
      socket.emit("leaveRoom", { roomId });
    };
  }, [roomId, channelId, session?.user]);

  /* ─── Auto-scroll ─── */
  useEffect(() => {
    if (!isNearBottom) return;
    endOfMessagesRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [isNearBottom, messages]);

  useEffect(() => {
    const board = messageBoardRef.current;
    if (!board) return undefined;
    const threshold = 84;
    const update = () => {
      const dist = board.scrollHeight - board.scrollTop - board.clientHeight;
      setIsNearBottom(dist <= threshold);
    };
    update();
    board.addEventListener("scroll", update, { passive: true });
    return () => board.removeEventListener("scroll", update);
  }, []);

  /* ─── Mark as seen ─── */
  const markRoomAsSeen = useCallback(async () => {
    if (!session?.user || !roomId) return;
    try {
      await fetch("/api/room/last-seen", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId }),
      });
    } catch {
      // best-effort
    }
  }, [roomId, session?.user]);

  useEffect(() => {
    if (!session?.user || loading) return;
    const timer = setTimeout(() => markRoomAsSeen(), 500);
    return () => clearTimeout(timer);
  }, [loading, messages.length, markRoomAsSeen, session?.user]);

  /* ─── Send message (channel-scoped) ─── */
  const sendMessage = async () => {
    if (!session || !message.trim() || !channelId) return;

    setSendError("");

    const replyPayload = replyDraft
      ? {
          messageId: replyDraft.messageId || null,
          userId: replyDraft.userId || null,
          senderName: replyDraft.senderName || "User",
          message: replyDraft.message || "",
        }
      : null;

    try {
      const response = await fetch(`/api/rooms/${roomId}/channels/${channelId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, replyTo: replyPayload }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to send message");

      const sentMessage = {
        _id: data.message._id,
        roomId,
        channelId,
        senderId: data.message.senderId,
        senderName: data.message.senderName,
        message: data.message.message,
        type: data.message.type,
        isPinned: data.message.isPinned,
        pinnedAt: data.message.pinnedAt,
        replyTo: {
          ...(data.message.replyTo || {}),
          userId: replyPayload?.userId || data.message.replyTo?.userId || null,
        },
        time: data.message.time,
      };

      socket.emit("sendMessage", sentMessage);
      upsertMessage(sentMessage);
      setMessage("");
      setReplyDraft(null);
      showToast("Message sent");
    } catch (err) {
      setSendError(err.message || "Failed to send message");
    }
  };

  /* ─── Post announcement ─── */
  const postAnnouncement = async () => {
    if (!canManageMessages || !announcementText.trim()) return;
    setSendError("");

    try {
      const response = await fetch("/api/announcement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, message: announcementText }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to post announcement");

      socket.emit("announcementCreated", {
        _id: data.message._id,
        roomId,
        channelId,
        senderName: data.message.senderName,
        message: data.message.message,
        type: data.message.type,
        isPinned: data.message.isPinned,
        pinnedAt: data.message.pinnedAt,
        time: data.message.time,
      });

      upsertMessage(data.message);
      setAnnouncementText("");
      setAnnouncementsOpen(false);
      showToast("Announcement posted");
    } catch (err) {
      setSendError(err.message || "Failed to post announcement");
    }
  };

  /* ─── Pin / delete / copy / reply ─── */
  const togglePin = async (messageId) => {
    if (!canManageMessages) return;
    setSendError("");
    try {
      const response = await fetch("/api/message/pin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, messageId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to update pin");

      socket.emit("messagePinned", { roomId, message: data.message });
      updatePinnedMessage({ roomId, message: data.message });
      setContextMenu(null);
      showToast(data.message?.isPinned ? "Message pinned" : "Message unpinned");
    } catch (err) {
      setSendError(err.message || "Failed to update pin");
    }
  };

  const deleteMessage = async (messageId) => {
    if (!canManageMessages) return;
    setSendError("");
    try {
      const response = await fetch(`/api/rooms/${roomId}/messages/${messageId}`, {
        method: "DELETE",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to delete message");

      socket.emit("messageDeleted", { roomId, messageId });
      removeMessageFromState(messageId);
      setContextMenu(null);
      showToast("Message deleted");
    } catch (err) {
      setSendError(err.message || "Failed to delete message");
    }
  };

  const scrollToMessage = (messageId) => {
    document.getElementById(`message-${messageId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const copyMessageText = async (text) => {
    try {
      await navigator.clipboard.writeText(text || "");
      setContextMenu(null);
      showToast("Message copied");
    } catch {
      setSendError("Failed to copy message");
    }
  };

  const replyToMessage = (msg) => {
    setReplyDraft({
      messageId: msg?._id || null,
      userId: msg?.senderId || null,
      senderName: msg?.senderName || "User",
      message: String(msg?.message || "").trim(),
    });
    setContextMenu(null);
  };

  const isVoiceMessage = (msg) => msg?.messageType === "audio" || Boolean(msg?.audioPath || msg?.audioUrl);

  const openContextMenu = (event, msg) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      messageId: msg._id,
      senderId: msg.senderId || null,
      senderName: msg.senderName,
      text: msg.message,
      isPinned: Boolean(msg.isPinned),
      x: event.clientX,
      y: event.clientY,
    });
  };

  /* ─────────────────── RENDER ─────────────────── */
  if (!channelId) {
    return (
      <div className="cc-empty-state">
        <div className="cc-empty-icon">💬</div>
        <p className="cc-empty-title">Select a room to start chatting</p>
        <p className="cc-empty-sub">Choose a room from the sidebar on the left</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="cc-loading">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={`cc-loading-bubble ${i % 2 === 0 ? "cc-loading-bubble--left" : "cc-loading-bubble--right"}`} />
        ))}
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="cc-error-state">
        <p className="cc-error-text">{loadError}</p>
        <button
          onClick={() => router.push("/dashboard")}
          className="cc-error-btn"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div
      className="cc-root"
      onClick={() => setContextMenu(null)}
      onContextMenuCapture={() => setContextMenu(null)}
    >
      {/* ── Channel header bar ── */}
      <div className="cc-channel-bar">
        <span className="cc-channel-hash">#</span>
        <span className="cc-channel-label">{channelName || "channel"}</span>

        {/* Announcement / Pinned toggles */}
        <div className="cc-channel-filters">
          {announcements.length > 0 && (
            <button
              onClick={() => setAnnouncementsOpen(!announcementsOpen)}
              className={`cc-filter-btn ${announcementsOpen ? "cc-filter-btn--active-announce" : ""}`}
            >
              📢 Announcements ({announcements.length})
            </button>
          )}
          {pinnedMessages.length > 0 && (
            <button
              onClick={() => setPinnedOpen(!pinnedOpen)}
              className={`cc-filter-btn ${pinnedOpen ? "cc-filter-btn--active-pin" : ""}`}
            >
              📌 Pinned ({pinnedMessages.length})
            </button>
          )}
          {pinnedMessages.length > 0 && (
            <button
              onClick={() => setPinnedOpen(!pinnedOpen)}
              className="cc-view-all-btn"
            >
              View all pinned ↓
            </button>
          )}
        </div>
      </div>

      {/* ── Announcements Panel ── */}
      {announcementsOpen && announcements.length > 0 && (
        <div className="cc-panel cc-panel--announce">
          <div className="cc-panel-header">
            <h3 className="cc-panel-title">Announcements</h3>
            <button onClick={() => setAnnouncementsOpen(false)} className="cc-panel-close" aria-label="Close">✕</button>
          </div>
          {canManageMessages && (
            <div className="cc-announce-compose">
              <textarea
                value={announcementText}
                onChange={(e) => setAnnouncementText(e.target.value)}
                placeholder="Post an announcement..."
                rows={2}
                className="cc-announce-textarea"
              />
              <button onClick={postAnnouncement} className="cc-announce-post">Post</button>
            </div>
          )}
          <div className="cc-announce-list">
            {announcements.slice(0, 5).map((item) => (
              <div key={item._id} className="cc-announce-item">
                <div className="cc-announce-meta">
                  <span className="cc-announce-sender">{item.senderName}</span>
                  <span className="cc-announce-time">{item.time}</span>
                </div>
                <p className="cc-announce-body">{item.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Pinned Panel ── */}
      {pinnedOpen && pinnedMessages.length > 0 && (
        <div className="cc-panel cc-panel--pin">
          <div className="cc-panel-header">
            <h3 className="cc-panel-title">Pinned Messages</h3>
            <button onClick={() => setPinnedOpen(false)} className="cc-panel-close" aria-label="Close">✕</button>
          </div>
          <div className="cc-pinned-list">
            {pinnedMessages.map((item) => (
              <button
                key={item._id}
                onClick={() => scrollToMessage(item._id)}
                className="cc-pinned-item"
              >
                <div className="cc-pinned-meta">
                  <span className="cc-pinned-sender">{item.senderName}</span>
                  <span className="cc-pinned-time">{item.time}</span>
                </div>
                <p className="cc-pinned-body">{item.message}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Messages Area ── */}
      <div
        ref={messageBoardRef}
        className="cc-messages"
      >
        {messages.length === 0 ? (
          <div className="cc-no-messages">
            <p>No messages yet in this room. Start the conversation! 💬</p>
          </div>
        ) : (
          messages.map((msg, i) => {
            const isMe = msg.senderName === currentUserLabel;
            const isAnnouncement = msg.type === "announcement";

            return (
              <div
                id={`message-${msg._id}`}
                key={`${msg._id || i}-${msg.time}`}
                className={`cc-msg ${isMe ? "cc-msg--me" : ""}`}
                onContextMenu={(event) => openContextMenu(event, msg)}
              >
                {/* Avatar */}
                <div className={`cc-msg-avatar ${isMe ? "cc-msg-avatar--me" : isAnnouncement ? "cc-msg-avatar--announce" : ""}`}>
                  {String(msg.senderName || "?").charAt(0).toUpperCase()}
                </div>

                {/* Bubble */}
                <div className={`cc-msg-bubble-wrap ${isMe ? "cc-msg-bubble-wrap--me" : ""}`}>
                  <div className="cc-msg-meta">
                    <span className="cc-msg-sender">{isMe ? "You" : msg.senderName}</span>
                    <span className="cc-msg-time">{msg.time}</span>
                    {msg.isPinned && <span className="cc-msg-pin-badge">📌</span>}
                  </div>

                  {/* Reply quote */}
                  {msg.replyTo?.senderName && msg.replyTo?.message && (
                    <div className={`cc-reply-quote ${isMe ? "cc-reply-quote--me" : ""}`}>
                      <p className="cc-reply-to">↳ {msg.replyTo.senderName}</p>
                      <p className="cc-reply-body">{msg.replyTo.message}</p>
                    </div>
                  )}

                  {/* Message bubble */}
                  <div className={`cc-bubble ${
                    isMe ? "cc-bubble--me" : isAnnouncement ? "cc-bubble--announce" : "cc-bubble--other"
                  } ${isVoiceMessage(msg) ? "cc-bubble--audio" : ""}`}>
                    {isVoiceMessage(msg) ? (
                      <VoiceNotePlayer
                        src={msg.audioUrl || buildVoiceNotePlaybackUrl({ roomId, messageId: msg._id, audioPath: msg.audioPath })}
                        durationSeconds={msg.audioDurationSeconds || 0}
                        isMe={isMe}
                      />
                    ) : (
                      <p className="cc-bubble-text">{msg.message}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={endOfMessagesRef} />
      </div>

      {/* ── Reply Draft Banner ── */}
      {replyDraft && (
        <div className="cc-reply-banner">
          <div className="cc-reply-info">
            <p className="cc-reply-label">Replying to {replyDraft.senderName}</p>
            <p className="cc-reply-preview">{replyDraft.message}</p>
          </div>
          <button onClick={() => setReplyDraft(null)} className="cc-reply-dismiss" aria-label="Cancel reply">✕</button>
        </div>
      )}

      {/* ── Input Area ── */}
      <div className="cc-input-area">
        {sendError && <div className="cc-send-error">{sendError}</div>}

        {isRecordingVoice ? (
          <div className="cc-voice-recorder" role="status" aria-live="polite">
            <div className="cc-voice-recorder-bars" aria-hidden="true">
              {Array.from({ length: 14 }).map((_, index) => (
                <span key={index} className="cc-voice-recorder-bar" style={{ animationDelay: `${index * 90}ms` }} />
              ))}
            </div>

            <div className="cc-voice-recorder-copy">
              <span className="cc-voice-recorder-title">Recording...</span>
              <span className="cc-voice-recorder-time">{formatDurationLabel(recordingSeconds)}</span>
            </div>

            <button type="button" className="cc-voice-stop" onClick={stopActiveRecording} aria-label="Stop recording">
              <IconStopSquare />
            </button>
          </div>
        ) : null}

        {voiceDraft ? (
          <div className="cc-voice-preview">
            <div className="cc-voice-preview-player">
              <VoiceNotePlayer src={voiceDraft.url} durationSeconds={voiceDraft.duration} isMe />
            </div>

            <div className="cc-voice-preview-actions">
              <button type="button" className="cc-voice-discard" onClick={discardVoiceDraft} aria-label="Discard voice note">
                <IconTrash />
                Discard
              </button>

              <button type="button" className="cc-voice-send" onClick={sendVoiceMessage} aria-label="Send voice message">
                <IconSend />
                Send
              </button>
            </div>
          </div>
        ) : null}

        <div className="cc-input-row">
          <button type="button" className="cc-input-action" aria-label="Record voice message" title="Voice message" onClick={isRecordingVoice ? stopActiveRecording : startVoiceRecording}>
            <IconMic />
          </button>

          {/* Emoji placeholder */}
          <button type="button" className="cc-input-action" aria-label="Emoji" title="Emoji">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" />
            </svg>
          </button>

          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Type a message... (Enter to send)"
            className="cc-input"
            aria-label="Message input"
          />

          {/* Attachment placeholder */}
          <button type="button" className="cc-input-action" aria-label="Attach file" title="Attach file">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z" />
            </svg>
          </button>

          {/* Image placeholder */}
          <button type="button" className="cc-input-action" aria-label="Send image" title="Image">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
            </svg>
          </button>

          <button
            onClick={sendMessage}
            className="cc-send-btn"
            disabled={!message.trim() || !channelId}
            aria-label="Send message"
          >
            Send
          </button>
        </div>
      </div>

      {/* ── Context Menu ── */}
      {contextMenu && (
        <div
          className="cc-context-menu"
          style={{
            left: `${Math.min(contextMenu.x, window.innerWidth - 180)}px`,
            top: `${Math.min(contextMenu.y, window.innerHeight - 200)}px`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => replyToMessage({
              _id: contextMenu.messageId,
              senderId: contextMenu.senderId,
              senderName: contextMenu.senderName,
              message: contextMenu.text,
            })}
            className="cc-ctx-item"
          >
            ↩ Reply
          </button>
          <button onClick={() => copyMessageText(contextMenu.text)} className="cc-ctx-item">
            ⧉ Copy
          </button>
          {canManageMessages && (
            <>
              <div className="cc-ctx-divider" />
              <button onClick={() => togglePin(contextMenu.messageId)} className="cc-ctx-item">
                📌 {contextMenu.isPinned ? "Unpin" : "Pin"}
              </button>
              <button onClick={() => deleteMessage(contextMenu.messageId)} className="cc-ctx-item cc-ctx-item--danger">
                🗑 Delete
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className={`cc-toast ${toast.type === "error" ? "cc-toast--error" : "cc-toast--success"}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
