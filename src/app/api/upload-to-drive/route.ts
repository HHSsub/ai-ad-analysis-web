// src/app/api/upload-to-drive/route.ts - 기존 파일 개선 (Excel 업로드 추가)
import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import stream from 'stream';
import * as ExcelJS from 'exceljs';

function resolveFolderId(input?: string): string | undefined {
  const envId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const candidate = input || envId;
  if (!candidate) return undefined;
  
  // URL에서 추출 지원: /folders/{id}, open?id={id}
  const foldersMatch = candidate.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (foldersMatch?.[1]) return foldersMatch[1];
  const openIdMatch = candidate.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (openIdMatch?.[1]) return openIdMatch[1];
  return candidate; // 이미 ID로 들어온 경우
}

async function getDriveClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS;
  if (!raw) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_CREDENTIALS 환경변수가 설정되어 있지 않습니다.');
  }
  const credentials = JSON.parse(raw);

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });

  const authClient = await auth.getClient();
  return google.drive({ version: 'v3', auth: authClient });
}

function inferMimeType(fileName?: string, explicit?: string) {
  if (explicit) return explicit;
  if (!fileName) return 'application/octet-stream';
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (lower.endsWith('.txt')) return 'text/plain';
  return 'application/octet-stream';
}

// --- 분석 결과를 Excel로 변환하는 함수 ---
async function createExcelFromAnalysisResults(results: any[], features: any[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'AI Ad Analysis System';
  workbook.created = new Date();

  // 메인 시트 생성
  const worksheet = workbook.addWorksheet('영상 분석 결과');

  // 헤더 정의
  const headers = [
    '순번', '영상 제목', 'URL', '채널명', '게시일', '조회수', '좋아요', '댓글수', 
    '길이', '분석 언어', '완성도(%)', '정량 점수', '정성 점수', '하이브리드 점수', '비고'
  ];

  // 156개 특징 헤더 추가
  features.forEach(feature => {
    headers.push(`${feature.No}. ${feature.Feature}`);
  });

  // 헤더 행 추가
  const headerRow = worksheet.addRow(headers);
  
  // 헤더 스타일링
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0066CC' }
    };
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
    const rowData = [
      index + 1,
      result.title,
      result.url,
      result.channelTitle || 'N/A',
      result.publishedAt ? new Date(result.publishedAt).toLocaleDateString('ko-KR') : 'N/A',
      result.viewCount ? parseInt(result.viewCount).toLocaleString() : '0',
      result.likeCount ? parseInt(result.likeCount).toLocaleString() : '0',
      result.commentCount ? parseInt(result.commentCount).toLocaleString() : '0',
      formatDuration(result.duration),
      result.scriptLanguage || 'none',
      result.completionStats?.percentage || 0,
      result.scores?.quantitative || 0,
      result.scores?.qualitative || 0,
      result.scores?.hybrid || 0,
      result.notes || ''
    ];

    // 156개 특징값 추가
    features.forEach(feature => {
      const featureKey = `feature_${feature.No}`;
      const value = result.features?.[featureKey];
      
      if (!value || value === 'undefined' || value === 'null') {
        rowData.push('분석불가/데이터없음');
      } else {
        rowData.push(value);
      }
    });

    const dataRow = worksheet.addRow(rowData);
    
    // 데이터 행 스타일링
    dataRow.eachCell((cell, colNumber) => {
      // 완성도 퍼센트는 숫자 포맷
      if (colNumber === 11) {
        cell.numFmt = '0"%"';
      }
      
      // 점수 열들은 소수점 1자리
      if (colNumber >= 12 && colNumber <= 14) {
        cell.numFmt = '0.0';
      }
      
      // 조회수, 좋아요, 댓글수는 천단위 구분
      if (colNumber >= 6 && colNumber <= 8) {
        cell.numFmt = '#,##0';
      }
      
      // 전체 셀 테두리
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
      
      // 분석불가/실패 항목은 빨간색으로 표시
      if (typeof cell.value === 'string' && 
          (cell.value.startsWith('분석불가/') || cell.value.startsWith('판단불가/'))) {
        cell.font = { color: { argb: 'FFFF0000' } };
      }
    });
  });

  // 컬럼 너비 자동 조정
  worksheet.columns.forEach((column, index) => {
    if (index < 15) {
      // 기본 메타데이터 컬럼들
      const lengths = [6, 30, 50, 20, 12, 12, 10, 10, 12, 12, 12, 12, 12, 15, 20];
      column.width = lengths[index] || 15;
    } else {
      // 특징 컬럼들
      column.width = 20;
    }
  });

  // 첫 번째 행 고정
  worksheet.views = [{
    state: 'frozen',
    ySplit: 1
  }];

  // Excel 버퍼 생성
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// --- 동영상 길이 포맷팅 함수 ---
function formatDuration(duration: string | undefined): string {
  if (!duration) return '0초';
  
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return duration;
  
  const [, hours = '0', minutes = '0', seconds = '0'] = match;
  const h = parseInt(hours);
  const m = parseInt(minutes);
  const s = parseInt(seconds);
  
  if (h > 0) return `${h}시간 ${m}분 ${s}초`;
  if (m > 0) return `${m}분 ${s}초`;
  return `${s}초`;
}

// --- 메인 POST 핸들러 ---
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // 새로운 형식: 분석 결과 업로드 (Excel)
    if (body.analysisResults && body.features) {
      return await handleAnalysisResultsUpload(body);
    }
    
    // 기존 형식: 일반 파일 업로드 (CSV, JSON 등)
    return await handleGeneralFileUpload(body);
    
  } catch (error) {
    console.error('❌ Drive 업로드 실패:', error);
    return NextResponse.json({
      success: false,
      message: '파일 업로드 중 오류가 발생했습니다.',
      error: error instanceof Error ? error.message : '알 수 없는 오류'
    }, { status: 500 });
  }
}

// --- 분석 결과 업로드 처리 ---
async function handleAnalysisResultsUpload(body: any) {
  const { analysisResults, features, fileName: customFileName, folderId } = body;
  
  console.log('📊 분석 결과 Excel 업로드 시작...');
  
  const resolvedFolderId = resolveFolderId(folderId);
  if (!resolvedFolderId) {
    return NextResponse.json({ 
      message: '업로드할 Google Drive 폴더 ID가 필요합니다.' 
    }, { status: 400 });
  }

  // Excel 파일 생성
  const excelBuffer = await createExcelFromAnalysisResults(analysisResults, features);
  
  // 파일명 생성
  const fileName = customFileName || `YouTube_분석결과_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`;
  
  const drive = await getDriveClient();

  // 기존 파일 확인 및 덮어쓰기
  const existingFiles = await drive.files.list({
    q: `'${resolvedFolderId}' in parents and name='${fileName}' and trashed=false`,
    fields: 'files(id, name)'
  });

  let fileId: string;
  let isUpdate = false;

  if (existingFiles.data.files && existingFiles.data.files.length > 0) {
    // 기존 파일 업데이트
    fileId = existingFiles.data.files[0].id!;
    isUpdate = true;
    
    const bufferStream = new stream.PassThrough();
    bufferStream.end(excelBuffer);

    await drive.files.update({
      fileId,
      media: {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: bufferStream,
      },
    });
  } else {
    // 새 파일 생성
    const bufferStream = new stream.PassThrough();
    bufferStream.end(excelBuffer);

    const response = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [resolvedFolderId],
      },
      media: {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: bufferStream,
      },
      fields: 'id, name, webViewLink',
    });
    
    fileId = response.data.id!;
  }

  // 파일 정보 가져오기
  const fileInfo = await drive.files.get({
    fileId,
    fields: 'id, name, webViewLink, size, createdTime, modifiedTime'
  });

  console.log(`✅ Excel 파일 업로드 완료: ${fileName} (${isUpdate ? '업데이트' : '신규'})`);

  return NextResponse.json({
    success: true,
    message: `분석 결과가 성공적으로 Google Drive에 ${isUpdate ? '업데이트' : '업로드'}되었습니다.`,
    fileId,
    fileName,
    webViewLink: fileInfo.data.webViewLink,
    isUpdate,
    fileSize: fileInfo.data.size,
    uploadedAt: new Date().toISOString(),
    totalResults: analysisResults.length,
    totalFeatures: features.length
  });
}

// --- 일반 파일 업로드 처리 (기존 로직) ---
async function handleGeneralFileUpload(body: any) {
  const { fileName, fileContent, folderId, contentType } = body;

  if (!fileName || !fileContent) {
    return NextResponse.json({ 
      message: 'fileName과 fileContent는 필수입니다.' 
    }, { status: 400 });
  }

  const resolvedFolderId = resolveFolderId(folderId);
  if (!resolvedFolderId) {
    return NextResponse.json({ 
      message: '업로드할 Google Drive 폴더 ID가 필요합니다.' 
    }, { status: 400 });
  }

  const drive = await getDriveClient();

  const bufferStream = new stream.PassThrough();
  bufferStream.end(Buffer.from(fileContent, 'utf-8'));

  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [resolvedFolderId],
    },
    media: {
      mimeType: inferMimeType(fileName, contentType),
      body: bufferStream,
    },
    fields: 'id, name, webViewLink, webContentLink',
  });

  return NextResponse.json({
    success: true,
    message: '파일이 성공적으로 Google Drive에 업로드되었습니다.',
    fileId: response.data.id,
    fileName: response.data.name,
    webViewLink: response.data.webViewLink,
    webContentLink: response.data.webContentLink,
  });
}
