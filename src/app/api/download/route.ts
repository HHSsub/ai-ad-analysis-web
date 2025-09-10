import { NextRequest, NextResponse } from 'next/server';
import { buildWorkbookBuffer } from '@/lib/excel/buildWorkbook';

export const runtime = 'nodejs';

type AnalysisItem = {
  title: string;
  url: string;
  scriptLanguage?: string;
  completionStats?: { completed: number; incomplete: number; total: number; percentage: number };
  analysis: { [category: string]: { [feature: string]: string } };
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const video: AnalysisItem | undefined = body?.video;
    if (!video || !video.analysis) {
      return NextResponse.json({ message: '분석 데이터가 없습니다.' }, { status: 400 });
    }

    const fileName = `${video.title || 'analysis'}_분석결과.xlsx`;
    const buffer = await buildWorkbookBuffer([video], 'AI Ad Analysis');

    const headers = new Headers();
    headers.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);

    return new NextResponse(buffer, { status: 200, headers });
  } catch (error: any) {
    console.error('Excel 다운로드 오류:', error);
    return NextResponse.json({ message: error?.message || '엑셀 파일 생성 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
