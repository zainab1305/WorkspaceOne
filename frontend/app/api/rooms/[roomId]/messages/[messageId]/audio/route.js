import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { connectDB } from "@/lib/db";
import Message from "@/models/Message";
import { getRoomAccess } from "@/lib/roomRoles";
import { VOICE_NOTES_BUCKET } from "@/lib/messageMedia";
import { getSupabaseAdminClient } from "@/lib/supabase";

export async function GET(request, { params }) {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { roomId, messageId } = await params;
    const requestUrl = new URL(request.url);
    const requestedPath = requestUrl.searchParams.get("path") || "";

    await connectDB();

    const access = await getRoomAccess(session, roomId);
    if (access.error) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    let audioPath = requestedPath;

    if (!audioPath) {
      const message = await Message.findOne({ _id: messageId, roomId }).lean();

      if (!message || !message.audioPath) {
        return NextResponse.json({ error: "Voice message not found" }, { status: 404 });
      }

      audioPath = message.audioPath;
    }

    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase.storage
      .from(VOICE_NOTES_BUCKET)
      .createSignedUrl(audioPath, 60 * 10);

    if (error || !data?.signedUrl) {
      throw error || new Error("Unable to create playback URL");
    }

    const rangeHeader = request.headers.get("range");
    const audioResponse = await fetch(data.signedUrl, {
      headers: rangeHeader ? { Range: rangeHeader } : undefined,
    });

    if (!audioResponse.ok || !audioResponse.body) {
      throw new Error("Unable to load voice message audio");
    }

    const headers = new Headers();
    const passthroughHeaders = [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "etag",
      "last-modified",
    ];

    passthroughHeaders.forEach((headerName) => {
      const headerValue = audioResponse.headers.get(headerName);
      if (headerValue) {
        headers.set(headerName, headerValue);
      }
    });

    headers.set("cache-control", "private, max-age=300");

    return new Response(audioResponse.body, {
      status: audioResponse.status,
      headers,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message || "Failed to load voice message" }, { status: 500 });
  }
}