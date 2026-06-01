"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { socket } from "@/lib/socket";

export default function RoomPresence({ roomId }) {
  const { data: session } = useSession();
  const pathname = usePathname();

  useEffect(() => {
    if (!roomId || !session?.user?.id) return;

    if (pathname === `/chat/${roomId}/chat`) {
      return undefined;
    }

    if (!socket.connected) {
      socket.connect();
    }

    socket.emit("registerUser", { userId: session.user.id });
    socket.emit("joinRoom", {
      roomId,
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
      },
    });

    return () => {
      socket.emit("leaveRoom", { roomId });
    };
  }, [pathname, roomId, session?.user?.email, session?.user?.id, session?.user?.name]);

  return null;
}
