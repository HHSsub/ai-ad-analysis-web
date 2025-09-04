import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { Readable } from 'stream';

// youtubeService.ts의 핵심 로직을 이곳으로 이동
const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY,
});

async function getChannelVideos(channelId: string) {
  // ... (기존 youtubeService.ts의 getChannelVideos 함수 내용)
}

async function getVideoDetails(videoId: string) {
  // ... (기존 youtubeService.ts의 getVideoDetails 함수 내용)
}

// 클라이언트의 요청을 처리할 POST 함수
export async function POST(request: Request) {
  try {
    const { action, payload } = await request.json();

    if (action === 'getChannelVideos') {
      const videos = await getChannelVideos(payload.channelId);
      return NextResponse.json(videos);
    }

    if (action === 'getVideoDetails') {
      const details = await getVideoDetails(payload.videoId);
      return NextResponse.json(details);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('API Route Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
