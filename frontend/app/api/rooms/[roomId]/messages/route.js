import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { connectDB } from "@/lib/db";
import Room from "@/models/Room";
import Message from "@/models/Message";
import { getRoomAccess } from "@/lib/roomRoles";
import { buildNotificationLink, createRoomNotifications } from "@/lib/notifications";
import { signAudioMessage } from "@/lib/messageMedia";

async function getUserAndRoom(session, roomId) {
  return getRoomAccess(session, roomId);
}

export async function GET(_, { params }) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { roomId } = await params;
    const access = await getUserAndRoom(session, roomId);

    if (access.error) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const messages = await Message.find({ roomId })
      .sort({ createdAt: 1 })
      .select("senderId senderName message messageType audioPath audioFileName audioMimeType audioSizeBytes audioDurationSeconds type isPinned pinnedAt replyTo time createdAt")
      .lean();

    const serializedMessages = await Promise.all(messages.map((item) => signAudioMessage({ ...item, roomId })));

    return NextResponse.json({ messages: serializedMessages }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req, { params }) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { message, replyTo } = await req.json();

    if (!message || !message.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    await connectDB();

    const { roomId } = await params;
    const access = await getUserAndRoom(session, roomId);

    if (access.error) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const now = new Date();

    const normalizedReply =
      replyTo && typeof replyTo === "object"
        ? {
            messageId: replyTo.messageId || null,
            userId: String(replyTo.userId || "").trim(),
            senderName: String(replyTo.senderName || "").trim().slice(0, 120),
            message: String(replyTo.message || "").trim().slice(0, 300),
          }
        : null;

    const created = await Message.create({
      roomId,
      senderId: access.user._id,
      senderName: access.user.name || access.user.email,
      message: message.trim(),
      messageType: "text",
      type: "message",
      isPinned: false,
      pinnedAt: null,
      replyTo:
        normalizedReply && normalizedReply.senderName && normalizedReply.message
          ? normalizedReply
          : undefined,
      time: now.toLocaleTimeString('en-IN', {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Kolkata",
      }),
    });

    await Room.findByIdAndUpdate(roomId, { $set: { updatedAt: now } });

    const createdMessage = created.toObject ? created.toObject() : created;
    if (normalizedReply && normalizedReply.senderName && normalizedReply.message) {
      createdMessage.replyTo = normalizedReply;
    }

    await createRoomNotifications({
      room: access.room,
      sender: access.user,
      actionType: "message",
      entityType: "message",
      entityId: created._id,
      previewText: created.message,
      link: buildNotificationLink(roomId, "message"),
    });

    return NextResponse.json({ message: createdMessage }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
