// src/app/api/download/route.ts - 완전 수정
import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';

// 156개 완전한 특성 목록 (누락 없음)
const COMPLETE_FEATURES = [
  { no: "1", category: "인물 분석", item: "성별 추정" },
  { no: "2", category: "인물 분석", item: "연령 추정" },
  { no: "3", category: "인물 분석", item: "인종 추정" },
  { no: "4", category: "인물 분석", item: "피부톤" },
  { no: "5", category: "인물 분석", item: "얼굴형" },
  { no: "6", category: "인물 분석", item: "머리 길이" },
  { no: "7", category: "인물 분석", item: "머리 색상" },
  { no: "8", category: "인물 분석", item: "수염 유무" },
  { no: "9", category: "인물 분석", item: "표정" },
  { no: "10", category: "인물 분석", item: "시선 방향" },
  { no: "11", category: "인물 분석", item: "손 위치" },
  { no: "12", category: "인물 분석", item: "손 제스처" },
  { no: "13", category: "인물 분석", item: "다리 자세" },
  { no: "14", category: "인물 분석", item: "상체 각도" },
  { no: "15", category: "인물 분석", item: "체형" },
  { no: "16", category: "인물 분석", item: "키" },
  { no: "17", category: "인물 분석", item: "안경 착용" },
  { no: "18", category: "인물 분석", item: "모자 착용" },
  { no: "19", category: "인물 분석", item: "이어폰/헤드폰 착용" },
  { no: "20", category: "인물 분석", item: "영상 내 인물 수" },
  { no: "21", category: "인물 분석", item: "인물 간 상호작용" },
  { no: "22", category: "인물 분석", item: "메인 인물 비중" },
  { no: "23", category: "인물 분석", item: "인물 등장 패턴" },
  { no: "24", category: "인물 분석", item: "인물 포지션 변화" },
  { no: "25", category: "인물 분석", item: "인물 크기 비율" },
  { no: "26", category: "인물 분석", item: "인물 화면 점유율" },
  { no: "27", category: "인물 분석", item: "인물 배치 구성" },
  { no: "28", category: "인물 분석", item: "인물 동작 빈도" },
  { no: "29", category: "인물 분석", item: "인물 감정 변화" },
  { no: "30", category: "의상 분석", item: "상의 종류" },
  { no: "31", category: "의상 분석", item: "하의 종류" },
  { no: "32", category: "의상 분석", item: "신발 종류" },
  { no: "33", category: "의상 분석", item: "의상 색상" },
  { no: "34", category: "의상 분석", item: "의상 재질/질감" },
  { no: "35", category: "의상 분석", item: "액세서리 유무" },
  { no: "36", category: "의상 분석", item: "계절감" },
  { no: "37", category: "의상 분석", item: "트렌디함" },
  { no: "38", category: "의상 분석", item: "브랜드 패션 여부" },
  { no: "39", category: "의상 분석", item: "유니폼/업무복 여부" },
  { no: "40", category: "의상 분석", item: "의상 스타일 통일성" },
  { no: "41", category: "배경 분석", item: "실내/실외" },
  { no: "42", category: "배경 분석", item: "장소 유형" },
  { no: "43", category: "배경 분석", item: "배경 크기/규모" },
  { no: "44", category: "배경 분석", item: "배경 색상" },
  { no: "45", category: "배경 분석", item: "배경 재질/질감" },
  { no: "46", category: "배경 분석", item: "조명 상태" },
  { no: "47", category: "배경 분석", item: "식물 유무" },
  { no: "48", category: "배경 분석", item: "창문 유무" },
  { no: "49", category: "배경 분석", item: "국가/문화 코드" },
  { no: "50", category: "배경 분석", item: "언어 환경" },
  { no: "51", category: "배경 분석", item: "계절/시간대" },
  { no: "52", category: "배경 분석", item: "배경 흐림 정도" },
  { no: "53", category: "배경 분석", item: "배경 오브젝트 수" },
  { no: "54", category: "배경 분석", item: "배경 정돈도" },
  { no: "55", category: "배경 분석", item: "배경 심도" },
  { no: "56", category: "배경 분석", item: "배경 움직임" },
  { no: "57", category: "배경 분석", item: "배경-인물 조화도" },
  { no: "58", category: "배경 분석", item: "배경 상징성" },
  { no: "59", category: "배경 분석", item: "배경 변화 패턴" },
  { no: "60", category: "제품 분석", item: "제품 존재 유무" },
  { no: "61", category: "제품 분석", item: "제품 카테고리" },
  { no: "62", category: "제품 분석", item: "제품 위치" },
  { no: "63", category: "제품 분석", item: "제품 색상" },
  { no: "64", category: "제품 분석", item: "제품 크기" },
  { no: "65", category: "제품 분석", item: "제품 사용 시연" },
  { no: "66", category: "제품 분석", item: "브랜드명 노출" },
  { no: "67", category: "제품 분석", item: "제품-인물 인터랙션" },
  { no: "68", category: "제품 분석", item: "제품 포커스 시간" },
  { no: "69", category: "제품 분석", item: "제품 애니메이션" },
  { no: "70", category: "제품 분석", item: "제품 특징 강조" },
  { no: "71", category: "제품 분석", item: "제품 사용 맥락" },
  { no: "72", category: "제품 분석", item: "제품 다양성" },
  { no: "73", category: "제품 분석", item: "제품 배치 전략" },
  { no: "74", category: "제품 분석", item: "제품 lighting" },
  { no: "75", category: "제품 분석", item: "제품 카메라 앵글" },
  { no: "76", category: "제품 분석", item: "제품 스토리텔링" },
  { no: "77", category: "연출/편집 분석", item: "카메라 앵글" },
  { no: "78", category: "연출/편집 분석", item: "카메라 무빙 방식" },
  { no: "79", category: "연출/편집 분석", item: "카메라 흔들림" },
  { no: "80", category: "연출/편집 분석", item: "컷 전환 방식" },
  { no: "81", category: "연출/편집 분석", item: "시점 구성" },
  { no: "82", category: "연출/편집 분석", item: "색보정/필터" },
  { no: "83", category: "연출/편집 분석", item: "조명 설정" },
  { no: "84", category: "연출/편집 분석", item: "렌즈/화각" },
  { no: "85", category: "연출/편집 분석", item: "프레임 구성" },
  { no: "86", category: "연출/편집 분석", item: "화면 분할" },
  { no: "87", category: "연출/편집 분석", item: "줌인/줌아웃" },
  { no: "88", category: "연출/편집 분석", item: "팬/틸트" },
  { no: "89", category: "연출/편집 분석", item: "슬로우모션" },
  { no: "90", category: "연출/편집 분석", item: "타임랩스" },
  { no: "91", category: "연출/편집 분석", item: "특수 이펙트" },
  { no: "92", category: "연출/편집 분석", item: "화면 전환 효과" },
  { no: "93", category: "연출/편집 분석", item: "그래픽 오버레이" },
  { no: "94", category: "연출/편집 분석", item: "모션 그래픽" },
  { no: "95", category: "연출/편집 분석", item: "촬영 안정성" },
  { no: "96", category: "연출/편집 분석", item: "편집 리듬감" },
  { no: "97", category: "연출/편집 분석", item: "컷 연결 자연스러움" },
  { no: "98", category: "연출/편집 분석", item: "편집 스타일 일관성" },
  { no: "99", category: "연출/편집 분석", item: "영상 품질" },
  { no: "100", category: "사운드 분석", item: "BGM 유무" },
  { no: "101", category: "사운드 분석", item: "BGM 장르" },
  { no: "102", category: "사운드 분석", item: "효과음 사용" },
  { no: "103", category: "사운드 분석", item: "인물 발화" },
  { no: "104", category: "사운드 분석", item: "발화 톤" },
  { no: "105", category: "사운드 분석", item: "발화 속도" },
  { no: "106", category: "사운드 분석", item: "감정 톤" },
  { no: "107", category: "사운드 분석", item: "사운드 싱크" },
  { no: "108", category: "사운드 분석", item: "음성 명료도" },
  { no: "109", category: "사운드 분석", item: "배경 소음" },
  { no: "110", category: "사운드 분석", item: "사운드 공간감" },
  { no: "111", category: "사운드 분석", item: "ASMR 요소" },
  { no: "112", category: "텍스트/자막 분석", item: "자막 유무" },
  { no: "113", category: "텍스트/자막 분석", item: "자막 위치" },
  { no: "114", category: "텍스트/자막 분석", item: "로고 위치" },
  { no: "115", category: "텍스트/자막 분석", item: "슬로건 유무" },
  { no: "116", category: "텍스트/자막 분석", item: "키워드 강조" },
  { no: "117", category: "텍스트/자막 분석", item: "가격 표시" },
  { no: "118", category: "텍스트/자막 분석", item: "CTA 버튼" },
  { no: "119", category: "텍스트/자막 분석", item: "텍스트 효과" },
  { no: "120", category: "텍스트/자막 분석", item: "폰트 스타일" },
  { no: "121", category: "텍스트/자막 분석", item: "텍스트 색상" },
  { no: "122", category: "텍스트/자막 분석", item: "키네틱 타이포그래피" },
  { no: "123", category: "스토리 구조 분석", item: "인트로/클라이맥스/결말 구성" },
  { no: "124", category: "스토리 구조 분석", item: "스토리 구조 존재" },
  { no: "125", category: "스토리 구조 분석", item: "무드/감정 변화" },
  { no: "126", category: "스토리 구조 분석", item: "컷 간 일관성" },
  { no: "127", category: "스토리 구조 분석", item: "인물 교체" },
  { no: "128", category: "스토리 구조 분석", item: "반복 패턴" },
  { no: "129", category: "스토리 구조 분석", item: "시선 유도" },
  { no: "130", category: "스토리 구조 분석", item: "메타포 사용" },
  { no: "131", category: "스토리 구조 분석", item: "공감/유머 요소" },
  { no: "132", category: "스토리 구조 분석", item: "스토리텔링 강도" },
  { no: "133", category: "스토리 구조 분석", item: "총 컷 수" },
  { no: "134", category: "스토리 구조 분석", item: "평균 컷 길이" },
  { no: "135", category: "스토리 구조 분석", item: "장면 전환 속도" },
  { no: "136", category: "스토리 구조 분석", item: "장소 수" },
  { no: "137", category: "스토리 구조 분석", item: "인물 수 변화" },
  { no: "138", category: "스토리 구조 분석", item: "색상/사운드 변화" },
  { no: "139", category: "스토리 구조 분석", item: "브랜드 정체성 일치" },
  { no: "140", category: "스토리 구조 분석", item: "메시지 흐름" },
  { no: "141", category: "스토리 구조 분석", item: "스크롤 정지력" },
  { no: "142", category: "스토리 구조 분석", item: "전환 완성도" },
  { no: "143", category: "유튜브 성과 분석", item: "댓글 감정 분석" },
  { no: "144", category: "유튜브 성과 분석", item: "댓글 키워드 분석" },
  { no: "145", category: "유튜브 성과 분석", item: "브랜드 인식 감지" },
  { no: "146", category: "유튜브 성과 분석", item: "악플/비판 유무" },
  { no: "147", category: "유튜브 성과 분석", item: "유머/밈 요소" },
  { no: "148", category: "유튜브 성과 분석", item: "소비자 니즈 추론" },
  { no: "149", category: "유튜브 성과 분석", item: "유입 키워드 예측" },
  { no: "150", category: "유튜브 성과 분석", item: "CTA 분석" },
  { no: "151", category: "유튜브 성과 분석", item: "썸네일 클릭 유도력" },
  { no: "152", category: "유튜브 성과 분석", item: "채널 연관도" },
  { no: "153", category: "종합 분석", item: "산업 분류" },
  { no: "154", category: "종합 분석", item: "핵심 타겟" },
  { no: "155", category: "종합 분석", item: "영상 목적" },
  { no: "156", category: "종합 분석", item: "전체 영상 길이" }
];

export const runtime = 'nodejs';

type AnalysisItem = {
  title: string;
  url: string;
  notes?: string;
  scriptLanguage?: string;
  completionStats?: { completed: number; incomplete: number; total: number; percentage: number };
  analysis: { [category: string]: { [feature: string]: string } };
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    // 단일 영상 또는 다중 영상 지원
    let videos: AnalysisItem[] = [];

    if (body.video && body.video.analysis) {
      // 단일 영상 케이스
      videos = [body.video];
    } else if (body.videos && Array.isArray(body.videos)) {
      // 다중 영상 케이스
      videos = body.videos.filter((v: any) => v && v.analysis);
    } else if (body.items && Array.isArray(body.items)) {
      // items 형태 케이스
      videos = body.items.filter((v: any) => v && v.analysis);
    }

    if (!videos.length) {
      return NextResponse.json({ message: '분석 데이터가 없습니다.' }, { status: 400 });
    }

    console.log(`📊 엑셀 생성 시작: ${videos.length}개 영상, 156개 특성`);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('AI 광고 분석 결과');

    // 헤더 생성 (기본 정보 + 156개 특성)
    const headers = [
      'No',
      '영상 제목',
      'URL',
      '비고',
      '스크립트 언어',
      '완성도(%)',
      ...COMPLETE_FEATURES.map(f => `${f.no}.${f.category}_${f.item}`)
    ];

    worksheet.addRow(headers);

    // 헤더 스타일 적용
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // 데이터 행 추가
    videos.forEach((video, index) => {
      const row = [
        index + 1,
        video.title || 'N/A',
        video.url || 'N/A',
        video.notes || '',
        video.scriptLanguage || 'N/A',
        video.completionStats?.percentage || 0
      ];

      // 156개 특성 데이터 추가
      COMPLETE_FEATURES.forEach(feature => {
        let value = 'N/A';

        // analysis 구조에서 값 찾기
        if (video.analysis && video.analysis[feature.category]) {
          value = video.analysis[feature.category][feature.item] || 'N/A';
        }

        row.push(value);
      });

      worksheet.addRow(row);
    });

    // 컬럼 너비 조정
    worksheet.columns.forEach((column, index) => {
      if (index === 0) column.width = 5;   // No
      else if (index === 1) column.width = 40;  // 제목
      else if (index === 2) column.width = 50;  // URL
      else if (index <= 5) column.width = 15;   // 기타 정보
      else column.width = 25;  // 특성 데이터
    });

    console.log(`✅ 엑셀 생성 완료: ${videos.length}개 영상, ${COMPLETE_FEATURES.length}개 특성`);

    // 파일명 생성 (수정: video → videos[0])
    const timestamp = new Date().toISOString().split('T')[0];
    const fileName = videos.length === 1
      ? `${videos[0].title.replace(/[\\/:*?"<>|]/g, '_')}_분석결과_${timestamp}.xlsx`
      : `AI광고분석_${videos.length}개영상_${timestamp}.xlsx`;

    // 엑셀 버퍼 생성
    const buffer = await workbook.xlsx.writeBuffer();

    // 응답 헤더 설정
    const headers_response = new Headers();
    headers_response.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    headers_response.set('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);

    return new NextResponse(buffer, { status: 200, headers: headers_response });

  } catch (error: any) {
    console.error('❌ Excel 다운로드 오류:', error);
    return NextResponse.json({
      message: error?.message || '엑셀 파일 생성 중 오류가 발생했습니다.'
    }, { status: 500 });
  }
}
