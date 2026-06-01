import { getSupabaseAdminClient } from "@/lib/supabase";

export const VOICE_NOTES_BUCKET = "voice-notes";
export const VOICE_NOTE_SIGNED_URL_EXPIRY = 60 * 60;

export function buildVoiceNotePlaybackUrl({ roomId, messageId, audioPath }) {
  if (!roomId) {
    return "";
  }

  const searchParams = new URLSearchParams();

  if (audioPath) {
    searchParams.set("path", audioPath);
  }

  const queryString = searchParams.toString();
  const basePath = messageId ? `/api/rooms/${roomId}/messages/${messageId}/audio` : "";

  if (!basePath) {
    return "";
  }

  return queryString ? `${basePath}?${queryString}` : basePath;
}

export function toVoiceMessageLabel(message) {
  if (message?.messageType !== "audio" && !message?.audioPath) {
    return message?.message || "";
  }

  return "Voice message";
}

export async function signAudioMessage(message) {
  if (!message || (!message.audioPath && message.messageType !== "audio")) {
    return {
      ...message,
      message: toVoiceMessageLabel(message),
      audioUrl: message?.audioUrl || "",
    };
  }

  const playbackUrl = buildVoiceNotePlaybackUrl({
    roomId: message.roomId?.toString?.() || message.roomId,
    messageId: message._id?.toString?.() || message._id,
    audioPath: message.audioPath,
  });

  if (playbackUrl) {
    return {
      ...message,
      message: toVoiceMessageLabel(message),
      audioUrl: playbackUrl,
    };
  }

  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase.storage
      .from(VOICE_NOTES_BUCKET)
      .createSignedUrl(message.audioPath, VOICE_NOTE_SIGNED_URL_EXPIRY);

    if (error) {
      throw error;
    }

    return {
      ...message,
      message: toVoiceMessageLabel(message),
      audioUrl: data?.signedUrl || "",
    };
  } catch {
    return {
      ...message,
      message: toVoiceMessageLabel(message),
      audioUrl: message.audioUrl || "",
    };
  }
}

export function buildVoiceNoteStoragePath({ roomId, channelId, userId, fileExtension = "webm" }) {
  const safeExtension = String(fileExtension || "webm").replace(/[^a-z0-9]/gi, "") || "webm";
  const stamp = Date.now();
  const randomSuffix = Math.random().toString(36).slice(2, 10);

  return `rooms/${roomId}/channels/${channelId}/users/${userId}/${stamp}-${randomSuffix}.${safeExtension}`;
}
