// src/components/DriveUploadButton.tsx - 완전 수정
"use client";

import React, { useState } from "react";

type Props = {
  items: any[]; // 분석 결과 배열
  fileName?: string;
  workbookTitle?: string;
  className?: string;
};

export default function DriveUploadButton({ items, fileName, workbookTitle, className }: Props) {
  const [loading, setLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>('');

  const onClick = async () => {
    try {
      setLoading(true);
      setUploadStatus('Drive 업로드 준비 중...');

      // 유효한 분석 결과만 필터링
      const validItems = items.filter(item => item && item.analysis);
      
      if (validItems.length === 0) {
        throw new Error('업로드할 분석 결과가 없습니다.');
      }

      console.log(`📤 Drive 업로드 시작: ${validItems.length}개 항목`);

      // CSV 형태로 데이터 변환
      const csvData = validItems.map((item, index) => {
        const baseData = {
          'No': index + 1,
          '영상 제목': item.title || 'N/A',
          'URL': item.url || 'N/A',
          '비고': item.notes || '',
          '스크립트 언어': item.scriptLanguage || 'N/A',
          '완성도(%)': item.completionStats?.percentage || 0
        };

        // 156개 특성 데이터 추가
        const featuresData: { [key: string]: string } = {};
        
        if (item.analysis) {
          for (const category in item.analysis) {
            for (const feature in item.analysis[category]) {
              const key = `${category}_${feature}`;
              featuresData[key] = item.analysis[category][feature] || 'N/A';
            }
          }
        }

        return { ...baseData, ...featuresData };
      });

      const timestamp = new Date().toISOString().split('T')[0];
      const uploadFileName = fileName || `AI광고분석_${validItems.length}개영상_${timestamp}.csv`;

      setUploadStatus('Google Drive에 업로드 중...');

      // Drive 업로드 요청
      const response = await fetch('/api/drive/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: uploadFileName,
          data: csvData,
          dataType: 'csv'
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || result.details || 'Drive 업로드 실패');
      }

      if (result.success) {
        setUploadStatus('✅ 업로드 완료!');
        
        // 성공 메시지 표시
        const message = `Google Drive 업로드 완료!\n파일명: ${uploadFileName}\n${validItems.length}개 영상 분석 결과`;
        alert(message);

        // 업로드된 파일 링크가 있으면 새 탭에서 열기
        if (result.file?.webViewLink) {
          window.open(result.file.webViewLink, '_blank');
        }
      } else {
        throw new Error(result.message || 'Drive 업로드 실패');
      }

    } catch (error: any) {
      console.error('❌ Drive 업로드 오류:', error);
      setUploadStatus('❌ 업로드 실패');
      
      let errorMessage = '드라이브 업로드에 실패했습니다.';
      
      if (error.message?.includes('폴더를 찾을 수 없습니다')) {
        errorMessage = '폴더 접근 권한이 없습니다. 관리자에게 문의하세요.';
      } else if (error.message?.includes('권한 부족')) {
        errorMessage = 'Google Drive 권한이 부족합니다. 관리자에게 문의하세요.';
      } else if (error.message?.includes('인증 실패')) {
        errorMessage = 'Google Drive 인증에 실패했습니다. 관리자에게 문의하세요.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      alert(errorMessage);
    } finally {
      setLoading(false);
      // 3초 후 상태 메시지 초기화
      setTimeout(() => setUploadStatus(''), 3000);
    }
  };

  const buttonText = loading 
    ? (uploadStatus || 'Drive 업로드 중...') 
    : 'Google Drive 업로드';

  return (
    <div className="flex flex-col items-center gap-2">
      <button 
        onClick={onClick} 
        disabled={loading || items.length === 0} 
        className={`${className} ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {buttonText}
      </button>
      
      {uploadStatus && (
        <div className={`text-sm ${
          uploadStatus.includes('✅') ? 'text-green-600' : 
          uploadStatus.includes('❌') ? 'text-red-600' : 
          'text-blue-600'
        }`}>
          {uploadStatus}
        </div>
      )}
      
      {!loading && items.length === 0 && (
        <div className="text-sm text-gray-500">
          업로드할 분석 결과가 없습니다.
        </div>
      )}
    </div>
  );
}
