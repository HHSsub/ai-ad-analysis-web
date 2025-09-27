import * as ExcelJS from 'exceljs';
import { AnalysisResult } from '@/types/video';
import { Feature } from '@/lib/features/csvLoader';

/**
 * 단순화된 엑셀 워크북 생성 - 156개 피처 데이터 중심
 */
export async function buildSimpleWorkbook(
  results: AnalysisResult[],
  features: Feature[]
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  
  // 1. 메인 시트: 156개 피처 데이터
  await createMainFeatureSheet(workbook, results, features);
  
  // 2. 요약 시트: 간단한 통계만
  await createSummarySheet(workbook, results);
  
  return workbook;
}

/**
 * 메인 시트 - 156개 피처 데이터
 */
async function createMainFeatureSheet(
  workbook: ExcelJS.Workbook,
  results: AnalysisResult[],
  features: Feature[]
): Promise<void> {
  const worksheet = workbook.addWorksheet('156개 피처 분석');
  
  // 헤더 생성
  const headers = [
    'No.',
    '카테고리',
    '피처명',
    ...results.map(r => r.title)
  ];
  
  const headerRow = worksheet.addRow(headers);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  };
  
  // 데이터 행 추가
  features.forEach((feature, index) => {
    const row = [
      feature.No,
      feature.Category,
      feature.Feature
    ];
    
    // 각 영상의 분석 결과 추가
    results.forEach(result => {
      let value = 'N/A';
      
      if (result.features) {
        // 플랫 구조에서 직접 가져오기
        value = result.features[`feature_${feature.No}`] || 'N/A';
      } else if (result.analysis && result.analysis[feature.Category]) {
        // 카테고리 구조에서 가져오기
        value = result.analysis[feature.Category][feature.Feature] || 'N/A';
      }
      
      row.push(value);
    });
    
    const dataRow = worksheet.addRow(row);
    
    // 실패한 값 강조 표시
    row.forEach((cell, cellIndex) => {
      if (cellIndex >= 3) { // 데이터 컬럼만
        const cellValue = String(cell);
        if (cellValue.includes('분석불가') || cellValue.includes('실패')) {
          dataRow.getCell(cellIndex + 1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFE0E0' } // 연한 빨강
          };
        }
      }
    });
  });
  
  // 컬럼 너비 조정
  worksheet.getColumn(1).width = 8;  // No.
  worksheet.getColumn(2).width = 20; // 카테고리
  worksheet.getColumn(3).width = 30; // 피처명
  
  // 영상별 컬럼 너비
  for (let i = 4; i <= 3 + results.length; i++) {
    worksheet.getColumn(i).width = 25;
  }
  
  // 필터 추가
  worksheet.autoFilter = {
    from: 'A1',
    to: `${String.fromCharCode(67 + results.length)}1`
  };
  
  console.log(`✅ 156개 피처 시트 생성 완료`);
}

/**
 * 요약 시트 - 간단한 통계
 */
async function createSummarySheet(
  workbook: ExcelJS.Workbook,
  results: AnalysisResult[]
): Promise<void> {
  const worksheet = workbook.addWorksheet('요약');
  
  // 헤더
  worksheet.addRow(['영상 분석 요약']).font = { bold: true, size: 14 };
  worksheet.addRow([]);
  
  // 기본 통계
  worksheet.addRow(['생성일시', new Date().toLocaleString('ko-KR')]);
  worksheet.addRow(['총 영상 수', results.length]);
  worksheet.addRow(['총 피처 수', '156개']);
  worksheet.addRow([]);
  
  // 영상별 완성도
  worksheet.addRow(['영상별 완성도']).font = { bold: true };
  const completionHeaders = ['영상 제목', 'URL', '완성도(%)', '완료 피처', '미완료 피처', '상태'];
  const headerRow = worksheet.addRow(completionHeaders);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  };
  
  // 통계 계산
  let totalSuccess = 0;
  let totalFailed = 0;
  
  results.forEach(result => {
    const stats = result.completionStats || { 
      completed: 0, 
      incomplete: 156, 
      percentage: 0 
    };
    
    const row = worksheet.addRow([
      result.title,
      result.url,
      stats.percentage,
      stats.completed,
      stats.incomplete,
      result.status === 'completed' ? '완료' : '실패'
    ]);
    
    // 상태에 따른 색상
    if (result.status === 'failed' || stats.percentage < 10) {
      row.getCell(6).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFCCCC' } // 빨강
      };
      totalFailed++;
    } else {
      row.getCell(6).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFCCFFCC' } // 녹색
      };
      totalSuccess++;
    }
  });
  
  worksheet.addRow([]);
  worksheet.addRow(['전체 통계']).font = { bold: true };
  worksheet.addRow(['성공', totalSuccess]);
  worksheet.addRow(['실패', totalFailed]);
  
  const avgCompletion = results.reduce((sum, r) => 
    sum + (r.completionStats?.percentage || 0), 0) / results.length;
  worksheet.addRow(['평균 완성도', `${Math.round(avgCompletion)}%`]);
  
  // 컬럼 너비 조정
  worksheet.getColumn(1).width = 40;
  worksheet.getColumn(2).width = 50;
  worksheet.getColumn(3).width = 15;
  worksheet.getColumn(4).width = 15;
  worksheet.getColumn(5).width = 15;
  worksheet.getColumn(6).width = 10;
  
  console.log(`✅ 요약 시트 생성 완료 - 성공: ${totalSuccess}, 실패: ${totalFailed}`);
}
