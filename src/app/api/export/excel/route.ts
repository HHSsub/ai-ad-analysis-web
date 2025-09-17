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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const items: AnalysisItem[] = Array.isArray(body?.items) ? body.items : [];
    const fileName: string = body?.fileName || `analysis-${Date.now()}.xlsx`;
    const workbookTitle: string | undefined = body?.workbookTitle;

    if (!items.length) {
      return NextResponse.json({ message: '내보낼 items가 비어 있습니다.' }, { status: 400 });
    }

    const buffer = await buildWorkbookBuffer(items, workbookTitle);

    const headers = new Headers();
    headers.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    headers.set('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);

    return new NextResponse(buffer, { status: 200, headers });
  } catch (error: any) {
    console.error('엑셀 생성 오류:', error);
    return NextResponse.json({ message: error?.message || '엑셀 생성 중 오류' }, { status: 500 });
  }
}