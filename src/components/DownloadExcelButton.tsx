// src/components/DownloadExcelButton.tsx - 완전 수정
"use client";

import React, { useState } from "react";

type Props = {
  items?: any[]; // 다중 영상 분석 결과
  video?: any;   // 단일 영상 분석 결과
  fileName?: string;
  workbookTitle?: string;
  className?: string;
};

export default function DownloadExcelButton({ 
  items, 
  video, 
  fileName, 
  workbookTitle, 
  className 
}: Props) {
  const [loading, setLoading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<string>('');

  const onClick = async () => {
    try {
      setLoading(true);
      setDownloadStatus('엑셀 파일 생성 중...');

      // 데이터 준비
      let requestData: any = {};
      let downloadFileName = fileName;

      if (video && video.analysis) {
        // 단일 영상 케이스
        requestData = { video };
        downloadFileName = downloadFileName || `${video.title}_분석결과.xlsx`;
      } else if (items && items.length > 0) {
        // 다중 영상 케이스
        const validItems = items.filter(item => item && item.analysis);
        if (validItems.length === 0) {
          throw new Error('다운로드할 분석 결과가 없습니다.');
        }
        requestData = { videos: validItems };
        downloadFileName = downloadFileName || `AI광고분석_${validItems.length}개영상.xlsx`;
      } else {
        throw new Error('다운로드할 데이터가 없습니다.');
      }

      console.log(`📥 엑셀 다운로드 시작: ${downloadFileName}`);

      setDownloadStatus('서버에서 파일 생성 중...');

      // 통합된 다운로드 API 호출
      const response = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = '다운로드 실패';
        
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.message || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        
        throw new Error(errorMessage);
      }

      setDownloadStatus('파일 다운로드 중...');

      // Blob으로 응답 받기
      const blob = await response.blob();
      
      if (blob.size === 0) {
        throw new Error('생성된 파일이 비어있습니다.');
      }

      // 다운로드 실행
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = downloadFileName || `analysis-${Date.now()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setDownloadStatus('✅ 다운로드 완료!');
      
      console.log(`✅ 엑셀 다운로드 완료: ${downloadFileName}`);

    } catch (error: any) {
      console.error('❌ 엑셀 다운로드 오류:', error);
      setDownloadStatus('❌ 다운로드 실패');
      
      let errorMessage = '엑셀 다운로드에 실패했습니다.';
      
      if (error.message?.includes('분석 데이터가 없습니다')) {
        errorMessage = '분석 결과가 없습니다. 먼저 영상을 분석해주세요.';
      } else if (error.message?.includes('서버 오류')) {
        errorMessage = '서버에서 파일 생성에 실패했습니다. 잠시 후 다시 시도해주세요.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      alert(errorMessage);
    } finally {
      setLoading(false);
      // 3초 후 상태 메시지 초기화
      setTimeout(() => setDownloadStatus(''), 3000);
    }
  };

  // 버튼 텍스트 결정
  const getButtonText = () => {
    if (loading) {
      return downloadStatus || 'Excel 생성 중...';
    }
    return 'Excel 다운로드';
  };

  // 데이터 개수 확인
  const getDataCount = () => {
    if (video && video.analysis) return 1;
    if (items && items.length > 0) {
      return items.filter(item => item && item.analysis).length;
    }
    return 0;
  };

  const dataCount = getDataCount();

  return (
    <div className="flex flex-col items-center gap-2">
      <button 
        onClick={onClick} 
        disabled={loading || dataCount === 0} 
        className={`${className} ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {getButtonText()}
      </button>
      
      {downloadStatus && (
        <div className={`text-sm ${
          downloadStatus.includes('✅') ? 'text-green-600' : 
          downloadStatus.includes('❌') ? 'text-red-600' : 
          'text-blue-600'
        }`}>
          {downloadStatus}
        </div>
      )}
      
      {!loading && dataCount === 0 && (
        <div className="text-sm text-gray-500">
          다운로드할 분석 결과가 없습니다.
        </div>
      )}
      
      {!loading && dataCount > 0 && (
        <div className="text-sm text-gray-600">
          {dataCount}개 영상 준비됨
        </div>
      )}
    </div>
  );
}
