import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';

export async function POST(req: NextRequest) {
  try {
    const { video } = await req.json();

    if (!video || !video.analysis) {
      return NextResponse.json({ message: '분석 데이터가 없습니다.' }, { status: 400 });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('영상 분석 결과');

    // 헤더 추가
    const headers = ['영상 제목', '영상 링크', '분석 생성 시점'];
    const featureHeaders: string[] = [];
    
    // 카테고리별 피처 헤더 추출
    for (const category in video.analysis) {
      for (const feature in video.analysis[category]) {
        featureHeaders.push(feature);
      }
    }
    worksheet.addRow([...headers, ...featureHeaders]);

    // 데이터 추가
    const rowData: string[] = [
      video.title,
      video.url,
      new Date().toLocaleString(), // 현재 분석 생성 시점
    ];

    const featureValues: string[] = [];
    for (const category in video.analysis) {
      for (const feature in video.analysis[category]) {
        featureValues.push(video.analysis[category][feature]);
      }
    }
    worksheet.addRow([...rowData, ...featureValues]);

    // 엑셀 파일 버퍼 생성
    const buffer = await workbook.xlsx.writeBuffer();

    // 응답 헤더 설정
    const responseHeaders = new Headers();
    responseHeaders.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    responseHeaders.set('Content-Disposition', `attachment; filename="${encodeURIComponent(video.title)}_분석결과.xlsx"`);

    return new NextResponse(buffer, { headers: responseHeaders });

  } catch (error: any) {
    console.error("Excel 다운로드 오류:", error);
    const errorMessage = error instanceof Error ? error.message : 'Excel 파일 생성 중 오류가 발생했습니다.';
    return NextResponse.json({ message: errorMessage }, { status: 500 });
  }
}
