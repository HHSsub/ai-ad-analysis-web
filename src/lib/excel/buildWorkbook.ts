import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';

// Feature 인터페이스
export interface Feature {
  No: string;
  Category: string;
  Feature: string;
}

// 분석 결과 인터페이스
export interface AnalysisResult {
  id: string;
  title: string;
  url: string;
  notes?: string;
  status: 'completed' | 'failed';
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
}

// CSV 라인 파싱
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

// CSV에서 피처 로드
export function getFeaturesFromCSV(): Feature[] {
  try {
    const csvPath = path.join(process.cwd(), 'src', 'data', 'output_features.csv');
    
    if (!fs.existsSync(csvPath)) {
      console.warn('CSV 파일 없음, 하드코딩 사용');
      return getComplete156Features();
    }
    
    let fileContent = fs.readFileSync(csvPath, 'utf-8');
    
    // BOM 제거
    if (fileContent.charCodeAt(0) === 0xFEFF) {
      fileContent = fileContent.slice(1);
    }
    
    const lines = fileContent.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    const features: Feature[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const columns = parseCsvLine(lines[i]);
      
      if (columns.length >= 3) {
        const [no, category, feature] = columns.map(col => col.trim());
        
        if (no && category && feature) {
          features.push({ No: no, Category: category, Feature: feature });
        }
      }
    }
    
    if (features.length === 156) {
      console.log('CSV에서 156개 피처 로드 완료');
      return features;
    } else {
      console.warn(`피처 개수 불일치 (${features.length}/156)`);
      return getComplete156Features();
    }
    
  } catch (error) {
    console.error('CSV 로드 실패:', error);
    return getComplete156Features();
  }
}

// 하드코딩 백업 - GitHub CSV와 동일
function getComplete156Features(): Feature[] {
  return [
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
    { No: "142", Category: "스토리 구조 분석", Feature: "전환 완성도" },
    { No: "143", Category: "유튜브 성과 분석", Feature: "댓글 감정 분석(긍/부정/중립) 및 언어 감지" },
    { No: "144", Category: "유튜브 성과 분석", Feature: "댓글 키워드/반복 단어 분석" },
    { No: "145", Category: "유튜브 성과 분석", Feature: "브랜드 인식/구매 의도 표현 감지" },
    { No: "146", Category: "유튜브 성과 분석", Feature: "악플/비판 유무" },
    { No: "147", Category: "유튜브 성과 분석", Feature: "유머/밈 요소 여부" },
    { No: "148", Category: "유튜브 성과 분석", Feature: "콘텐츠에 대한 칭찬/소비자 니즈 추론" },
    { No: "149", Category: "유튜브 성과 분석", Feature: "유입 키워드 예측" },
    { No: "150", Category: "유튜브 성과 분석", Feature: "설명란 링크(CTA) 분석" },
    { No: "151", Category: "유튜브 성과 분석", Feature: "썸네일 클릭 유도력" },
    { No: "152", Category: "유튜브 성과 분석", Feature: "채널 내 다른 영상 연관도" },
    { No: "153", Category: "종합 분석", Feature: "산업" },
    { No: "154", Category: "종합 분석", Feature: "핵심 타겟 (Core Target Audience)" },
    { No: "155", Category: "종합 분석", Feature: "영상 목적 (브랜딩 or 판매 전환)" },
    { No: "156", Category: "종합 분석", Feature: "전체 영상 길이" }
  ];
}

/**
 * 간소화된 워크북 생성 - 156개 피처 RAW DATA만
 */
export async function buildWorkbook(
  results: AnalysisResult[],
  features?: Feature[]
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const featuresList = features || getFeaturesFromCSV();
  
  // 단일 시트: 156개 피처 데이터
  const worksheet = workbook.addWorksheet('분석결과_156');
  
  // 헤더 생성
  const headers = [
    'No',
    '영상제목',
    'URL',
    '채널명',
    '상태',
    '완성도(%)',
    'AI상태',
    ...featuresList.map(f => `${f.No}.${f.Category}_${f.Feature}`)
  ];
  
  worksheet.addRow(headers);
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  };
  
  // 데이터 행
  results.forEach((result, index) => {
    const row = [
      index + 1,
      result.title,
      result.url,
      result.channelTitle || 'N/A',
      result.status === 'completed' ? '완료' : '실패',
      result.completionStats?.percentage || 0,
      result.geminiStatus || 'N/A'
    ];
    
    // 156개 피처 데이터
    featuresList.forEach(feature => {
      let value = 'N/A';
      
      // features 플랫 구조 우선
      if (result.features && result.features[`feature_${feature.No}`]) {
        value = result.features[`feature_${feature.No}`];
      }
      // analysis 카테고리 구조 확인
      else if (result.analysis && result.analysis[feature.Category]) {
        value = result.analysis[feature.Category][feature.Feature] || 'N/A';
      }
      
      row.push(value);
    });
    
    worksheet.addRow(row);
  });
  
  // 컬럼 너비 자동 조정
  worksheet.columns.forEach((column, index) => {
    if (index === 0) column.width = 5;  // No
    else if (index === 1) column.width = 30;  // 제목
    else if (index === 2) column.width = 40;  // URL
    else if (index === 3) column.width = 20;  // 채널
    else if (index <= 6) column.width = 10;  // 상태 관련
    else column.width = 20;  // 피처 데이터
  });
  
  console.log(`엑셀 생성 완료: ${results.length}개 영상, ${featuresList.length}개 피처`);
  
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
