"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import NotificationBell from "@/components/NotificationBell";
import { useNotifications } from "@/providers/NotificationProvider";
import { socket } from "@/lib/socket";

function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M11 5h2v14h-2zM5 11h14v2H5z" fill="currentColor" />
    </svg>
  );
}

function IconJoin() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M13 5h6v6h-2V8.41l-6.29 6.3-1.42-1.42 6.3-6.29H13V5ZM5 7h5v2H7v8h8v-3h2v5H5V7Z" fill="currentColor" />
    </svg>
  );
}

function IconUpload() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M11 4h2v8h3l-4 4-4-4h3V4Zm-6 14h14v2H5v-2Z" fill="currentColor" />
    </svg>
  );
}

function IconTasks() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M9 5h11v2H9V5Zm0 6h11v2H9v-2Zm0 6h11v2H9v-2ZM4.7 6.3 3.3 4.9 1.9 6.3l2.8 2.8 4.8-4.8-1.4-1.4L4.7 6.3Zm0 6L3.3 10.9l-1.4 1.4 2.8 2.8 4.8-4.8-1.4-1.4-3.4 3.4Zm0 6-1.4-1.4-1.4 1.4 2.8 2.8 4.8-4.8-1.4-1.4-3.4 3.4Z" fill="currentColor" />
    </svg>
  );
}

function IconRoom() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M3 5h18v14H3V5Zm2 2v10h14V7H5Zm2 2h4v4H7V9Z" fill="currentColor" />
    </svg>
  );
}

function IconFile() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M6 3h8l4 4v14H6V3Zm2 2v14h8V8h-4V5H8Z" fill="currentColor" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path d="M12 2a10 10 0 1 0 10 10A10.01 10.01 0 0 0 12 2Zm1 11h5v-2h-3V6h-2v7Z" fill="currentColor" />
    </svg>
  );
}

export default function DashboardClient() {
  const ROOM_CODE_LENGTH = 6;
  const { data: session } = useSession();
  const { notifications } = useNotifications();
  const router = useRouter();
  const [toast, setToast] = useState(null);

  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createRoomName, setCreateRoomName] = useState("");
  const [joinRoomCode, setJoinRoomCode] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [unreadByRoom, setUnreadByRoom] = useState({});
  const [totalUnread, setTotalUnread] = useState(0);
  const [roomInsights, setRoomInsights] = useState({});
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [modalOpen, setModalOpen] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [uploadRoomId, setUploadRoomId] = useState("");
  const [uploadType, setUploadType] = useState("link");
  const [uploadUrl, setUploadUrl] = useState("");
  const [uploadName, setUploadName] = useState("");
  const [uploadFile, setUploadFile] = useState(null);
  const profileMenuRef = useRef(null);

  function showToast(message, type = "success") {
    setToast({ message, type });
    window.clearTimeout(showToast.timeoutId);
    showToast.timeoutId = window.setTimeout(() => setToast(null), 2400);
  }

  const handleLogout = async () => {
    setProfileOpen(false);
    try {
      await signOut({ redirect: false });
    } catch (e) {
      // ignore
    }
    router.push("/login");
  };

  const greetingName = useMemo(() => {
    if (!session?.user?.name) return session?.user?.email || "there";
    return session.user.name;
  }, [session]);

  const filteredRooms = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    if (!normalizedSearch) {
      return rooms;
    }

    return rooms.filter((room) => {
      const roomName = String(room?.name || "").toLowerCase();
      const roomCode = String(room?.code || "").toLowerCase();
      return roomName.includes(normalizedSearch) || roomCode.includes(normalizedSearch);
    });
  }, [rooms, searchTerm]);

  const roomCards = useMemo(() => filteredRooms.slice(0, 12), [filteredRooms]);

  const stats = useMemo(() => {
    const roomsJoined = rooms.length;
    const tasksPending = rooms.reduce(
      (total, room) => total + (roomInsights[room._id]?.pendingTasks || 0),
      0
    );
    const filesShared = rooms.reduce(
      (total, room) => total + (roomInsights[room._id]?.filesShared || 0),
      0
    );

    return {
      roomsJoined,
      tasksPending,
      filesShared,
    };
  }, [rooms, roomInsights]);

  const recentActivity = useMemo(() => notifications.slice(0, 8), [notifications]);

  const myTasks = useMemo(() => {
    const userId = String(session?.user?.id || "");
    const userEmail = String(session?.user?.email || "").toLowerCase();

    return rooms
      .flatMap((room) => {
        const tasks = roomInsights[room._id]?.tasks || [];
        return tasks
          .filter((task) => {
            const assignedId = String(task?.assignedTo?._id || task?.assignedTo || "");
            const assignedEmail = String(task?.assignedTo?.email || "").toLowerCase();

            if (userEmail && assignedEmail) {
              return assignedEmail === userEmail;
            }

            return Boolean(userId && assignedId && assignedId === userId);
          })
          .map((task) => ({ ...task, roomId: room._id, roomName: room.name }));
      })
      .sort((left, right) => new Date(right.updatedAt || right.createdAt || 0) - new Date(left.updatedAt || left.createdAt || 0))
      .slice(0, 5);
  }, [roomInsights, rooms, session?.user?.id]);

  const recentFiles = useMemo(() => {
    return rooms
      .flatMap((room) => {
        const files = roomInsights[room._id]?.resources || [];
        return files.map((file) => ({ ...file, roomId: room._id, roomName: room.name }));
      })
      .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0))
      .slice(0, 5);
  }, [roomInsights, rooms]);

  function formatActivityTime(value) {
    if (!value) return "";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    return new Intl.DateTimeFormat("en-IN", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "Asia/Kolkata",
    }).format(date);
  }

  function formatRoomUpdateTime(value) {
    if (!value) return "No activity";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "No activity";

    const diffMs = date.getTime() - Date.now();
    const diffMinutes = Math.round(diffMs / (1000 * 60));

    if (Math.abs(diffMinutes) < 60) {
      return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(diffMinutes, "minute");
    }

    const diffHours = Math.round(diffMinutes / 60);
    if (Math.abs(diffHours) < 24) {
      return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(diffHours, "hour");
    }

    const diffDays = Math.round(diffHours / 24);
    return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(diffDays, "day");
  }

  function getMemberCount(room) {
    return Array.isArray(room?.members) ? room.members.length : 0;
  }

  function actionLabel(actionType) {
    const normalized = String(actionType || "").toLowerCase();
    if (normalized === "task") return "updated a task";
    if (normalized === "file") return "shared a file";
    if (normalized === "announcement") return "posted an announcement";
    if (normalized === "message") return "sent a message";
    return "updated this room";
  }

  function taskStatusLabel(status) {
    if (status === "inprogress") return "In Progress";
    if (status === "done") return "Done";
    return "Todo";
  }

  function taskStatusClass(status) {
    if (status === "done") return "bg-emerald-100 text-emerald-700";
    if (status === "inprogress") return "bg-blue-100 text-blue-700";
    return "bg-amber-100 text-amber-700";
  }

  async function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  }

  async function fetchRooms() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/rooms", { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch rooms");
      }

      setRooms(data.rooms || []);
    } catch (err) {
      setError(err.message || "Failed to fetch rooms");
    } finally {
      setLoading(false);
    }
  }

  async function fetchUnread() {
    try {
      const response = await fetch("/api/room/unread", { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch unread counts");
      }

      const nextUnread = (data.unread || []).reduce((acc, item) => {
        acc[item.roomId] = item.unreadCount || 0;
        return acc;
      }, {});

      setUnreadByRoom(nextUnread);
      setTotalUnread(data.totalUnread || 0);
    } catch (err) {
      setError(err.message || "Failed to fetch unread counts");
    }
  }

  async function fetchRoomInsights(targetRooms) {
    if (!targetRooms.length) {
      setRoomInsights({});
      return;
    }

    setInsightsLoading(true);

    try {
      const entries = await Promise.all(
        targetRooms.map(async (room) => {
          try {
            const [messagesRes, tasksRes, resourcesRes] = await Promise.all([
              fetch(`/api/rooms/${room._id}/messages`, { cache: "no-store" }),
              fetch(`/api/rooms/${room._id}/tasks`, { cache: "no-store" }),
              fetch(`/api/rooms/${room._id}/resources`, { cache: "no-store" }),
            ]);

            const [messagesData, tasksData, resourcesData] = await Promise.all([
              messagesRes.json(),
              tasksRes.json(),
              resourcesRes.json(),
            ]);

            const messages = Array.isArray(messagesData?.messages) ? messagesData.messages : [];
            const tasks = Array.isArray(tasksData?.tasks) ? tasksData.tasks : [];
            const resources = Array.isArray(resourcesData?.resources) ? resourcesData.resources : [];

            const previewMessage =
              messages.length > 0
                ? String(messages[messages.length - 1]?.message || "No messages yet")
                : "No messages yet";

            return [
              room._id,
              {
                previewMessage,
                pendingTasks: tasks.filter((task) => task.status !== "done").length,
                filesShared: resources.length,
                tasks,
                resources,
              },
            ];
          } catch {
            return [
              room._id,
              {
                previewMessage: "No messages yet",
                pendingTasks: 0,
                filesShared: 0,
                tasks: [],
                resources: [],
              },
            ];
          }
        })
      );

      setRoomInsights(Object.fromEntries(entries));
    } finally {
      setInsightsLoading(false);
    }
  }

  async function openRoom(roomId, options = {}) {
    try {
      await fetch("/api/room/last-seen", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId }),
      });
    } catch {
      // The room view will retry and sync lastSeen again on load.
    }

    setUnreadByRoom((current) => {
      const deduction = current[roomId] || 0;
      setTotalUnread((total) => Math.max(0, total - deduction));
      return { ...current, [roomId]: 0 };
    });

    if (options.toastMessage) {
      showToast(options.toastMessage, options.toastType || "success");
      window.setTimeout(() => {
        router.push(`/chat/${roomId}`);
      }, 300);
      return;
    }

    router.push(`/chat/${roomId}`);
  }

  useEffect(() => {
    Promise.all([fetchRooms(), fetchUnread()]);
  }, []);

  useEffect(() => {
    function handleClickOutside(event) {
      if (!profileMenuRef.current?.contains(event.target)) {
        setProfileOpen(false);
      }
    }

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  // Clear any pending toast timeout on unmount to prevent state updates after unmount
  useEffect(() => {
    return () => {
      window.clearTimeout(showToast.timeoutId);
      showToast.timeoutId = null;
    };
  }, []);

  useEffect(() => {
    fetchRoomInsights(rooms);
  }, [rooms]);

  useEffect(() => {
    if (!session?.user) return;

    if (!socket.connected) {
      socket.connect();
    }

    const onNewMessageNotification = (payload) => {
      if (!payload?.roomId) return;

      setUnreadByRoom((current) => {
        if (!(payload.roomId in current) && !rooms.some((room) => room._id === payload.roomId)) {
          return current;
        }

        return { ...current, [payload.roomId]: (current[payload.roomId] || 0) + 1 };
      });

      if (rooms.some((room) => room._id === payload.roomId)) {
        setTotalUnread((current) => current + 1);
      }
    };

    socket.on("newMessageNotification", onNewMessageNotification);

    return () => {
      socket.off("newMessageNotification", onNewMessageNotification);
    };
  }, [rooms, session?.user]);

  async function handleCreateRoom(e) {
    e.preventDefault();
    setActionLoading(true);
    setError("");

    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: createRoomName }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create room");
      }

      setCreateRoomName("");
      await Promise.all([fetchRooms(), fetchUnread()]);
      openRoom(data.room._id, { toastMessage: "Room created successfully" });
    } catch (err) {
      setError(err.message || "Failed to create room");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleJoinRoom(e) {
    e.preventDefault();
    setActionLoading(true);
    setError("");

    try {
      const response = await fetch("/api/rooms/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: joinRoomCode }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to join room");
      }

      setJoinRoomCode("");
      await Promise.all([fetchRooms(), fetchUnread()]);
      openRoom(data.room._id, { toastMessage: "Joined room successfully" });
    } catch (err) {
      setError(err.message || "Failed to join room");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleUploadResource(event) {
    event.preventDefault();

    if (!uploadRoomId) {
      setError("Please select a room");
      return;
    }

    setActionLoading(true);
    setError("");

    try {
      let payload = {
        type: uploadType,
        url: uploadUrl,
        name: uploadName,
      };

      if (uploadType === "file") {
        if (!uploadFile) {
          throw new Error("Please choose a file");
        }

        const dataUrl = await readFileAsDataUrl(uploadFile);
        payload = {
          type: "file",
          url: String(dataUrl),
          name: uploadName || uploadFile.name,
        };
      }

      const response = await fetch(`/api/rooms/${uploadRoomId}/resources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to upload resource");
      }

      setUploadType("link");
      setUploadUrl("");
      setUploadName("");
      setUploadFile(null);
      setUploadRoomId("");
      setModalOpen("");
      showToast("Resource uploaded successfully");
      await fetchRoomInsights(rooms);
    } catch (err) {
      setError(err.message || "Failed to upload resource");
    } finally {
      setActionLoading(false);
    }
  }

  function openMyTasks() {
    if (myTasks.length > 0) {
      router.push(`/chat/${myTasks[0].roomId}/tasks`);
      return;
    }

    if (rooms.length > 0) {
      router.push(`/chat/${rooms[0]._id}/tasks`);
      return;
    }

    showToast("No workspaces available yet", "error");
  }

  function openResource(item) {
    if (!item?.roomId) return;
    router.push(`/chat/${item.roomId}/resources`);
  }

  return (
    <div className="dashboard-internal min-h-screen bg-slate-50 px-4 py-5 md:px-6 md:py-6 lg:px-8">
      <div className="mx-auto max-w-[1440px]">
        <header className="sticky top-3 z-40 mb-6 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur md:px-5 md:py-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="mr-2 flex items-center gap-2 min-w-[180px]">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-slate-900 text-sm font-bold text-white">W</div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-500">Workspace</p>
                <p className="text-sm font-semibold text-slate-900">WorkspaceOne</p>
              </div>
            </div>

            <div className="min-w-[220px] flex-1">
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search rooms by name or code"
                className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-800 outline-none transition focus:border-slate-400 focus:bg-white"
              />
            </div>

            <div className="ml-auto flex items-center gap-2" ref={profileMenuRef}>
              <NotificationBell />

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setProfileOpen((open) => !open)}
                  className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-slate-800 text-xs font-bold text-white">
                    {String(greetingName).charAt(0).toUpperCase()}
                  </span>
                  <span className="max-w-[96px] truncate">{greetingName}</span>
                </button>

                {profileOpen ? (
                  <div className="absolute right-0 mt-2 w-44 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                    >
                      Logout
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </header>

        {error ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(330px,1fr)] xl:gap-7">
          <section className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-xl font-bold text-slate-900 md:text-2xl">Workspace Overview</h1>
                  <p className="mt-3 text-sm leading-relaxed text-slate-600">Manage rooms, track updates, and keep your team aligned.</p>
                </div>

                <button
                  type="button"
                  onClick={fetchRooms}
                  className="h-9 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Refresh
                </button>
              </div>

              {totalUnread > 0 ? (
                <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700">
                  {totalUnread} unread updates across your rooms
                </p>
              ) : null}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-slate-900">Rooms</h2>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                  {roomCards.length} shown
                </span>
              </div>

              {loading ? (
                <div className="grid gap-3 md:grid-cols-2" aria-label="Loading rooms">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="skeleton-line skeleton-line-title" />
                      <div className="mt-2 skeleton-line skeleton-line-code" />
                      <div className="mt-3 skeleton-line skeleton-line-text" />
                      <div className="mt-3 skeleton-line skeleton-line-button" />
                    </div>
                  ))}
                </div>
              ) : roomCards.length === 0 ? (
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
                  No rooms found. Create one or join with a code.
                </p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {roomCards.map((room) => {
                    const unread = unreadByRoom[room._id] || 0;
                    const insight = roomInsights[room._id];

                    return (
                      <article key={room._id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-900 text-white"><IconRoom /></span>
                            <h3 className="line-clamp-1 text-base font-semibold text-slate-900">{room.name}</h3>
                          </div>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{unread > 0 ? unread : 0}</span>
                        </div>

                        <div className="mt-2 flex items-center gap-2">
                          <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                            {room.code}
                          </span>
                          <span className="text-[11px] text-slate-500">{getMemberCount(room)} members</span>
                        </div>

                        <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                          {insightsLoading ? "Loading latest activity..." : insight?.previewMessage || "No activity yet"}
                        </p>

                        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                          <p className="inline-flex items-center gap-1"><IconClock /> {formatRoomUpdateTime(room.updatedAt)}</p>
                          <button
                            type="button"
                            className="h-8 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            onClick={() => openRoom(room._id)}
                          >
                            Open
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <aside className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Quick Actions</h2>

              <div className="mt-1 grid gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen("create")}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-3 text-left text-sm font-semibold text-white hover:bg-slate-800"
                >
                  <IconPlus />
                  Create Workspace
                </button>
                <button
                  type="button"
                  onClick={() => setModalOpen("join")}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <IconJoin />
                  Join with Code
                </button>
                <button
                  type="button"
                  onClick={() => setModalOpen("upload")}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <IconUpload />
                  Upload Resource
                </button>
                <button
                  type="button"
                  onClick={openMyTasks}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <IconTasks />
                  View My Tasks
                </button>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Workspace Stats</h2>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 xl:grid-cols-3">
                <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500"><IconRoom /> Workspaces</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{stats.roomsJoined}</p>
                </article>
                <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500"><IconTasks /> Pending</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{stats.tasksPending}</p>
                </article>
                <article className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500"><IconFile /> Files</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{stats.filesShared}</p>
                </article>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Recent Activity</h2>
              {recentActivity.length === 0 ? (
                <p className="text-sm text-slate-600">No activity yet.</p>
              ) : (
                <div className="grid gap-2">
                  {recentActivity.map((item) => (
                    <button
                      type="button"
                      key={`activity-${item._id}`}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left hover:bg-slate-50"
                      onClick={() => router.push(item.link || `/chat/${item.roomId}`)}
                    >
                      <p className="text-xs font-medium text-slate-800">
                        <span className="mr-1 inline-flex align-middle text-slate-500">
                          {item.actionType === "task" ? <IconTasks /> : item.actionType === "file" ? <IconFile /> : <IconRoom />}
                        </span>
                        <span className="font-semibold">{item.senderName}</span> {actionLabel(item.actionType)}
                      </p>
                      <p className="mt-1 inline-flex items-center gap-2 text-xs text-slate-600">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">{item.roomName}</span>
                        <span className="inline-flex items-center gap-1"><IconClock /> {formatActivityTime(item.createdAt)}</span>
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">My Tasks</h2>
                <button type="button" onClick={openMyTasks} className="text-xs font-semibold text-slate-600 hover:text-slate-900">
                  Open all
                </button>
              </div>

              {myTasks.length === 0 ? (
                <p className="text-sm text-slate-600">No tasks assigned to you yet.</p>
              ) : (
                <div className="grid gap-2">
                  {myTasks.map((task) => (
                    <button
                      type="button"
                      key={task._id}
                      onClick={() => router.push(`/chat/${task.roomId}/tasks`)}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left hover:bg-slate-50"
                    >
                      <p className="line-clamp-1 text-sm font-semibold text-slate-900">{task.title}</p>
                      <p className="mt-1 flex items-center gap-2 text-xs text-slate-600">
                        <span className={`rounded-full px-2 py-0.5 font-semibold ${taskStatusClass(task.status)}`}>
                          {taskStatusLabel(task.status)}
                        </span>
                        <span>{task.roomName}</span>
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Recent Files</h2>
              {recentFiles.length === 0 ? (
                <p className="text-sm text-slate-600">No files shared recently.</p>
              ) : (
                <div className="grid gap-2">
                  {recentFiles.map((file) => (
                    <button
                      type="button"
                      key={`file-${file._id}`}
                      onClick={() => openResource(file)}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left hover:bg-slate-50"
                    >
                      <p className="line-clamp-1 text-sm font-semibold text-slate-900">{file.name || file.url}</p>
                      <p className="mt-1 text-xs text-slate-600">
                        {file.roomName} • {file.uploadedBy?.name || file.uploadedBy?.email || "Member"}
                      </p>
                      <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-500"><IconClock /> {formatActivityTime(file.createdAt)}</p>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </aside>
        </div>

        {modalOpen ? (
          <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onClick={() => setModalOpen("")}>
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
              {modalOpen === "create" ? (
                <>
                  <h3 className="text-lg font-semibold text-slate-900">Create Workspace</h3>
                  <p className="mt-1 text-sm text-slate-600">Create a new room for your team.</p>
                  <form onSubmit={handleCreateRoom} className="mt-4 grid gap-2">
                    <input
                      type="text"
                      value={createRoomName}
                      onChange={(event) => setCreateRoomName(event.target.value)}
                      placeholder="Workspace name"
                      maxLength={50}
                      className="h-10 rounded-lg border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
                      required
                    />
                    <div className="mt-1 flex justify-end gap-2">
                      <button type="button" className="h-9 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700" onClick={() => setModalOpen("")}>Cancel</button>
                      <button type="submit" disabled={actionLoading} className="h-9 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white disabled:opacity-60">
                        {actionLoading ? "Please wait..." : "Create"}
                      </button>
                    </div>
                  </form>
                </>
              ) : null}

              {modalOpen === "join" ? (
                <>
                  <h3 className="text-lg font-semibold text-slate-900">Join with Code</h3>
                  <p className="mt-1 text-sm text-slate-600">Enter a 6-character room code.</p>
                  <form onSubmit={handleJoinRoom} className="mt-4 grid gap-2">
                    <input
                      type="text"
                      value={joinRoomCode}
                      onChange={(event) => {
                        const sanitized = event.target.value
                          .toUpperCase()
                          .replace(/[^A-Z0-9]/g, "")
                          .slice(0, ROOM_CODE_LENGTH);

                        setJoinRoomCode(sanitized);
                      }}
                      placeholder="ABC123"
                      minLength={ROOM_CODE_LENGTH}
                      maxLength={ROOM_CODE_LENGTH}
                      pattern="[A-Z0-9]{6}"
                      className="h-10 rounded-lg border border-slate-200 px-3 text-sm uppercase tracking-widest outline-none focus:border-slate-400"
                      required
                    />
                    <div className="mt-1 flex justify-end gap-2">
                      <button type="button" className="h-9 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700" onClick={() => setModalOpen("")}>Cancel</button>
                      <button type="submit" disabled={actionLoading} className="h-9 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white disabled:opacity-60">
                        {actionLoading ? "Please wait..." : "Join"}
                      </button>
                    </div>
                  </form>
                </>
              ) : null}

              {modalOpen === "upload" ? (
                <>
                  <h3 className="text-lg font-semibold text-slate-900">Upload Resource</h3>
                  <p className="mt-1 text-sm text-slate-600">Share a file or link to a room.</p>
                  <form onSubmit={handleUploadResource} className="mt-4 grid gap-2">
                    <select
                      value={uploadRoomId}
                      onChange={(event) => setUploadRoomId(event.target.value)}
                      className="h-11 rounded-xl border border-slate-200 px-3.5 pr-10 text-sm leading-normal text-slate-800 outline-none appearance-none focus:border-slate-400"
                      required
                    >
                      <option value="">Select room</option>
                      {rooms.map((room) => (
                        <option key={room._id} value={room._id}>{room.name}</option>
                      ))}
                    </select>

                    <select
                      value={uploadType}
                      onChange={(event) => setUploadType(event.target.value)}
                      className="h-11 rounded-xl border border-slate-200 px-3.5 pr-10 text-sm leading-normal text-slate-800 outline-none appearance-none focus:border-slate-400"
                    >
                      <option value="link">Link</option>
                      <option value="file">File</option>
                    </select>

                    {uploadType === "link" ? (
                      <input
                        type="url"
                        value={uploadUrl}
                        onChange={(event) => setUploadUrl(event.target.value)}
                        placeholder="https://example.com"
                        className="h-11 rounded-xl border border-slate-200 px-3.5 text-sm leading-normal text-slate-800 outline-none focus:border-slate-400"
                        required
                      />
                    ) : (
                      <input
                        type="file"
                        onChange={(event) => setUploadFile(event.target.files?.[0] || null)}
                        className="h-11 rounded-xl border border-slate-200 px-3 py-2 text-sm leading-normal text-slate-800"
                        required
                      />
                    )}

                    <input
                      type="text"
                      value={uploadName}
                      onChange={(event) => setUploadName(event.target.value)}
                      placeholder="Optional display name"
                      className="h-11 rounded-xl border border-slate-200 px-3.5 text-sm leading-normal text-slate-800 outline-none focus:border-slate-400"
                    />

                    <div className="mt-1 flex justify-end gap-2">
                      <button type="button" className="h-9 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700" onClick={() => setModalOpen("")}>Cancel</button>
                      <button type="submit" disabled={actionLoading} className="h-9 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white disabled:opacity-60">
                        {actionLoading ? "Please wait..." : "Upload"}
                      </button>
                    </div>
                  </form>
                </>
              ) : null}
            </div>
          </div>
        ) : null}

        {toast ? (
          <div className={`app-toast ${toast.type === "error" ? "app-toast-error" : "app-toast-success"}`} role="status">
            {toast.message}
          </div>
        ) : null}
      </div>
    </div>
  );
}
