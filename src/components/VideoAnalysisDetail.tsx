'use client';

import React, { useState } from 'react';
import { Save, Edit3, ExternalLink, BarChart3, FileText } from 'lucide-react';
import { useVideoStore } from '@/store/videoStore';
import { calculateHybridScore } from '@/services/metricsService';
import toast from 'react-hot-toast';

const VideoAnalysisDetail: React.FC = () => {
  const { selectedVideo, updateAnalyzedVideo } = useVideoStore();
  const [editMode, setEditMode] = useState(false);
  const [editedFeatures, setEditedFeatures] = useState<any>({});

  if (!selectedVideo) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-8 text-center">
        <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          영상을 선택해주세요
        </h3>
        <p className="text-gray-600">
          왼쪽 목록에서 분석 결과를 확인할 영상을 선택하세요.
        </p>
      </div>
    );
  }

  const hybridScore = selectedVideo.status === 'completed'
    ? calculateHybridScore(selectedVideo)
    : null;

  const handleFeatureEdit = (featureKey: string, value: string) => {
    setEditedFeatures({
      ...editedFeatures,
      [featureKey]: value
    });
  };

  const saveChanges = () => {
    if (Object.keys(editedFeatures).length > 0) {
      updateAnalyzedVideo(selectedVideo.id, {
        features: { ...selectedVideo.features, ...editedFeatures }
      });
      toast.success('변경사항이 저장되었습니다.');
    }
    setEditedFeatures({});
    setEditMode(false);
  };

  const cancelEdit = () => {
    setEditedFeatures({});
    setEditMode(false);
  };

  // features 객체에서 키 추출 및 정렬
  const getFeatureEntries = () => {
    if (!selectedVideo.features) return [];
    
    return Object.entries(selectedVideo.features)
      .filter(([key]) => key.startsWith('feature_'))
      .sort((a, b) => {
        const numA = parseInt(a[0].replace('feature_', ''));
        const numB = parseInt(b[0].replace('feature_', ''));
        return numA - numB;
      });
  };

  const featureEntries = getFeatureEntries();

  return (
    <div className="space-y-6">
      {/* 영상 정보 헤더 */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex justify-between items-start mb-4">
          <div className="flex-grow">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {selectedVideo.title}
            </h2>
            <div className="flex items-center gap-4 text-sm text-gray-600">
              
                href={selectedVideo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-blue-600 hover:text-blue-700"
              >
                <ExternalLink className="w-4 h-4" />
                YouTube에서 보기
              </a>
              {selectedVideo.note && (
                <span>메모: {selectedVideo.note}</span>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            {editMode ? (
              <>
                <button
                  onClick={saveChanges}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Save className="w-4 h-4" />
                  저장
                </button>
                <button
                  onClick={cancelEdit}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
                >
                  취소
                </button>
              </>
            ) : (
              <button
                onClick={() => setEditMode(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Edit3 className="w-4 h-4" />
                편집
              </button>
            )}
          </div>
        </div>

        {/* YouTube 메타데이터 */}
        {selectedVideo.youtubeData && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="text-sm text-gray-600">조회수</p>
              <p className="font-semibold">{selectedVideo.youtubeData.viewCount.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">좋아요</p>
              <p className="font-semibold">{selectedVideo.youtubeData.likeCount.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">댓글</p>
              <p className="font-semibold">{selectedVideo.youtubeData.commentCount.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">길이</p>
              <p className="font-semibold">{selectedVideo.youtubeData.duration}</p>
            </div>
          </div>
        )}
      </div>

      {/* 하이브리드 점수 */}
      {hybridScore && (
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-blue-600" />
            종합 점수
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* 최종 하이브리드 점수 */}
            <div className="text-center p-4 bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">하이브리드 점수</p>
              <p className="text-3xl font-bold text-blue-600">
                {hybridScore.final.toFixed(1)}
              </p>
              <p className="text-sm text-gray-500">/ 100</p>
            </div>

            {/* 정량 지표 */}
            <div className="p-4 bg-green-50 rounded-lg">
              <p className="font-semibold text-green-800 mb-2">정량 지표 (40%)</p>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>관심도:</span>
                  <span>{hybridScore.quantitative.interestIndex.toFixed(1)}</span>
                </div>
                <div className="flex justify-between">
                  <span>유지력:</span>
                  <span>{hybridScore.quantitative.retentionIndex.toFixed(1)}</span>
                </div>
                <div className="flex justify-between">
                  <span>성장력:</span>
                  <span>{hybridScore.quantitative.growthIndex.toFixed(1)}</span>
                </div>
                <hr className="my-2" />
                <div className="flex justify-between font-semibold">
                  <span>종합:</span>
                  <span>{hybridScore.quantitative.finalScore.toFixed(1)}</span>
                </div>
              </div>
            </div>

            {/* 정성 지표 */}
            <div className="p-4 bg-purple-50 rounded-lg">
              <p className="font-semibold text-purple-800 mb-2">정성 지표 (60%)</p>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>오프닝 훅:</span>
                  <span>{hybridScore.qualitative.openingHookIndex.toFixed(1)}</span>
                </div>
                <div className="flex justify-between">
                  <span>브랜드 전달:</span>
                  <span>{hybridScore.qualitative.brandDeliveryIndex.toFixed(1)}</span>
                </div>
                <div className="flex justify-between">
                  <span>스토리 구조:</span>
                  <span>{hybridScore.qualitative.storyStructureIndex.toFixed(1)}</span>
                </div>
                <div className="flex justify-between">
                  <span>시각적 완성도:</span>
                  <span>{hybridScore.qualitative.visualAestheticsIndex.toFixed(1)}</span>
                </div>
                <hr className="my-2" />
                <div className="flex justify-between font-semibold">
                  <span>종합:</span>
                  <span>{hybridScore.qualitative.qualityScore.toFixed(1)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 156가지 Feature 분석 결과 */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-6">
          상세 분석 결과 ({featureEntries.length}개 항목)
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {featureEntries.map(([featureKey, featureValue]) => {
            const featureNo = featureKey.replace('feature_', '');
            const currentValue = editedFeatures[featureKey] !== undefined
              ? editedFeatures[featureKey]
              : featureValue;

            return (
              <div key={featureKey} className="p-3 border rounded-lg">
                <div className="flex justify-between items-start mb-2">
                  <label className="text-sm font-medium text-gray-700 flex-grow">
                    Feature {featureNo}
                  </label>
                </div>

                {editMode ? (
                  <input
                    type="text"
                    value={currentValue || ''}
                    onChange={(e) => handleFeatureEdit(featureKey, e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="값을 입력하세요"
                  />
                ) : (
                  <p className="text-gray-900 bg-gray-50 px-3 py-2 rounded-md min-h-[2.5rem] flex items-center">
                    {currentValue || 'N/A'}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default VideoAnalysisDetail;
