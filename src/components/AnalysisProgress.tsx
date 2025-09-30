'use client';

import React, { useEffect } from 'react';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { useVideoStore } from '@/store/videoStore';

const AnalysisProgress: React.FC = () => {
  const { progress, analyzedVideos, setIsAnalyzing, setProgress } = useVideoStore();

  useEffect(() => {
    // 분석 진행상황 폴링
    const pollProgress = async () => {
      try {
        const response = await fetch('/api/analyze/progress');
        if (response.ok) {
          const data = await response.json();
          setProgress(data.progress);
          
          // 분석 완료 체크
          if (data.progress && data.progress.completed >= data.progress.total) {
            setIsAnalyzing(false);
            setProgress(null);
          }
        }
      } catch (error) {
        console.error('Progress polling error:', error);
      }
    };

    const interval = setInterval(pollProgress, 2000); // 2초마다 체크
    
    return () => clearInterval(interval);
  }, [setIsAnalyzing, setProgress]);

  if (!progress) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="animate-spin mx-auto mb-4">
          <Loader2 className="w-12 h-12 text-blue-600" />
        </div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">분석을 준비하고 있습니다</h3>
        <p className="text-gray-600">잠시만 기다려주세요...</p>
      </div>
    );
  }

  const progressPercentage = (progress.completed / progress.total) * 100;

  return (
    <div className="bg-white rounded-lg shadow-lg p-8">
      <div className="text-center mb-8">
        <h3 className="text-2xl font-semibold text-gray-900 mb-2">영상 분석 중...</h3>
        <p className="text-gray-600">
          {progress.completed}/{progress.total} 완료 ({progressPercentage.toFixed(1)}%)
        </p>
      </div>

      {/* 전체 진행률 */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-gray-700">전체 진행률</span>
          <span className="text-sm font-medium text-blue-600">{progressPercentage.toFixed(1)}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className="bg-blue-600 h-3 rounded-full transition-all duration-300"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      {/* 현재 처리 중인 영상 */}
      {progress.current && (
        <div className="mb-8 p-4 bg-blue-50 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="animate-spin">
              <Loader2 className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="font-medium text-blue-900">현재 처리 중:</p>
              <p className="text-blue-700">{progress.current}</p>
              <p className="text-sm text-blue-600">
                단계: {progress.stage === 'youtube' ? 'YouTube 메타데이터 수집' : 
                       progress.stage === 'gemini' ? 'AI 영상 분석' : '분석 완료'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 완료된 영상 목록 */}
      <div>
        <h4 className="text-lg font-semibold text-gray-900 mb-4">처리 현황</h4>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {analyzedVideos.map((video, index) => (
            <div
              key={video.id}
              className="flex items-center justify-between p-3 rounded-lg border"
            >
              <div className="flex items-center gap-3">
                {video.status === 'completed' && (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                )}
                {video.status === 'failed' && (
                  <XCircle className="w-5 h-5 text-red-600" />
                )}
                {video.status === 'analyzing' && (
                  <div className="animate-spin">
                    <Loader2 className="w-5 h-5 text-blue-600" />
                  </div>
                )}
                {video.status === 'incomplete' && (
                  <XCircle className="w-5 h-5 text-yellow-600" />
                )}
                <div>
                  <p className="font-medium text-gray-900">{video.title}</p>
                  {video.error && (
                    <p className="text-sm text-red-600">{video.error}</p>
                  )}
                </div>
              </div>
              <div className="text-sm">
                {video.status === 'completed' && (
                  <span className="text-green-600 font-medium">완료</span>
                )}
                {video.status === 'failed' && (
                  <span className="text-red-600 font-medium">실패</span>
                )}
                {video.status === 'analyzing' && (
                  <span className="text-blue-600 font-medium">분석중</span>
                )}
                {video.status === 'incomplete' && (
                  <span className="text-yellow-600 font-medium">불완전</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 완료 후 안내 */}
      {progressPercentage >= 100 && (
        <div className="mt-8 p-4 bg-green-50 rounded-lg text-center">
          <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
          <p className="font-semibold text-green-900 mb-1">분석이 완료되었습니다!</p>
          <p className="text-green-700 text-sm">
            홈으로 돌아가서 결과를 확인하세요.
          </p>
        </div>
      )}
    </div>
  );
};

export default AnalysisProgress;
