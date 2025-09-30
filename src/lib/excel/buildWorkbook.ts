// src/lib/excel/buildWorkbook.ts - 완전한 Excel 워크북 생성
import * as ExcelJS from 'exceljs';
import { loadFeaturesFromCSV } from '@/utils/csvLoader';

// Feature 인터페이스
export interface Feature {
  no: string;
  category: string;
  item: string;
}

// 분석 결과 인터페이스
export interface AnalysisResult {
  id: string;
  title: string;
  url: string;
  notes?: string;
  status: 'completed' | 'failed' | 'incomplete' | 'analyzing';
  analysis?: { [category: string]: { [feature: string]: string } };
  features?: { [key: string]: string };
  completionStats?: {
    completed: number;
    incomplete: number;
    total: number;
    percentage: number;
  };
  scriptLanguage?: string;
  channelTitle?: string;
  geminiStatus?: string;
  youtubeData?: {
    viewCount?: number;
    likeCount?: number;
    commentCount?: number;
    duration?: string;
    publishedAt?: string;
    channelTitle?: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

/**
 * CSV에서 특성 목록 가져오기 (fallback 함수)
 */
function getFeaturesFromCSV(): Feature[] {
  try {
    return loadFeaturesFromCSV();
  } catch (error) {
    console.warn('⚠️ CSV 로드 실패, 기본 특성 목록 사용:', error);
    return [];
  }
}

/**
 * 메인 워크북 생성 함수 - 156개 피처 완전 구현
 */
export async function buildWorkbook(
  results: AnalysisResult[],
  features?: Feature[]
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const featuresList = features || getFeaturesFromCSV();
  
  console.log(`📊 엑셀 워크북 생성 시작: ${results.length}개 영상, ${featuresList.length}개 특성`);
  
  // 메타데이터 설정
  workbook.creator = 'AI 광고 분석 시스템';
  workbook.lastModifiedBy = 'AI 광고 분석 시스템';
  workbook.created = new Date();
  workbook.modified = new Date();
  
  // 단일 시트: 156개 피처 데이터
  const worksheet = workbook.addWorksheet('분석결과_156개특성');
  
  // 헤더 생성
  const headers = [
    'No',
    '영상제목',
    'URL',
    '채널명',
    '상태',
    '완성도(%)',
    'AI상태',
    '자막언어',
    '조회수',
    '좋아요',
    '댓글수',
    '영상길이',
    '게시일',
    '비고',
    '생성일시',
    ...featuresList.map(f => `${f.no}.${f.category}_${f.item}`)
  ];
  
  // 헤더 행 추가
  worksheet.addRow(headers);
  
  // 헤더 스타일 적용
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  };
  
  // 헤더 텍스트 정렬
  headerRow.eachCell((cell) => {
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
  });
  
  // 데이터 행 추가
  results.forEach((result, index) => {
    const row = [
      index + 1,
      result.title || 'N/A',
      result.url || 'N/A',
      result.channelTitle || result.youtubeData?.channelTitle || 'N/A',
      result.status === 'completed' ? '완료' : 
      result.status === 'failed' ? '실패' : 
      result.status === 'incomplete' ? '불완전' : '분석중',
      result.completionStats?.percentage || 0,
      result.geminiStatus || 'N/A',
      result.scriptLanguage || 'N/A',
      result.youtubeData?.viewCount || 0,
      result.youtubeData?.likeCount || 0,
      result.youtubeData?.commentCount || 0,
      result.youtubeData?.duration || 'N/A',
      result.youtubeData?.publishedAt || 'N/A',
      result.notes || '',
      result.createdAt ? new Date(result.createdAt).toLocaleString('ko-KR') : 'N/A'
    ];
    
    // 156개 피처 데이터 추가
    featuresList.forEach(feature => {
      let value = 'N/A';
      
      // features 플랫 구조 우선 확인
      if (result.features && result.features[`feature_${feature.no}`]) {
        value = result.features[`feature_${feature.no}`];
      }
      // analysis 카테고리 구조 확인
      else if (result.analysis && result.analysis[feature.category]) {
        const categoryData = result.analysis[feature.category];
        value = categoryData[feature.item] || 'N/A';
      }
      
      // 값이 객체인 경우 문자열로 변환
      if (typeof value === 'object' && value !== null) {
        value = JSON.stringify(value);
      }
      
      row.push(String(value || 'N/A'));
    });
    
    worksheet.addRow(row);
  });
  
  // 컬럼 너비 자동 조정
  worksheet.columns.forEach((column, index) => {
    if (index === 0) column.width = 5;        // No
    else if (index === 1) column.width = 40;  // 영상제목
    else if (index === 2) column.width = 50;  // URL
    else if (index === 3) column.width = 20;  // 채널명
    else if (index === 4) column.width = 12;  // 상태
    else if (index === 5) column.width = 12;  // 완성도
    else if (index === 6) column.width = 12;  // AI상태
    else if (index === 7) column.width = 12;  // 자막언어
    else if (index === 8) column.width = 15;  // 조회수
    else if (index === 9) column.width = 15;  // 좋아요
    else if (index === 10) column.width = 15; // 댓글수
    else if (index === 11) column.width = 15; // 영상길이
    else if (index === 12) column.width = 20; // 게시일
    else if (index === 13) column.width = 30; // 비고
    else if (index === 14) column.width = 20; // 생성일시
    else column.width = 25;                   // 피처 데이터
  });
  
  // 데이터 행에 테두리 추가
  const totalRows = worksheet.rowCount;
  for (let rowNum = 2; rowNum <= totalRows; rowNum++) {
    const dataRow = worksheet.getRow(rowNum);
    dataRow.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
  }
  
  // 첫 번째 행과 열 고정
  worksheet.views = [
    {
      state: 'frozen',
      xSplit: 3,  // 처음 3개 컬럼 고정 (No, 제목, URL)
      ySplit: 1   // 헤더 행 고정
    }
  ];
  
  console.log(`✅ 엑셀 생성 완료: ${results.length}개 영상, ${featuresList.length}개 피처`);
  
  return workbook;
}

/**
 * 버퍼 생성 함수 - API에서 사용
 */
export async function buildWorkbookBuffer(
  results: AnalysisResult[], 
  features?: Feature[]
): Promise<Buffer> {
  const workbook = await buildWorkbook(results, features);
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as Buffer;
}

/**
 * 단일 영상 상세 분석 워크북 생성
 */
export async function buildDetailedWorkbook(
  result: AnalysisResult,
  features?: Feature[]
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const featuresList = features || getFeaturesFromCSV();
  
  // 메타데이터 설정
  workbook.creator = 'AI 광고 분석 시스템';
  workbook.lastModifiedBy = 'AI 광고 분석 시스템';
  workbook.created = new Date();
  workbook.modified = new Date();
  
  // 영상 정보 시트
  const infoSheet = workbook.addWorksheet('영상정보');
  infoSheet.addRow(['항목', '내용']);
  infoSheet.addRow(['영상 제목', result.title || 'N/A']);
  infoSheet.addRow(['URL', result.url || 'N/A']);
  infoSheet.addRow(['채널명', result.channelTitle || result.youtubeData?.channelTitle || 'N/A']);
  infoSheet.addRow(['분석 상태', result.status === 'completed' ? '완료' : 
                   result.status === 'failed' ? '실패' : 
                   result.status === 'incomplete' ? '불완전' : '분석중']);
  infoSheet.addRow(['완성도(%)', result.completionStats?.percentage || 0]);
  infoSheet.addRow(['AI 상태', result.geminiStatus || 'N/A']);
  infoSheet.addRow(['자막 언어', result.scriptLanguage || 'N/A']);
  infoSheet.addRow(['조회수', result.youtubeData?.viewCount || 0]);
  infoSheet.addRow(['좋아요', result.youtubeData?.likeCount || 0]);
  infoSheet.addRow(['댓글수', result.youtubeData?.commentCount || 0]);
  infoSheet.addRow(['영상 길이', result.youtubeData?.duration || 'N/A']);
  infoSheet.addRow(['게시일', result.youtubeData?.publishedAt || 'N/A']);
  infoSheet.addRow(['비고', result.notes || '']);
  infoSheet.addRow(['생성일시', result.createdAt ? new Date(result.createdAt).toLocaleString('ko-KR') : 'N/A']);
  
  // 헤더 스타일
  const infoHeaderRow = infoSheet.getRow(1);
  infoHeaderRow.font = { bold: true };
  infoHeaderRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  };
  
  // 컬럼 너비 조정
  infoSheet.getColumn(1).width = 20;
  infoSheet.getColumn(2).width = 50;
  
  // 분석 결과 시트
  const analysisSheet = workbook.addWorksheet('분석결과_156개특성');
  analysisSheet.addRow(['번호', '카테고리', '분석 항목', '분석 결과']);
  
  // 헤더 스타일
  const analysisHeaderRow = analysisSheet.getRow(1);
  analysisHeaderRow.font = { bold: true };
  analysisHeaderRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  };
  
  // 156개 특성 데이터 추가
  featuresList.forEach(feature => {
    let value = 'N/A';
    
    // features 플랫 구조 우선 확인
    if (result.features && result.features[`feature_${feature.no}`]) {
      value = result.features[`feature_${feature.no}`];
    }
    // analysis 카테고리 구조 확인
    else if (result.analysis && result.analysis[feature.category]) {
      const categoryData = result.analysis[feature.category];
      value = categoryData[feature.item] || 'N/A';
    }
    
    // 값이 객체인 경우 문자열로 변환
    if (typeof value === 'object' && value !== null) {
      value = JSON.stringify(value);
    }
    
    analysisSheet.addRow([
      feature.no,
      feature.category,
      feature.item,
      String(value || 'N/A')
    ]);
  });
  
  // 컬럼 너비 조정
  analysisSheet.getColumn(1).width = 8;   // 번호
  analysisSheet.getColumn(2).width = 20;  // 카테고리
  analysisSheet.getColumn(3).width = 25;  // 분석 항목
  analysisSheet.getColumn(4).width = 40;  // 분석 결과
  
  // 테두리 추가
  [infoSheet, analysisSheet].forEach(sheet => {
    const totalRows = sheet.rowCount;
    for (let rowNum = 1; rowNum <= totalRows; rowNum++) {
      const row = sheet.getRow(rowNum);
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    }
  });
  
  console.log(`✅ 상세 엑셀 생성 완료: ${featuresList.length}개 특성`);
  
  return workbook;
}

export default buildWorkbook;
