// src/app/api/export/excel/route.ts - 타입 오류 수정
import { NextRequest, NextResponse } from 'next/server';
import { buildWorkbookBuffer } from '@/lib/excel/buildWorkbook';

export const runtime = 'nodejs';

type AnalysisItem = {
  title: string;
  url: string;
  notes?: string;
  scriptLanguage?: string;
  completionStats?: { completed: number; incomplete: number; total: number; percentage: number };
  analysis: { [category: string]: { [feature: string]: string } };
};

// AnalysisResult 타입 (buildWorkbookBuffer가 요구하는 타입)
type AnalysisResult = {
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
};

// AnalysisItem을 AnalysisResult로 변환하는 함수
function convertToAnalysisResult(item: AnalysisItem, index: number): AnalysisResult {
  // URL에서 YouTube ID 추출하여 id로 사용
  const getYouTubeVideoId = (url: string): string => {
    const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(regex);
    return match ? match[1] : `video_${index + 1}`;
  };

  // analysis를 features 플랫 구조로 변환
  const features: { [key: string]: string } = {};
  if (item.analysis) {
    let featureNo = 1;
    Object.entries(item.analysis).forEach(([category, categoryData]) => {
      Object.entries(categoryData).forEach(([feature, value]) => {
        features[`feature_${featureNo}`] = String(value || '');
        featureNo++;
      });
    });
  }

  return {
    id: getYouTubeVideoId(item.url),
    title: item.title,
    url: item.url,
    notes: item.notes,
    status: 'completed', // 분석이 완료된 데이터라고 가정
    analysis: item.analysis,
    features: features,
    completionStats: item.completionStats,
    scriptLanguage: item.scriptLanguage || '한국어',
    channelTitle: '', // 빈 값으로 설정
    geminiStatus: 'completed'
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const items: AnalysisItem[] = Array.isArray(body?.items) ? body.items : [];
    const fileName: string = body?.fileName || `analysis-${Date.now()}.xlsx`;
    const workbookTitle: string | undefined = body?.workbookTitle;

    if (!items.length) {
      return NextResponse.json({ message: '내보낼 items가 비어 있습니다.' }, { status: 400 });
    }

    console.log(`📊 엑셀 내보내기 시작: ${items.length}개 항목`);

    // AnalysisItem[]을 AnalysisResult[]로 변환
    const analysisResults: AnalysisResult[] = items.map((item, index) => 
      convertToAnalysisResult(item, index)
    );

    // buildWorkbookBuffer 호출 (이제 타입이 맞음)
    const buffer = await buildWorkbookBuffer(analysisResults);

    const headers = new Headers();
    headers.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);

    console.log(`✅ 엑셀 파일 생성 완료: ${fileName}`);

    return new NextResponse(buffer, { status: 200, headers });
  } catch (error: any) {
    console.error('❌ 엑셀 생성 오류:', error);
    return NextResponse.json({ 
      message: error?.message || '엑셀 생성 중 오류가 발생했습니다.' 
    }, { status: 500 });
  }
}
