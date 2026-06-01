"use client";

import { useEffect, useMemo, useState } from "react";
import { socket } from "@/lib/socket";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function MembersClient({ roomId }) {
  const { data: session } = useSession();
  const router = useRouter();
  const [members, setMembers] = useState([]);
  const [onlineTokens, setOnlineTokens] = useState([]);
  const [currentUserRole, setCurrentUserRole] = useState("member");
  const [canManageMembers, setCanManageMembers] = useState(false);
  const [actionBusyId, setActionBusyId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadMembers(silent = false) {
    if (!silent) {
      setLoading(true);
      setError("");
    }

    try {
      const response = await fetch(`/api/rooms/${roomId}/members`, { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Failed to load members");

      setMembers(data.members || []);
      setCurrentUserRole(data.currentUserRole || "member");
      setCanManageMembers(Boolean(data.canManageMembers));
    } catch (err) {
      if (!silent) {
        setError(err.message || "Unable to load members");
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    loadMembers();
  }, [roomId]);

  useEffect(() => {
    if (!roomId || !session?.user) return;

    if (!socket.connected) {
      socket.connect();
    }

    const onRoomUsers = (payload) => {
      if (payload?.roomId !== roomId) return;
      setOnlineTokens(
        (payload.users || [])
          .flatMap((user) => [
            user?.id ? String(user.id).toLowerCase() : "",
            user?.email ? String(user.email).toLowerCase() : "",
          ])
          .filter(Boolean)
      );
    };

    const onRoleUpdated = (payload) => {
      if (payload?.roomId !== roomId) return;
      loadMembers(true);
    };

    const onUserRemoved = (payload) => {
      if (payload?.roomId !== roomId) return;

      const myId = session.user.id || "";
      if (payload?.targetUserId && myId && payload.targetUserId === myId) {
        router.replace("/dashboard");
        return;
      }

      loadMembers(true);
    };

    socket.on("roomUsers", onRoomUsers);
    socket.on("roleUpdated", onRoleUpdated);
    socket.on("userRemoved", onUserRemoved);

    return () => {
      socket.off("roomUsers", onRoomUsers);
      socket.off("roleUpdated", onRoleUpdated);
      socket.off("userRemoved", onUserRemoved);
    };
  }, [roomId, session?.user, router]);

  const onlineSet = useMemo(() => new Set(onlineTokens), [onlineTokens]);

  const isMemberOnline = (member) => {
    const idToken = member?.id ? String(member.id).toLowerCase() : "";
    const emailToken = member?.email ? String(member.email).toLowerCase() : "";
    return Boolean((idToken && onlineSet.has(idToken)) || (emailToken && onlineSet.has(emailToken)));
  };

  const isAdmin = currentUserRole === "admin";
  const isModerator = currentUserRole === "moderator";

  const removeMember = async (targetUserId) => {
    if (!canManageMembers) return;

    setActionBusyId(targetUserId);
    setError("");

    try {
      const response = await fetch("/api/room/remove-user", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, targetUserId }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to remove member");

      socket.emit("userRemoved", {
        roomId,
        targetUserId,
        actorName: session?.user?.name || session?.user?.email || "Manager",
      });
      await loadMembers(true);
    } catch (err) {
      setError(err.message || "Failed to remove member");
    } finally {
      setActionBusyId("");
    }
  };

  const updateMemberRole = async (targetUserId, role) => {
    if (!isAdmin) return;

    if (!canManageMembers) return;

    setActionBusyId(targetUserId);
    setError("");

    try {
      const response = await fetch("/api/room/promote", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, targetUserId, role }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to update role");

      socket.emit("roleUpdated", { roomId, targetUserId, role: data.role || role });
      await loadMembers(true);
    } catch (err) {
      setError(err.message || "Failed to update role");
    } finally {
      setActionBusyId("");
    }
  };

  if (loading) return <p>Loading members...</p>;

  return (
    <div className="workspace-section">
      {error && <p className="error-banner">{error}</p>}
      <p className="workspace-meta">Your role: {currentUserRole}</p>

      <div className="workspace-list">
        {members.map((member) => (
          <article key={member.id} className="workspace-card">
            <h3>{member.name}</h3>
            <p className="workspace-meta">{member.email || "No email"}</p>
            <p className="workspace-meta">Role: {member.role}</p>
            <p className="workspace-meta">Status: {isMemberOnline(member) ? "Online" : "Offline"}</p>

            {canManageMembers && member.id !== (session?.user?.id || "") && (
              <div className="workspace-actions">
                {isAdmin && member.role !== "admin" && (
                  <button
                    type="button"
                    className="ghost-btn"
                    disabled={actionBusyId === member.id}
                    onClick={() => updateMemberRole(member.id, member.role === "moderator" ? "member" : "moderator")}
                  >
                    {member.role === "moderator" ? "Remove Moderator" : "Make Moderator"}
                  </button>
                )}
                {(isAdmin || (isModerator && member.role === "member")) && (
                  <button
                    type="button"
                    className="danger-btn"
                    disabled={actionBusyId === member.id}
                    onClick={() => removeMember(member.id)}
                  >
                    {member.role === "moderator" ? "Remove Moderator" : "Remove Member"}
                  </button>
                )}
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}