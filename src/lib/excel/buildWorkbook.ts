// src/lib/excel/buildWorkbook.ts - 156개 특징 완전 지원 Excel 빌더
import * as ExcelJS from 'exceljs';
import * as path from 'path';
import * as fs from 'fs';

export interface AnalysisResult {
  title: string;
  url: string;
  status: string;
  analysis: Record<string, Record<string, string>>;
  completionStats?: {
    completed: number;
    incomplete: number;
    total: number;
    percentage: number;
  };
  notes?: string;
  scriptLanguage?: string;
  id?: string;
  thumbnailUrl?: string;
  channelTitle?: string;
  publishedAt?: string;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  duration?: string;
  scores?: {
    quantitative: number;
    qualitative: number;
    hybrid: number;
    [key: string]: number;
  };
}

export interface Feature {
  No: string;
  Category: string;
  Feature: string;
  Value?: string;
}

/**
 * CSV에서 156개 특징 완전 로딩
 */
function getFeaturesFromCSV(): Feature[] {
  const filePath = path.join(process.cwd(), 'src', 'data', 'output_features.csv');
  
  try {
    let fileContent = fs.readFileSync(filePath, 'utf-8');
    
    // BOM 제거
    if (fileContent.charCodeAt(0) === 0xFEFF) {
      fileContent = fileContent.slice(1);
    }
    
    const lines = fileContent.split('\n').filter(line => line.trim());
    
    // 헤더 스킵
    const dataLines = lines.slice(1);
    
    const features: Feature[] = [];
    
    for (const line of dataLines) {
      if (!line.trim()) continue;
      
      const columns = parseCsvLine(line);
      
      if (columns.length >= 3) {
        const [no, category, feature] = columns;
        
        // 유효한 데이터만 추가 (빈 행 제외)
        if (no && category && feature) {
          features.push({
            No: no.trim(),
            Category: category.trim(),
            Feature: feature.trim(),
            Value: columns[3] || ''
          });
        }
      }
    }
    
    console.log(`📊 CSV에서 ${features.length}개 특징 로드 완료`);
    
    return features;
    
  } catch (error: any) {
    console.error('❌ CSV 파일 로딩 실패:', error.message);
    
    // 실패 시 하드코딩된 156개 특징 반환
    return getHardcodedFeatures();
  }
}

/**
 * CSV 라인 파싱 (따옴표 처리)
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

/**
 * 하드코딩된 156개 특징 (CSV 로딩 실패 시 폴백)
 */
function getHardcodedFeatures(): Feature[] {
  return [
    // 인물 분석 (1-29)
    { No: "1", Category: "인물 분석", Feature: "성별 추정" },
    { No: "2", Category: "인물 분석", Feature: "연령 추정" },
    { No: "3", Category: "인물 분석", Feature: "인종 추정" },
    { No: "4", Category: "인물 분석", Feature: "피부톤" },
    { No: "5", Category: "인물 분석", Feature: "얼굴형" },
    { No: "6", Category: "인물 분석", Feature: "머리 길이" },
    { No: "7", Category: "인물 분석", Feature: "머리 색상" },
    { No: "8", Category: "인물 분석", Feature: "수염 유무" },
    { No: "9", Category: "인물 분석", Feature: "표정 감정" },
    { No: "10", Category: "인물 분석", Feature: "시선 방향" },
    { No: "11", Category: "인물 분석", Feature: "손 위치" },
    { No: "12", Category: "인물 분석", Feature: "손 제스처 유형" },
    { No: "13", Category: "인물 분석", Feature: "다리 자세" },
    { No: "14", Category: "인물 분석", Feature: "허리/어깨/상체 각도" },
    { No: "15", Category: "인물 분석", Feature: "점프/앉음 여부" },
    { No: "16", Category: "인물 분석", Feature: "체형" },
    { No: "17", Category: "인물 분석", Feature: "키 범위 추정" },
    { No: "18", Category: "인물 분석", Feature: "안경 착용 여부" },
    { No: "19", Category: "인물 분석", Feature: "모자/후드 착용 여부" },
    { No: "20", Category: "인물 분석", Feature: "이어폰/헤드셋 유무" },
    { No: "21", Category: "인물 분석", Feature: "외형적 특징(점, 흉터 등)" },
    { No: "22", Category: "인물 분석", Feature: "인물 수" },
    { No: "23", Category: "인물 분석", Feature: "인물 간 거리 및 상호작용 여부" },
    { No: "24", Category: "인물 분석", Feature: "인물 등장 패턴(반복 등장, 등장 타이밍)" },
    { No: "25", Category: "인물 분석", Feature: "인물 점유율(전신/반신/얼굴)" },
    { No: "26", Category: "인물 분석", Feature: "인물과 카메라 거리" },
    { No: "27", Category: "인물 분석", Feature: "특정 포즈 반복 여부" },
    { No: "28", Category: "인물 분석", Feature: "캐릭터/코스튬/가려짐(익명성) 여부" },
    { No: "29", Category: "인물 분석", Feature: "음성 동기화 유무" },
    
    // 의상 분석 (30-40)
    { No: "30", Category: "의상 분석", Feature: "상의 종류, 색상, 재질, 패턴, 로고/텍스트" },
    { No: "31", Category: "의상 분석", Feature: "하의 종류, 색상, 재질, 패턴" },
    { No: "32", Category: "의상 분석", Feature: "신발 종류, 색상, 착용 상태" },
    { No: "33", Category: "의상 분석", Feature: "모자/헤어밴드, 귀걸이/목걸이, 시계/팔찌" },
    { No: "34", Category: "의상 분석", Feature: "소품 존재 여부" },
    { No: "35", Category: "의상 분석", Feature: "계절감" },
    { No: "36", Category: "의상 분석", Feature: "트렌디함" },
    { No: "37", Category: "의상 분석", Feature: "복장 일관성" },
    { No: "38", Category: "의상 분석", Feature: "복장-감정/무드톤 조화" },
    { No: "39", Category: "의상 분석", Feature: "브랜드 패션 여부" },
    { No: "40", Category: "의상 분석", Feature: "유니폼/컨셉 의상 여부" },
    
    // 배경 분석 (41-59)
    { No: "41", Category: "배경 분석", Feature: "실내/실외" },
    { No: "42", Category: "배경 분석", Feature: "장소 유형 및 세부 공간 추정" },
    { No: "43", Category: "배경 분석", Feature: "배경 크기 및 점유율" },
    { No: "44", Category: "배경 분석", Feature: "벽 색상" },
    { No: "45", Category: "배경 분석", Feature: "바닥 재질" },
    { No: "46", Category: "배경 분석", Feature: "조명 기구 유무" },
    { No: "47", Category: "배경 분석", Feature: "식물/창문 유무" },
    { No: "48", Category: "배경 분석", Feature: "타겟 국가" },
    { No: "49", Category: "배경 분석", Feature: "국가 문화 코드" },
    { No: "50", Category: "배경 분석", Feature: "배경 언어 감지" },
    { No: "51", Category: "배경 분석", Feature: "계절감/날씨/시간대 추정" },
    { No: "52", Category: "배경 분석", Feature: "배경 흐림(Out-of-focus) 여부" },
    { No: "53", Category: "배경 분석", Feature: "오브젝트 수 및 정돈/혼란도" },
    { No: "54", Category: "배경 분석", Feature: "동선 구조" },
    { No: "55", Category: "배경 분석", Feature: "층고 추정" },
    { No: "56", Category: "배경 분석", Feature: "배경 이동 유무 및 총 씬 수" },
    { No: "57", Category: "배경 분석", Feature: "색상 대비" },
    { No: "58", Category: "배경 분석", Feature: "공간 깊이감" },
    { No: "59", Category: "배경 분석", Feature: "움직이는 배경" },
    
    // 제품 분석 (60-76)
    { No: "60", Category: "제품 분석", Feature: "제품 존재 유무 및 카테고리" },
    { No: "61", Category: "제품 분석", Feature: "제품 위치, 색상, 포장 상태" },
    { No: "62", Category: "제품 분석", Feature: "제품 사용/시연 여부" },
    { No: "63", Category: "제품 분석", Feature: "브랜드명/로고 노출" },
    { No: "64", Category: "제품 분석", Feature: "기타 오브젝트 수" },
    { No: "65", Category: "제품 분석", Feature: "인물-제품 인터랙션 여부" },
    { No: "66", Category: "제품 분석", Feature: "브랜드 소품 존재" },
    { No: "67", Category: "제품 분석", Feature: "색상 매칭 여부" },
    { No: "68", Category: "제품 분석", Feature: "제품 지속 시간 및 등장 타이밍" },
    { No: "69", Category: "제품 분석", Feature: "전면/후면 노출" },
    { No: "70", Category: "제품 분석", Feature: "제품 중심 컷 비중" },
    { No: "71", Category: "제품 분석", Feature: "제품 문구/코드 유무" },
    { No: "72", Category: "제품 분석", Feature: "포커스 심도" },
    { No: "73", Category: "제품 분석", Feature: "배경 대비" },
    { No: "74", Category: "제품 분석", Feature: "오브젝트 애니메이션" },
    { No: "75", Category: "제품 분석", Feature: "오브젝트 반복" },
    { No: "76", Category: "제품 분석", Feature: "제품 다양성" },
    
    // 연출/편집 분석 (77-99)
    { No: "77", Category: "연출/편집 분석", Feature: "앵글 종류(하이/로우/아이 레벨)" },
    { No: "78", Category: "연출/편집 분석", Feature: "무빙 방식(패닝/틸트/줌)" },
    { No: "79", Category: "연출/편집 분석", Feature: "카메라 흔들림 여부" },
    { No: "80", Category: "연출/편집 분석", Feature: "컷 전환 기법 및 화면 전환 속도" },
    { No: "81", Category: "연출/편집 분석", Feature: "컷 길이, 슬로우모션 여부" },
    { No: "82", Category: "연출/편집 분석", Feature: "시점 구성 및 시선 유도 구조" },
    { No: "83", Category: "연출/편집 분석", Feature: "영상 연속성 여부" },
    { No: "84", Category: "연출/편집 분석", Feature: "필터 사용 및 색보정 톤" },
    { No: "85", Category: "연출/편집 분석", Feature: "명도/채도 및 색상 대비" },
    { No: "86", Category: "연출/편집 분석", Feature: "브랜드 톤 일치" },
    { No: "87", Category: "연출/편집 분석", Feature: "광원 위치, 역광, 그림자 활용" },
    { No: "88", Category: "연출/편집 분석", Feature: "조명 개수" },
    { No: "89", Category: "연출/편집 분석", Feature: "시네마틱/틱톡식 편집 여부" },
    { No: "90", Category: "연출/편집 분석", Feature: "쇼츠형 레이아웃" },
    { No: "91", Category: "연출/편집 분석", Feature: "다중 씬 병렬" },
    { No: "92", Category: "연출/편집 분석", Feature: "장면 밀도" },
    { No: "93", Category: "연출/편집 분석", Feature: "인물 교체 비율" },
    { No: "94", Category: "연출/편집 분석", Feature: "오프닝 클립/로고 시작 타이밍" },
    { No: "95", Category: "연출/편집 분석", Feature: "이펙트 사용" },
    { No: "96", Category: "연출/편집 분석", Feature: "클로즈업/롱샷 비율" },
    { No: "97", Category: "연출/편집 분석", Feature: "시각적 일관성" },
    { No: "98", Category: "연출/편집 분석", Feature: "장면 리듬" },
    { No: "99", Category: "연출/편집 분석", Feature: "서브컬처 스타일 요소" },
    
    // 사운드 분석 (100-111)
    { No: "100", Category: "사운드 분석", Feature: "BGM 유무, 장르, 분위기, 볼륨 변화" },
    { No: "101", Category: "사운드 분석", Feature: "감정 고조 포인트" },
    { No: "102", Category: "사운드 분석", Feature: "효과음 유무, 종류, 출처" },
    { No: "103", Category: "사운드 분석", Feature: "발화 유무, 화자 수, 화자 감정/말투" },
    { No: "104", Category: "사운드 분석", Feature: "사운드 시점 연동 및 싱크 오류 여부" },
    { No: "105", Category: "사운드 분석", Feature: "사운드 공백 존재" },
    { No: "106", Category: "사운드 분석", Feature: "영상-사운드 일치도" },
    { No: "107", Category: "사운드 분석", Feature: "전체 감정 톤 및 감정 전환 구간" },
    { No: "108", Category: "사운드 분석", Feature: "클라이맥스 사운드" },
    { No: "109", Category: "사운드 분석", Feature: "인물-사운드 일치" },
    { No: "110", Category: "사운드 분석", Feature: "공간감/ASMR 효과" },
    { No: "111", Category: "사운드 분석", Feature: "사운드 중심 연출 여부" },
    
    // 텍스트/자막 분석 (112-122)
    { No: "112", Category: "텍스트/자막 분석", Feature: "자막 유무, 색상, 언어, 위치, 애니메이션" },
    { No: "113", Category: "텍스트/자막 분석", Feature: "로고 유무, 브랜드 컬러 사용" },
    { No: "114", Category: "텍스트/자막 분석", Feature: "슬로건 유무" },
    { No: "115", Category: "텍스트/자막 분석", Feature: "키워드/가격/할인 정보 노출 및 강조" },
    { No: "116", Category: "텍스트/자막 분석", Feature: "CTA 문구" },
    { No: "117", Category: "텍스트/자막 분석", Feature: "텍스트 강조 스타일 및 이모지 활용" },
    { No: "118", Category: "텍스트/자막 분석", Feature: "키네틱 타이포 여부" },
    { No: "119", Category: "텍스트/자막 분석", Feature: "텍스트 크기 변화" },
    { No: "120", Category: "텍스트/자막 분석", Feature: "배경 텍스트" },
    { No: "121", Category: "텍스트/자막 분석", Feature: "제품 문구" },
    { No: "122", Category: "텍스트/자막 분석", Feature: "해시태그/링크 정보 노출" },
    
    // 스토리 구조 분석 (123-141)
    { No: "123", Category: "스토리 구조 분석", Feature: "인트로/클라이맥스/결말 구성 유무" },
    { No: "124", Category: "스토리 구조 분석", Feature: "스토리 구조 존재 여부" },
    { No: "125", Category: "스토리 구조 분석", Feature: "무드/감정 변화 구간 수 및 곡선" },
    { No: "126", Category: "스토리 구조 분석", Feature: "컷 간 분위기 일관성" },
    { No: "127", Category: "스토리 구조 분석", Feature: "인물 교체 여부" },
    { No: "128", Category: "스토리 구조 분석", Feature: "반복 등장 요소/패턴" },
    { No: "129", Category: "스토리 구조 분석", Feature: "시선 유도 성공률" },
    { No: "130", Category: "스토리 구조 분석", Feature: "메타포 사용" },
    { No: "131", Category: "스토리 구조 분석", Feature: "공감/유머/반전 요소" },
    { No: "132", Category: "스토리 구조 분석", Feature: "스토리텔링 강도" },
    { No: "133", Category: "스토리 구조 분석", Feature: "총 컷 수" },
    { No: "134", Category: "스토리 구조 분석", Feature: "평균 컷 길이" },
    { No: "135", Category: "스토리 구조 분석", Feature: "장면 전환 속도" },
    { No: "136", Category: "스토리 구조 분석", Feature: "장소 수" },
    { No: "137", Category: "스토리 구조 분석", Feature: "인물 수 변화" },
    { No: "138", Category: "스토리 구조 분석", Feature: "색상/사운드/표정 변화 흐름" },
    { No: "139", Category: "스토리 구조 분석", Feature: "브랜드 정체성 일치도" },
    { No: "140", Category: "스토리 구조 분석", Feature: "메시지 흐름 자연스러움" },
    { No: "141", Category: "스토리 구조 분석", Feature: "스크롤 정지력(1초 시선 포착)" },
    
    // 유튜브 성과 분석 (142-152)
    { No: "142", Category: "유튜브 성과 분석", Feature: "댓글 감정 분석(긍/부정/중립) 및 언어 감지" },
    { No: "143", Category: "유튜브 성과 분석", Feature: "댓글 키워드/반복 단어 분석" },
    { No: "144", Category: "유튜브 성과 분석", Feature: "브랜드 인식/구매 의도 표현 감지" },
    { No: "145", Category: "유튜브 성과 분석", Feature: "악플/비판 유무" },
    { No: "146", Category: "유튜브 성과 분석", Feature: "유머/밈 요소 여부" },
    { No: "147", Category: "유튜브 성과 분석", Feature: "콘텐츠에 대한 칭찬/소비자 니즈 추론" },
    { No: "148", Category: "유튜브 성과 분석", Feature: "유입 키워드 예측" },
    { No: "149", Category: "유튜브 성과 분석", Feature: "설명란 링크(CTA) 분석" },
    { No: "150", Category: "유튜브 성과 분석", Feature: "썸네일 클릭 유도력" },
    { No: "151", Category: "유튜브 성과 분석", Feature: "채널 내 다른 영상 연관도" },
    { No: "152", Category: "유튜브 성과 분석", Feature: "영상 트렌드 속성 여부" },
    
    // 종합 분석 (153-156)
    { No: "153", Category: "종합 분석", Feature: "산업" },
    { No: "154", Category: "종합 분석", Feature: "핵심 타겟 (Core Target Audience)" },
    { No: "155", Category: "종합 분석", Feature: "영상 목적 (브랜딩 or 판매 전환)" },
    { No: "156", Category: "종합 분석", Feature: "전체 영상 길이" }
  ];
}

/**
 * 156개 특징을 모두 포함한 Excel 워크북 생성
 */
export async function buildWorkbookBuffer(
  analysisResults: AnalysisResult[], 
  workbookTitle: string = 'YouTube Analysis Results'
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  
  // 워크북 메타데이터 설정
  workbook.creator = 'YouTube AI Analyzer';
  workbook.lastModifiedBy = 'YouTube AI Analyzer';
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.title = workbookTitle;
  workbook.description = `YouTube 영상 AI 분석 결과 (156개 특징 완전 분석)`;
  
  // 전체 156개 특징 로드
  const allFeatures = getFeaturesFromCSV();
  console.log(`📊 Excel 생성: ${allFeatures.length}개 특징, ${analysisResults.length}개 영상`);
  
  // 1. 요약 시트 생성
  await createSummarySheet(workbook, analysisResults);
  
  // 2. 156개 특징 상세 분석 시트 생성
  await createDetailedAnalysisSheet(workbook, analysisResults, allFeatures);
  
  // 3. 점수 비교 시트 생성
  await createScoreComparisonSheet(workbook, analysisResults);
  
  // 4. 카테고리별 분석 시트 생성
  await createCategoryAnalysisSheet(workbook, analysisResults, allFeatures);
  
  // 5. 메타데이터 시트 생성
  await createMetadataSheet(workbook, analysisResults, allFeatures);
  
  // Buffer로 변환
  const buffer = await workbook.xlsx.writeBuffer();
  console.log(`✅ Excel 워크북 생성 완료: ${(buffer as any).length} bytes`);
  
  return buffer as any;
}

/**
 * 1. 요약 시트 - 핵심 정보 및 점수
 */
async function createSummarySheet(workbook: ExcelJS.Workbook, results: AnalysisResult[]): Promise<void> {
  const worksheet = workbook.addWorksheet('요약', {
    views: [{ state: 'frozen', ySplit: 1 }]
  });
  
  // 헤더 설정
  const headers = [
    '순번', '영상 제목', 'URL', '채널명', '게시일', 
    '조회수', '좋아요', '댓글수', '길이', '분석 언어',
    '완성도(%)', '정량 점수', '정성 점수', '하이브리드 점수', '비고'
  ];
  
  const headerRow = worksheet.addRow(headers);
  
  // 헤더 스타일링
  headerRow.eachCell((cell, colNumber) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    };
    cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
  });
  
  // 데이터 행 추가
  results.forEach((result, index) => {
    const row = worksheet.addRow([
      index + 1,
      result.title || '',
      result.url || '',
      result.channelTitle || '',
      result.publishedAt || '',
      result.viewCount || 0,
      result.likeCount || 0,
      result.commentCount || 0,
      result.duration || '',
      result.scriptLanguage || 'none',
      result.completionStats?.percentage || 0,
      result.scores?.quantitative || 0,
      result.scores?.qualitative || 0,
      result.scores?.hybrid || 0,
      result.notes || ''
    ]);
    
    // 데이터 행 스타일링
    row.eachCell((cell, colNumber) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        right: { style: 'thin', color: { argb: 'FFD0D0D0' } }
      };
      
      // 완성도에 따른 색상 구분
      if (colNumber === 11) { // 완성도 컬럼
        const percentage = result.completionStats?.percentage || 0;
        if (percentage >= 90) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF92D050' } };
        } else if (percentage >= 70) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
        } else if (percentage >= 50) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC000' } };
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF6B6B' } };
        }
      }
    });
  });
  
  // 컬럼 너비 자동 조정
  worksheet.columns.forEach((column, index) => {
    if (index === 1) column.width = 40; // 제목
    else if (index === 2) column.width = 50; // URL
    else if (index === 14) column.width = 30; // 비고
    else column.width = 12;
  });
  
  console.log('📄 요약 시트 생성 완료');
}

/**
 * 2. 상세 분석 시트 - 156개 특징 완전 포함
 */
async function createDetailedAnalysisSheet(
  workbook: ExcelJS.Workbook, 
  results: AnalysisResult[], 
  features: Feature[]
): Promise<void> {
  const worksheet = workbook.addWorksheet('상세 분석 (156개 특징)', {
    views: [{ state: 'frozen', ySplit: 2, xSplit: 3 }]
  });
  
  // 헤더 1행: 영상 제목들
  const titleRow = ['No.', '카테고리', '분석 항목'];
  results.forEach(result => {
    titleRow.push(result.title.substring(0, 30) + (result.title.length > 30 ? '...' : ''));
  });
  worksheet.addRow(titleRow);
  
  // 헤더 2행: URL들
  const urlRow = ['', '', ''];
  results.forEach(result => {
    urlRow.push(result.url);
  });
  worksheet.addRow(urlRow);
  
  // 156개 특징 데이터 행 추가 (모든 특징 완전 포함)
  features.forEach((feature, featureIndex) => {
    const row = [
      feature.No,
      feature.Category,
      feature.Feature
    ];
    
    // 각 영상별 해당 특징 값 추가
    results.forEach(result => {
      let value = '';
      
      if (result.analysis) {
        // 카테고리에서 특징 찾기
        const categoryData = result.analysis[feature.Category];
        if (categoryData && categoryData[feature.Feature]) {
          value = categoryData[feature.Feature];
        }
      }
      
      row.push(value);
    });
    
    const dataRow = worksheet.addRow(row);
    
    // 행 스타일링
    dataRow.eachCell((cell, colNumber) => {
      if (colNumber <= 3) {
        // 특징 정보 컬럼 (No, 카테고리, 항목)
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF2F2F2' }
        };
        cell.font = { bold: colNumber === 2 }; // 카테고리만 볼드
      }
      
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
      };
      
      cell.alignment = { 
        vertical: 'middle', 
        wrapText: true,
        horizontal: colNumber <= 3 ? 'left' : 'center'
      };
    });
    
    // 카테고리별 색상 구분
    const categoryColors: Record<string, string> = {
      '인물 분석': 'FFEFF7FF',
      '의상 분석': 'FFF0FFF0',
      '배경 분석': 'FFFFF0F0',
      '제품 분석': 'FFFFF8DC',
      '연출/편집 분석': 'FFF5F0FF',
      '사운드 분석': 'FFFFE4E1',
      '텍스트/자막 분석': 'FFE0FFFF',
      '스토리 구조 분석': 'FFFFEFD5',
      '유튜브 성과 분석': 'FFFFE4B5',
      '종합 분석': 'FFF0F8FF'
    };
    
    const bgColor = categoryColors[feature.Category] || 'FFFFFFFF';
    dataRow.getCell(2).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: bgColor }
    };
  });
  
  // 컬럼 너비 조정
  worksheet.getColumn(1).width = 5;  // No.
  worksheet.getColumn(2).width = 20; // 카테고리
  worksheet.getColumn(3).width = 35; // 분석 항목
  
  // 영상별 컬럼 너비
  for (let i = 4; i <= 3 + results.length; i++) {
    worksheet.getColumn(i).width = 25;
  }
  
  // 헤더 스타일링
  const headerRow1 = worksheet.getRow(1);
  const headerRow2 = worksheet.getRow(2);
  
  [headerRow1, headerRow2].forEach(row => {
    row.eachCell(cell => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' }
      };
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'medium' },
        left: { style: 'medium' },
        bottom: { style: 'medium' },
        right: { style: 'medium' }
      };
    });
  });
  
  console.log(`📄 상세 분석 시트 생성 완료: ${features.length}개 특징 (완전 포함)`);
}

/**
 * 3. 점수 비교 시트
 */
async function createScoreComparisonSheet(workbook: ExcelJS.Workbook, results: AnalysisResult[]): Promise<void> {
  const worksheet = workbook.addWorksheet('점수 비교', {
    views: [{ state: 'frozen', ySplit: 1 }]
  });
  
  // 헤더
  const headers = [
    '순위', '영상 제목', 'URL', '하이브리드 점수', '정량 점수', '정성 점수',
    '관심도 지수', '유지력 지수', '성장 지수',
    '오프닝 훅', '브랜드 전달', '스토리 구조', '시각적 완성도',
    '음향 설득력', '차별성/독창성', '메시지-타겟 적합도', 'CTA 효율성'
  ];
  
  const headerRow = worksheet.addRow(headers);
  
  // 헤더 스타일링
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF70AD47' } };
    cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  
  // 점수별 정렬
  const sortedResults = [...results].sort((a, b) => 
    (b.scores?.hybrid || 0) - (a.scores?.hybrid || 0)
  );
  
  // 데이터 행 추가
  sortedResults.forEach((result, index) => {
    const scores = result.scores || {} as any;
    
    const row = worksheet.addRow([
      index + 1,
      result.title,
      result.url,
      scores.hybrid || 0,
      scores.quantitative || 0,
      scores.qualitative || 0,
      scores.interest_index || 0,
      scores.retention_index || 0,
      scores.growth_index || 0,
      scores.opening_hook || 0,
      scores.brand_delivery || 0,
      scores.story_structure || 0,
      scores.visual_quality || 0,
      scores.audio_persuasion || 0,
      scores.uniqueness || 0,
      scores.target_match || 0,
      scores.cta_efficiency || 0
    ]);
    
    // 점수별 색상 구분
    row.eachCell((cell, colNumber) => {
      if (colNumber > 3 && colNumber <= headers.length) {
        const score = parseFloat(cell.value as string) || 0;
        
        if (score >= 80) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF92D050' } };
        } else if (score >= 60) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
        } else if (score >= 40) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC000' } };
        } else {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF6B6B' } };
        }
      }
      
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });
  });
  
  // 컬럼 너비 조정
  worksheet.getColumn(1).width = 6;  // 순위
  worksheet.getColumn(2).width = 40; // 제목
  worksheet.getColumn(3).width = 50; // URL
  
  // 점수 컬럼들
  for (let i = 4; i <= headers.length; i++) {
    worksheet.getColumn(i).width = 12;
  }
  
  console.log('📄 점수 비교 시트 생성 완료');
}

/**
 * 4. 카테고리별 분석 시트 (156개 특징 완전 분류)
 */
async function createCategoryAnalysisSheet(
  workbook: ExcelJS.Workbook, 
  results: AnalysisResult[], 
  features: Feature[]
): Promise<void> {
  // 카테고리별 그룹화 (156개 특징 완전 분류)
  const categoriesMap = new Map<string, Feature[]>();
  features.forEach(feature => {
    if (!categoriesMap.has(feature.Category)) {
      categoriesMap.set(feature.Category, []);
    }
    categoriesMap.get(feature.Category)!.push(feature);
  });
  
  const worksheet = workbook.addWorksheet('카테고리별 분석');
  
  let currentRow = 1;
  
  // 각 카테고리별로 섹션 생성 (10개 카테고리 완전 포함)
  for (const [categoryName, categoryFeatures] of Array.from(categoriesMap)) {
    // 카테고리 헤더
    const categoryHeaderRow = worksheet.getRow(currentRow);
    categoryHeaderRow.getCell(1).value = `${categoryName} (${categoryFeatures.length}개 특징)`;
    categoryHeaderRow.getCell(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF305496' }
    };
    categoryHeaderRow.getCell(1).font = {
      color: { argb: 'FFFFFFFF' },
      bold: true,
      size: 14
    };
    
    // 카테고리 헤더를 영상 수만큼 병합
    worksheet.mergeCells(currentRow, 1, currentRow, 3 + results.length);
    currentRow++;
    
    // 특징 헤더
    const featureHeaders = ['No.', '분석 항목', '완성률'];
    results.forEach(result => {
      featureHeaders.push(result.title.substring(0, 20) + '...');
    });
    
    const featureHeaderRow = worksheet.addRow(featureHeaders);
    featureHeaderRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
      cell.font = { bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    currentRow++;
    
    // 카테고리 내 특징들 (완전 포함)
    categoryFeatures.forEach(feature => {
      const row = [feature.No, feature.Feature];
      
      // 완성률 계산
      let completedCount = 0;
      const values: string[] = [];
      
      results.forEach(result => {
        let value = '';
        if (result.analysis?.[categoryName]?.[feature.Feature]) {
          value = result.analysis[categoryName][feature.Feature];
          if (value && value.trim() !== '' && value.trim() !== '없음' && value.trim() !== 'N/A') {
            completedCount++;
          }
        }
        values.push(value);
      });
      
      const completionRate = results.length > 0 ? Math.round((completedCount / results.length) * 100) : 0;
      row.push(`${completionRate}%`);
      
      // 각 영상의 값 추가
      values.forEach(value => row.push(value));
      
      const dataRow = worksheet.addRow(row);
      
      // 완성률에 따른 색상
      const completionCell = dataRow.getCell(3);
      if (completionRate >= 80) {
        completionCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF92D050' } };
      } else if (completionRate >= 60) {
        completionCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
      } else if (completionRate >= 40) {
        completionCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC000' } };
      } else {
        completionCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF6B6B' } };
      }
      
      currentRow++;
    });
    
    currentRow++; // 카테고리 간 빈 줄
  }
  
  // 컬럼 너비 조정
  worksheet.getColumn(1).width = 5;  // No.
  worksheet.getColumn(2).width = 35; // 분석 항목
  worksheet.getColumn(3).width = 10; // 완성률
  
  // 영상별 컬럼 너비
  for (let i = 4; i <= 3 + results.length; i++) {
    worksheet.getColumn(i).width = 20;
  }
  
  console.log(`📄 카테고리별 분석 시트 생성 완료: ${categoriesMap.size}개 카테고리`);
}

/**
 * 5. 메타데이터 시트 (156개 특징 통계 포함)
 */
async function createMetadataSheet(workbook: ExcelJS.Workbook, results: AnalysisResult[], features: Feature[]): Promise<void> {
  const worksheet = workbook.addWorksheet('메타데이터');
  
  // 시스템 정보
  worksheet.addRow(['시스템 정보', '']);
  worksheet.addRow(['생성일시', new Date().toLocaleString('ko-KR')]);
  worksheet.addRow(['분석 영상 수', results.length]);
  worksheet.addRow(['총 분석 특징 수', `${features.length}개 (완전 포함)`]);
  worksheet.addRow(['생성자', 'YouTube AI Analyzer']);
  worksheet.addRow(['버전', 'v2.0 (156개 특징 완전 지원)']);
  worksheet.addRow(['']);
  
  // 통계 정보
  worksheet.addRow(['통계 정보', '']);
  
  const completedAnalyses = results.filter(r => r.status === 'completed').length;
  const avgCompletion = results.reduce((sum, r) => sum + (r.completionStats?.percentage || 0), 0) / results.length;
  const avgHybridScore = results.reduce((sum, r) => sum + (r.scores?.hybrid || 0), 0) / results.length;
  
  worksheet.addRow(['완료된 분석', `${completedAnalyses}/${results.length} (${Math.round(completedAnalyses/results.length*100)}%)`]);
  worksheet.addRow(['평균 완성도', `${Math.round(avgCompletion)}%`]);
  worksheet.addRow(['평균 하이브리드 점수', Math.round(avgHybridScore)]);
  worksheet.addRow(['']);
  
  // 카테고리별 통계 (156개 특징 완전 분류)
  worksheet.addRow(['카테고리별 상세 통계 (156개 특징)', '']);
  
  const categoryStats = new Map<string, { total: number; completed: number; features: Feature[] }>();
  
  // 카테고리별 특징 그룹화
  features.forEach(feature => {
    if (!categoryStats.has(feature.Category)) {
      categoryStats.set(feature.Category, { total: 0, completed: 0, features: [] });
    }
    categoryStats.get(feature.Category)!.features.push(feature);
  });
  
  // 각 카테고리별 완성도 계산
  for (const [categoryName, stats] of categoryStats) {
    let totalPossible = 0;
    let totalCompleted = 0;
    
    results.forEach(result => {
      if (result.analysis?.[categoryName]) {
        stats.features.forEach(feature => {
          totalPossible++;
          const value = result.analysis[categoryName][feature.Feature];
          if (value && value.trim() !== '' && value.trim() !== '없음' && value.trim() !== 'N/A') {
            totalCompleted++;
          }
        });
      } else {
        totalPossible += stats.features.length;
      }
    });
    
    stats.total = totalPossible;
    stats.completed = totalCompleted;
    
    const categoryCompletion = totalPossible > 0 ? Math.round((totalCompleted / totalPossible) * 100) : 0;
    worksheet.addRow([
      `${categoryName} (${stats.features.length}개)`, 
      `${categoryCompletion}% (${totalCompleted}/${totalPossible})`
    ]);
  }
  
  worksheet.addRow(['']);
  
  // 156개 특징 상세 목록
  worksheet.addRow(['156개 특징 완전 목록', '']);
  worksheet.addRow(['No.', '카테고리', '세부 항목']);
  
  features.forEach(feature => {
    const row = worksheet.addRow([feature.No, feature.Category, feature.Feature]);
    
    // 카테고리별 색상 구분
    const categoryColors: Record<string, string> = {
      '인물 분석': 'FFEFF7FF',
      '의상 분석': 'FFF0FFF0',
      '배경 분석': 'FFFFF0F0',
      '제품 분석': 'FFFFF8DC',
      '연출/편집 분석': 'FFF5F0FF',
      '사운드 분석': 'FFFFE4E1',
      '텍스트/자막 분석': 'FFE0FFFF',
      '스토리 구조 분석': 'FFFFEFD5',
      '유튜브 성과 분석': 'FFFFE4B5',
      '종합 분석': 'FFF0F8FF'
    };
    
    const bgColor = categoryColors[feature.Category] || 'FFFFFFFF';
    row.getCell(2).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: bgColor }
    };
  });
  
  // 스타일링
  worksheet.getColumn(1).width = 25;
  worksheet.getColumn(2).width = 30;
  worksheet.getColumn(3).width = 40;
  
  // 헤더 스타일
  [1, 8, 14, 16].forEach(rowNum => {
    const row = worksheet.getRow(rowNum);
    if (row) {
      row.getCell(1).font = { bold: true, size: 12 };
      row.getCell(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE7E6E6' }
      };
    }
  });
  
  console.log(`📄 메타데이터 시트 생성 완료: ${features.length}개 특징 완전 포함`);
}
