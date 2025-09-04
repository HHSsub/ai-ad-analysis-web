'use client';

import React, { useState, useEffect } from 'react';
import { getLatestVideos } from '../services/metricsService';
import { VideoAnalysisDetail } from './VideoAnalysisDetail';

// 임시 타입 정의. 실제 API 응답에 맞춰 구체화 필요
interface VideoSnippet {
  publishedAt: string;
  title: string;
  thumbnails: {
    default: { url: string };
  };
}

interface VideoItem {
  id: { videoId: string };
  snippet: VideoSnippet;
}

interface VideoListProps {
  channelId: string;
}

export const VideoList: React.FC<VideoListProps> = ({ channelId }) => {
  const [pendingVideos, setPendingVideos] = useState<VideoItem[]>([]);
  const [completedVideos, setCompletedVideos] = useState<any[]>([]); // 분석 완료된 비디오 타입 정의 필요
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!channelId) return;

    const fetchVideos = async () => {
      try {
        setLoading(true);
        setError(null);
        const videos = await getLatestVideos(channelId);
        setPendingVideos(videos);
      } catch (err: any) {
        setError(err.message || '최신 동영상을 불러오는 데 실패했습니다.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchVideos();
  }, [channelId]);

  const handleAnalysisComplete = (analysisResult: any) => {
    setCompletedVideos(prev => [analysisResult, ...prev]);
    setPendingVideos(prev => prev.filter(v => v.id.videoId !== analysisResult.videoId));
  };

  if (loading) {
    return <div>로딩 중...</div>;
  }

  if (error) {
    return <div className="text-red-500">오류: {error}</div>;
  }

  return (
    <div className="space-y-6">
      {/* 분석 완료 섹션 */}
      {completedVideos.length > 0 && (
        <section>
          <h2 className="text-2xl font-bold mb-4">분석 완료</h2>
          <div className="space-y-4">
            {completedVideos.map(video => (
              <div key={video.videoId} className="p-4 bg-gray-800 rounded-lg">
                <h3 className="font-bold">{video.title}</h3>
                <p>조회수: {video.views.toLocaleString()}</p>
                <p>참여율: {video.engagementRate.toFixed(2)}%</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 분석 대기 섹션 */}
      {pendingVideos.length > 0 && (
        <section>
          <h2 className="text-2xl font-bold mb-4">분석 대기중인 동영상</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pendingVideos.map(video => (
              <VideoAnalysisDetail
                key={video.id.videoId}
                videoId={video.id.videoId}
                videoTitle={video.snippet.title}
                thumbnailUrl={video.snippet.thumbnails.default.url}
                onAnalysisComplete={handleAnalysisComplete}
              />
            ))}
          </div>
        </section>
      )}

      {!loading && pendingVideos.length === 0 && completedVideos.length === 0 && (
        <p>분석할 동영상이 없습니다.</p>
      )}
    </div>
  );
};
