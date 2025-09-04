'use client';

import React, { useState } from 'react';
import { Play, Upload, Download, Settings } from 'lucide-react';
import VideoInputTable from '@/components/VideoInputTable';
import AnalysisProgress from '@/components/AnalysisProgress';
import VideoList from '@/components/VideoList';
import VideoAnalysisDetail from '@/components/VideoAnalysisDetail';
import { useVideoStore } from '@/store/videoStore';
import toast, { Toaster } from 'react-hot-toast';

export default function HomePage() {
  const [currentView, setCurrentView] = useState<'home' | 'input' | 'analysis'>('home');
  const { isAnalyzing, analyzedVideos, clearAll } = useVideoStore();

  const handleStartAnalysis = () => {
    setCurrentView('input');
  };

  const handleBackToHome = () => {
    setCurrentView('home');
  };

  const handleViewAnalysis = () => {
    if (analyzedVideos.length === 0) {
      toast.error('분석된 영상이 없습니다.');
      return;
    }
    setCurrentView('analysis');
  };

  const handleClearAll = () => {
    if (window.confirm('모든 데이터를 삭제하시겠습니까?')) {
      clearAll();
      setCurrentView('home');
      toast.success('모든 데이터가 삭제되었습니다.');
    }
  };

  if (currentView === 'input') {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900">영상 링크 입력</h1>
            <button
              onClick={handleBackToHome}
              className="px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              ← 홈으로
            </button>
          </div>
          
          {isAnalyzing ? (
            <AnalysisProgress />
          ) : (
            <VideoInputTable />
          )}
        </div>
      </div>
    );
  }

  if (currentView === 'analysis') {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900">분석 결과</h1>
            <div className="flex gap-4">
              <button
                onClick={handleClearAll}
                className="px-4 py-2 text-red-600 hover:text-red-700 transition-colors"
              >
                전체 삭제
              </button>
              <button
                onClick={handleBackToHome}
                className="px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors"
              >
                ← 홈으로
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
              <VideoList />
            </div>
            <div className="lg:col-span-2">
              <VideoAnalysisDetail />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <Toaster position="top-right" />
      
      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold text-gray-900 mb-6">
            YouTube 영상 분석기
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            AI 기반 영상 분석으로 156가지 특징을 자동 추출합니다
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-2xl mx-auto">
            {/* 수집 자동화 버튼 */}
            <div className="bg-white rounded-2xl shadow-lg p-8 text-center relative">
              <div className="absolute top-4 right-4 bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm font-medium">
                개발중
              </div>
              <div className="bg-gray-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <Settings className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">수집 자동화</h3>
              <p className="text-gray-600 mb-6">
                키워드 기반으로 자동으로 영상을 수집하고 분석합니다
              </p>
              <button
                disabled
                className="w-full bg-gray-300 text-gray-500 py-3 px-6 rounded-lg font-medium cursor-not-allowed"
              >
                준비중...
              </button>
            </div>

            {/* 링크 수동 추가 버튼 */}
            <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
              <div className="bg-blue-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                <Upload className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">링크 수동 추가</h3>
              <p className="text-gray-600 mb-6">
                YouTube 링크를 직접 입력하여 영상을 분석합니다
              </p>
              <button
                onClick={handleStartAnalysis}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-6 rounded-lg font-medium transition-colors"
              >
                시작하기
              </button>
            </div>
          </div>
        </div>

        {/* 분석 결과가 있을 때만 표시 */}
        {analyzedVideos.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="bg-green-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
              <Play className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              분석 완료된 영상 {analyzedVideos.length}개
            </h3>
            <p className="text-gray-600 mb-6">
              분석된 결과를 확인하고 Excel 파일로 다운로드하세요
            </p>
            <div className="flex gap-4 justify-center">
              <button
                onClick={handleViewAnalysis}
                className="bg-green-600 hover:bg-green-700 text-white py-3 px-6 rounded-lg font-medium transition-colors"
              >
                결과 보기
              </button>
              <button
                onClick={() => {
                  // Excel 다운로드 기능은 추후 구현
                  toast.success('Excel 다운로드 기능 준비중입니다.');
                }}
                className="bg-gray-600 hover:bg-gray-700 text-white py-3 px-6 rounded-lg font-medium transition-colors flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Excel 다운로드
              </button>
            </div>
          </div>
        )}

        {/* 기능 소개 */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="text-center">
            <div className="bg-blue-100 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-4">
              <span className="text-blue-600 font-bold">1</span>
            </div>
            <h4 className="text-lg font-semibold text-gray-900 mb-2">영상 입력</h4>
            <p className="text-gray-600">최대 30개의 YouTube 링크를 한번에 입력할 수 있습니다</p>
          </div>
          
          <div className="text-center">
            <div className="bg-green-100 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-4">
              <span className="text-green-600 font-bold">2</span>
            </div>
            <h4 className="text-lg font-semibold text-gray-900 mb-2">AI 분석</h4>
            <p className="text-gray-600">YouTube API와 Gemini AI로 156가지 특징을 자동 분석합니다</p>
          </div>
          
          <div className="text-center">
            <div className="bg-purple-100 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-4">
              <span className="text-purple-600 font-bold">3</span>
            </div>
            <h4 className="text-lg font-semibold text-gray-900 mb-2">결과 활용</h4>
            <p className="text-gray-600">분석 결과를 확인하고 Excel 파일로 다운로드하세요</p>
          </div>
        </div>

        {/* 자동 업로드 버튼 (미구현) */}
        <div className="mt-12 text-center">
          <button
            disabled
            className="bg-gray-300 text-gray-500 py-2 px-6 rounded-lg font-medium cursor-not-allowed"
          >
            자동업로드 (구현중)
          </button>
        </div>
      </div>
    </div>
  );
}