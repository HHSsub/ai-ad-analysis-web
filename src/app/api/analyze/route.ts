// src/app/api/analyze/route.ts - 서버 환경 완전 대응 수정
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { google } from 'googleapis';
import { getSubtitles } from 'youtube-captions-scraper';
import path from 'path';
import fs from 'fs';

// --- 타입 정의 ---
interface VideoInput {
  title: string;
  url: string;
  notes: string;
}

interface Feature {
  No: string;
  Category: string;
  Feature: string;
  Value?: string;
}

// --- 전역 변수 ---
let analysisProgress: { [key: string]: any } = {};

// --- 완전한 156개 특징 하드코딩 ---
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

// --- CSV 파싱 함수 (안전한 폴백 포함) ---
function getFeaturesFromCSV(): Feature[] {
  try {
    const filePath = path.join(process.cwd(), 'src', 'data', 'output_features.csv');
    
    if (!fs.existsSync(filePath)) {
      console.warn('⚠️ CSV 파일이 존재하지 않음. 하드코딩 특징 사용');
      return getComplete156Features();
    }

    let fileContent = fs.readFileSync(filePath, 'utf-8');
    
    if (!fileContent || fileContent.length === 0) {
      console.warn('⚠️ CSV 파일이 비어있음. 하드코딩 특징 사용');
      return getComplete156Features();
    }

    // BOM 제거
    if (fileContent.charCodeAt(0) === 0xFEFF) {
      fileContent = fileContent.slice(1);
    }
    
    const lines = fileContent.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);
    
    if (lines.length < 2) {
      console.warn('⚠️ CSV 파일에 데이터가 부족함. 하드코딩 특징 사용');
      return getComplete156Features();
    }
    
    const features: Feature[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      
      if (!line || line === ',' || line === ',,,') {
        continue;
      }
      
      const columns = parseCsvLine(line);
      
      if (columns.length >= 3) {
        const [no, category, feature] = columns.map(col => col.trim());
        
        if (no && category && feature) {
          features.push({
            No: no,
            Category: category,
            Feature: feature,
            Value: columns[3]?.trim() || ''
          });
        }
      }
    }
    
    console.log(`✅ CSV에서 ${features.length}개 특징 로드 완료`);
    
    if (features.length < 150) {
      console.warn(`⚠️ CSV 특징 수 부족 (${features.length}/156). 하드코딩 특징 사용`);
      return getComplete156Features();
    }
    
    return features;
    
  } catch (error) {
    console.error('❌ CSV 파일 읽기 오류:', error);
    console.log('🔄 하드코딩된 156개 특징으로 폴백');
    return getComplete156Features();
  }
}

// --- CSV 라인 파싱 함수 ---
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

// --- 자막 추출 함수 ---
async function extractSubtitles(videoId: string): Promise<{ text: string; language: string }> {
  const languages = ['ko', 'en', 'ja', 'zh', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ar'];

  for (const lang of languages) {
    try {
      const subtitles = await getSubtitles({ videoID: videoId, lang });
      const text = subtitles.map(sub => sub.text).join(' ');
      if (text && text.trim().length > 30) {
        console.log(`✅ ${lang} 자막 추출 성공 (${text.length}자)`);
        return { text, language: lang };
      }
    } catch (e) {
      continue;
    }
  }

  console.log('⚠️ 자막 추출 실패 - 모든 언어 시도');
  return { text: '', language: 'none' };
}

// --- YouTube Video ID 추출 ---
function getYouTubeVideoId(url: string): string | null {
  if (!url) return null;
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

// --- 기존 향상된 전문가 페르소나 프롬프트 ---
function createExpertAnalysisPrompt(videoData: any, features: Feature[], scriptData: { text: string; language: string }) {
  const { snippet, statistics, contentDetails } = videoData;
  
  const getDurationInSeconds = (duration: string): number => {
    if (!duration) return 0;
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    const [, hours = '0', minutes = '0', seconds = '0'] = match;
    return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds);
  };

  const durationSeconds = getDurationInSeconds(contentDetails?.duration || '');
  const isShortVideo = durationSeconds <= 60;

  const categorizedFeatures = features.reduce((acc, feature) => {
    if (!acc[feature.Category]) {
      acc[feature.Category] = [];
    }
    acc[feature.Category].push(`${feature.No}. ${feature.Feature}`);
    return acc;
  }, {} as Record<string, string[]>);

  const featuresText = Object.entries(categorizedFeatures)
    .map(([category, items]) => `${category}:\n${items.join('\n')}`)
    .join('\n\n');

  return `
# PERSONA: YouTube Video Analysis Expert

You are a **YouTube Video Analysis Expert** and the user's content creation partner. Your core competency is analyzing ANY YouTube URL provided by the user, focusing intensively on the content to extract concrete, verifiable signals that map to the requested features.

## CRITICAL ANALYSIS FRAMEWORK

### 1. IMMEDIATE VIDEO ASSESSMENT
**Video Type:** ${isShortVideo ? 'SHORT VIDEO (≤60 seconds)' : 'STANDARD VIDEO (>60 seconds)'}
**Duration:** ${durationSeconds} seconds
**Analysis Strategy:** ${isShortVideo ? 'Focus on immediate visual impact, thumbnail analysis, and title/description inference for missing elements' : 'Comprehensive content analysis with script and visual elements'}

### 2. VIDEO DATA AVAILABLE
**Title:** ${snippet?.title || 'N/A'}
**Channel:** ${snippet?.channelTitle || 'N/A'}
**Description:** ${snippet?.description?.substring(0, 200) || 'N/A'}...
**Views:** ${statistics?.viewCount || 'N/A'}
**Duration:** ${contentDetails?.duration || 'N/A'}
**Script Language:** ${scriptData.language !== 'none' ? scriptData.language : 'No subtitles'}
**Script Content:** ${scriptData.text ? scriptData.text.substring(0, 300) + '...' : 'No script available'}

### 3. ANALYSIS FEATURES TO COMPLETE
${featuresText}

### 4. RESPONSE GENERATION RULES

#### CRITICAL INSTRUCTIONS:
1. **NO LAZY ANALYSIS:** For obvious visual elements, provide specific answers
2. **EVIDENCE-BASED:** If you can see it in typical video thumbnail or opening seconds, analyze it
3. **SHORT VIDEO FOCUS:** For videos ≤60 seconds, prioritize immediate visual impact
4. **FAILURE REASONS:** Only use "분석불가/reason" when truly impossible to determine

#### SPECIFIC ANSWER FORMATS:
- **Gender:** "남성/여성/혼성" (not "분석불가" unless truly no humans visible)
- **Age:** "20대/30대/추정 25세" (make educated guesses based on visual cues)
- **Colors:** "빨간색/파란색/다색상" (specific color names)
- **Setting:** "실내/실외/스튜디오/주방" (specific location types)
- **Products:** "있음-[product type]/없음" (be specific about what you see)

## RESPONSE FORMAT
Provide your analysis in JSON format with exactly these keys:

{
  "feature_1": "specific analyzed value or 분석불가/specific reason",
  "feature_2": "specific analyzed value or 분석불가/specific reason",
  ...
  "feature_156": "specific analyzed value or 분석불가/specific reason"
}
`.trim();
}

// --- YouTube 메타데이터 기반 추론 ---
function inferFeaturesFromYouTubeMetadata(videoData: any, features: Feature[]): any {
  const { snippet, statistics, contentDetails } = videoData;
  const result: any = {};
  
  features.forEach(feature => {
    const featureKey = `feature_${feature.No}`;
    
    switch (feature.Feature) {
      case '영상 제목':
        result[featureKey] = snippet?.title || 'N/A';
        break;
      case '채널명':
        result[featureKey] = snippet?.channelTitle || 'N/A';
        break;
      case '조회수':
        result[featureKey] = statistics?.viewCount ? parseInt(statistics.viewCount).toLocaleString() : 'N/A';
        break;
      case '좋아요 수':
        result[featureKey] = statistics?.likeCount ? parseInt(statistics.likeCount).toLocaleString() : 'N/A';
        break;
      case '댓글 수':
        result[featureKey] = statistics?.commentCount ? parseInt(statistics.commentCount).toLocaleString() : 'N/A';
        break;
      case '전체 영상 길이':
        if (contentDetails?.duration) {
          const duration = contentDetails.duration;
          const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
          if (match) {
            const [, hours = '0', minutes = '0', seconds = '0'] = match;
            const totalSeconds = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds);
            result[featureKey] = `${totalSeconds}초`;
          }
        }
        break;
      case '광고 여부':
        const title = snippet?.title?.toLowerCase() || '';
        const desc = snippet?.description?.toLowerCase() || '';
        result[featureKey] = title.includes('광고') || title.includes('ad') || 
                           desc.includes('광고') || desc.includes('sponsored') ? 
                           '있음' : '없음';
        break;
      case '게시일':
        if (snippet?.publishedAt) {
          result[featureKey] = new Date(snippet.publishedAt).toLocaleDateString();
        }
        break;
    }
  });
  
  return result;
}

// --- Gemini 응답 파싱 (안전한 에러 처리) ---
function parseAndValidateResponse(text: string, features: Feature[]): any {
  try {
    console.log('🔍 Gemini 응답 파싱 시작');
    
    if (!text || text.trim().length === 0) {
      throw new Error('빈 응답 받음');
    }
    
    let jsonString = text.trim();
    jsonString = jsonString.replace(/```json\s*|\s*```/g, '');
    jsonString = jsonString.replace(/```\s*|\s*```/g, '');
    
    const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('JSON 형식을 찾을 수 없습니다');
    }
    
    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error('JSON 파싱 실패:', parseError);
      console.log('파싱 시도한 텍스트:', jsonMatch[0].substring(0, 200));
      throw new Error('JSON 파싱 실패');
    }
    
    // 156개 feature 검증 및 보완
    const result: any = {};
    features.forEach(feature => {
      const featureKey = `feature_${feature.No}`;
      result[featureKey] = parsed[featureKey] || '분석불가/AI응답누락';
    });
    
    const analysisFailureCount = Object.values(result).filter(value => 
      String(value).startsWith('분석불가/') || String(value).startsWith('판단불가/')
    ).length;
    
    const successRate = ((156 - analysisFailureCount) / 156) * 100;
    console.log(`✅ Gemini 분석 성공률: ${successRate.toFixed(1)}% (${156 - analysisFailureCount}/156)`);
    
    return result;
    
  } catch (error) {
    console.error('❌ Gemini 응답 파싱 완전 실패:', error);
    
    // 완전 실패시 기본값으로 채우기
    const fallbackResult: any = {};
    features.forEach(feature => {
      const featureKey = `feature_${feature.No}`;
      fallbackResult[featureKey] = '분석불가/파싱실패';
    });
    
    return fallbackResult;
  }
}

// --- 완료도 통계 계산 ---
function calculateCompletionStats(analysis: any) {
  const total = Object.keys(analysis).length;
  let completed = 0;
  let incomplete = 0;
  
  Object.values(analysis).forEach(value => {
    const strValue = String(value);
    if (strValue === 'N/A' || 
        strValue === '미확인' || 
        strValue.startsWith('분석불가/') || 
        strValue.startsWith('판단불가/') || 
        strValue === '' || 
        strValue === '0') {
      incomplete++;
    } else {
      completed++;
    }
  });
  
  return {
    completed,
    incomplete,
    total,
    percentage: Math.round((completed / total) * 100)
  };
}

// --- 폴백 메타데이터 생성 ---
function buildFallbackVideoData(input: VideoInput) {
  return {
    snippet: {
      title: input.title || '(untitled)',
      description: '',
      channelTitle: 'N/A',
      publishedAt: '',
    },
    statistics: {
      viewCount: '',
      likeCount: '',
      commentCount: '',
    },
    contentDetails: {
      duration: '',
    },
  };
}

// --- 단일 영상 분석 함수 ---
async function analyzeSingleVideo(video: VideoInput, features: Feature[], youtube: any | null, model: any): Promise<any> {
  const videoId = getYouTubeVideoId(video.url);
  if (!videoId) throw new Error(`'${video.url}'은(는) 잘못된 YouTube URL입니다.`);

  console.log(`🎬 영상 분석 시작: ${video.title} (ID: ${videoId})`);

  // 1. YouTube 메타데이터 수집
  let videoData: any = null;
  if (youtube) {
    try {
      const response = await youtube.videos.list({
        part: ['snippet', 'statistics', 'contentDetails'],
        id: [videoId],
      });

      if (response.data.items && response.data.items.length > 0) {
        videoData = response.data.items[0];
        console.log('✅ YouTube API 데이터 로드 성공');
      } else {
        console.log('⚠️ YouTube API에서 영상 정보를 찾을 수 없음');
      }
    } catch (apiError) {
      console.log('⚠️ YouTube API 오류 (메타데이터 없이 진행):', (apiError as any)?.message);
    }
  }

  // 폴백 데이터 생성
  if (!videoData) {
    videoData = buildFallbackVideoData(video);
    console.log('📝 폴백 메타데이터 사용');
  }

  // 2. 자막 추출
  const scriptData = await extractSubtitles(videoId);

  // 3. YouTube 메타데이터 기반 기본 추론
  const baseInferences = inferFeaturesFromYouTubeMetadata(videoData, features);

  // 4. Gemini AI 고급 분석 (안전한 에러 처리)
  let analysisResults = {};
  try {
    const prompt = createExpertAnalysisPrompt(videoData, features, scriptData);
    console.log(`🤖 Gemini AI 분석 시작... (프롬프트 길이: ${prompt.length}자)`);
    
    const result = await model.generateContent(prompt);
    
    if (!result || !result.response) {
      throw new Error('Gemini 응답 객체가 없습니다');
    }
    
    const response = await result.response;
    
    if (!response || typeof response.text !== 'function') {
      throw new Error('Gemini 응답에서 text 함수를 찾을 수 없습니다');
    }
    
    const geminiText = response.text();
    
    if (!geminiText || geminiText.trim().length === 0) {
      throw new Error('Gemini AI가 빈 응답을 반환했습니다');
    }
    
    analysisResults = parseAndValidateResponse(geminiText, features);
    console.log('✅ Gemini AI 분석 완료');
    
  } catch (geminiError) {
    console.error('❌ Gemini AI 분석 실패:', geminiError);
    console.log('📝 YouTube 메타데이터만으로 분석 진행');
    
    // Gemini 실패시 기본 추론만 사용
    features.forEach(feature => {
      const featureKey = `feature_${feature.No}`;
      if (!baseInferences[featureKey]) {
        analysisResults[featureKey] = '분석불가/AI분석실패';
      }
    });
  }

  // 5. 기본 추론과 AI 분석 결과 병합
  const finalAnalysis = { ...baseInferences, ...analysisResults };

  // 6. 카테고리별로 분석 결과 재구성
  const categorizedAnalysis: { [category: string]: { [feature: string]: string } } = {};
  features.forEach(feature => {
    const featureKey = `feature_${feature.No}`;
    if (!categorizedAnalysis[feature.Category]) {
      categorizedAnalysis[feature.Category] = {};
    }
    categorizedAnalysis[feature.Category][feature.Feature] = finalAnalysis[featureKey] || 'N/A';
  });

  // 7. 완료도 통계 계산
  const completionStats = calculateCompletionStats(finalAnalysis);

  return {
    id: videoId,
    title: video.title,
    url: video.url,
    notes: video.notes,
    status: 'completed',
    analysis: categorizedAnalysis,
    features: finalAnalysis,
    completionStats,
    scriptLanguage: scriptData.language,
  };
}

// --- 메인 POST 핸들러 ---
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { videos } = body;

    if (!videos || !Array.isArray(videos) || videos.length === 0) {
      return NextResponse.json({ 
        message: '분석할 영상 목록이 필요합니다.' 
      }, { status: 400 });
    }

    // 특징 로드 (안전한 폴백 포함)
    const features = getFeaturesFromCSV();
    console.log(`🎯 분석 시작: ${videos.length}개 영상, ${features.length}개 특징`);

    // API 초기화
    let youtube = null;
    const youtubeApiKey = process.env.YOUTUBE_API_KEY;
    if (youtubeApiKey) {
      youtube = google.youtube({ version: 'v3', auth: youtubeApiKey });
      console.log('✅ YouTube API 초기화 완료');
    } else {
      console.log('⚠️ YouTube API 키 없음 - 메타데이터 없이 진행');
    }

    // Gemini AI 초기화 (안전한 에러 처리)
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      throw new Error('GEMINI_API_KEY 환경변수가 설정되지 않았습니다.');
    }
    
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.5-flash',
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
      ]
    });
    console.log('✅ Gemini AI 초기화 완료');

    // 진행률 초기화
    const sessionId = `analysis_${Date.now()}`;
    global.analysisProgress = {
      total: videos.length,
      completed: 0,
      current: '',
      stage: 'youtube' as const,
      videos: []
    };

    const results: any[] = [];
    
    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      
      try {
        global.analysisProgress.current = `${video.title} 분석 중...`;
        global.analysisProgress.stage = 'gemini';
        
        const result = await analyzeSingleVideo(video, features, youtube, model);
        results.push(result);
        global.analysisProgress.videos.push(result);
        
        global.analysisProgress.completed = i + 1;
        
        console.log(`✅ 영상 ${i + 1}/${videos.length} 분석 완료: ${video.title}`);
        
        // API 레이트 리미트 방지를 위한 딜레이
        if (i < videos.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
      } catch (videoError) {
        console.error(`❌ 영상 분석 실패 [${video.title}]:`, videoError);
        
        // 실패한 영상도 기본 구조로 추가
        results.push({
          id: getYouTubeVideoId(video.url) || `failed_${i}`,
          title: video.title,
          url: video.url,
          notes: video.notes,
          status: 'failed',
          analysis: {},
          features: {},
          completionStats: { completed: 0, incomplete: 156, total: 156, percentage: 0 },
          scriptLanguage: 'none'
        });
        
        global.analysisProgress.completed = i + 1;
      }
    }

    global.analysisProgress.stage = 'complete';
    global.analysisProgress.current = '분석 완료';

    console.log(`🎉 전체 분석 완료: ${results.length}개 영상`);

    // Google Drive 자동 업로드 (올바른 폴더 ID 사용)
    let uploadResult = null;
    try {
      console.log('☁️ Google Drive 자동 업로드 시작...');
      
      const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
      const uploadResponse = await fetch(`${baseUrl}/api/drive/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileName: `YouTube_분석결과_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`,
          data: results.map((result, index) => ({
            순번: index + 1,
            영상제목: result.title,
            URL: result.url,
            채널명: result.channelTitle || 'N/A',
            완성도: `${result.completionStats?.percentage || 0}%`,
            비고: result.notes || '',
            ...Object.fromEntries(
              features.map(feature => [
                `${feature.No}.${feature.Feature}`,
                result.features[`feature_${feature.No}`] || 'N/A'
              ])
            )
          })),
          dataType: 'csv',
        })
      });

      if (uploadResponse.ok) {
        uploadResult = await uploadResponse.json();
        console.log('✅ Google Drive 업로드 성공:', uploadResult.file?.name);
      } else {
        const errorData = await uploadResponse.json();
        console.error('❌ Google Drive 업로드 실패:', errorData.error);
        uploadResult = { success: false, error: errorData.error };
      }
    } catch (uploadError) {
      console.error('❌ Google Drive 업로드 요청 실패:', uploadError);
      uploadResult = { 
        success: false, 
        error: uploadError instanceof Error ? uploadError.message : '업로드 요청 실패' 
      };
    }

    // 응답 생성
    const successCount = results.filter(r => r.status === 'completed').length;
    const failureCount = results.length - successCount;
    const avgCompletionRate = results.reduce((sum, r) => sum + (r.completionStats?.percentage || 0), 0) / results.length;

    return NextResponse.json({
      success: true,
      message: '분석이 완료되었습니다.',
      sessionId,
      summary: {
        total: videos.length,
        success: successCount,
        failed: failureCount,
        avgCompletionRate: Math.round(avgCompletionRate),
        totalFeatures: features.length
      },
      upload: uploadResult,
      results
    });

  } catch (error) {
    console.error('❌ 분석 프로세스 실패:', error);
    
    return NextResponse.json({
      success: false,
      message: '분석 중 오류가 발생했습니다.',
      error: error instanceof Error ? error.message : '알 수 없는 오류'
    }, { status: 500 });
  }
}

// --- GET 핸들러 (진행률 조회) ---
export async function GET(request: NextRequest) {
  try {
    const progress = global.analysisProgress || {
      total: 0,
      completed: 0,
      current: '',
      stage: 'complete' as const,
      videos: []
    };

    return NextResponse.json({
      progress,
      videos: progress.videos
    });

  } catch (error) {
    console.error('Progress API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
