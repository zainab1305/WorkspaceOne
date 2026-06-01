import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { connectDB } from "@/lib/db";
import Channel from "@/models/Channel";
import Message from "@/models/Message";
import Room from "@/models/Room";
import { getRoomAccess } from "@/lib/roomRoles";
import { buildNotificationLink, createRoomNotifications } from "@/lib/notifications";
import { buildVoiceNoteStoragePath, signAudioMessage, VOICE_NOTES_BUCKET } from "@/lib/messageMedia";
import { getSupabaseAdminClient } from "@/lib/supabase";

function sanitizeFileExtension(fileName, mimeType) {
  const fromName = String(fileName || "").split(".").pop() || "";
  if (fromName && /^[a-z0-9]+$/i.test(fromName)) {
    return fromName.toLowerCase();
  }

  const mimeMap = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
  };

  return mimeMap[String(mimeType || "").toLowerCase()] || "webm";
}

export async function POST(req, { params }) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const { roomId, channelId } = await params;
    const access = await getRoomAccess(session, roomId);

    if (access.error) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const channel = await Channel.findOne({ _id: channelId, workspaceId: roomId }).lean();
    if (!channel) {
      return NextResponse.json({ error: "Channel not found" }, { status: 404 });
    }

    const formData = await req.formData();
    const audioFile = formData.get("audio");
    const durationValue = Number(formData.get("duration") || 0);
    const mimeType = String(formData.get("mimeType") || audioFile?.type || "audio/webm");
    const originalName = String(formData.get("fileName") || audioFile?.name || "voice-note.webm");

    if (!(audioFile instanceof File)) {
      return NextResponse.json({ error: "Audio file is required" }, { status: 400 });
    }

    const fileExtension = sanitizeFileExtension(originalName, mimeType);
    const storagePath = buildVoiceNoteStoragePath({
      roomId,
      channelId,
      userId: access.user._id,
      fileExtension,
    });

    const arrayBuffer = await audioFile.arrayBuffer();
    const supabase = getSupabaseAdminClient();
    const { error: uploadError } = await supabase.storage
      .from(VOICE_NOTES_BUCKET)
      .upload(storagePath, Buffer.from(arrayBuffer), {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      throw uploadError;
    }

    const now = new Date();
    const created = await Message.create({
      roomId,
      channelId,
      senderId: access.user._id,
      senderName: access.user.name || access.user.email,
      message: "",
      messageType: "audio",
      audioPath: storagePath,
      audioFileName: originalName,
      audioMimeType: mimeType,
      audioSizeBytes: audioFile.size || Buffer.from(arrayBuffer).byteLength,
      audioDurationSeconds: Number.isFinite(durationValue) ? durationValue : 0,
      type: "message",
      isPinned: false,
      pinnedAt: null,
      time: now.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Kolkata",
      }),
    });

    await Room.findByIdAndUpdate(roomId, { $set: { updatedAt: now } });

    const createdMessage = created.toObject ? created.toObject() : created;
    const responseMessage = await signAudioMessage({ ...createdMessage, roomId, channelId });

    await createRoomNotifications({
      room: access.room,
      sender: access.user,
      actionType: "message",
      entityType: "message",
      entityId: created._id,
      previewText: "Voice message",
      link: buildNotificationLink(roomId, "message"),
    });

    return NextResponse.json(
      {
        message: {
          ...responseMessage,
          _id: responseMessage._id.toString(),
          channelId,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
