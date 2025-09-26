// src/lib/google-drive.ts - 완전한 구글 드라이브 업로드 자동화 (156개 특징 완전 지원)
import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import { Readable } from 'stream';
import { buildWorkbookBuffer } from './excel/buildWorkbook';
import * as path from 'path';
import * as fs from 'fs';

export interface DriveUploadResult {
  success: boolean;
  fileId?: string;
  webViewLink?: string;
  overwritten?: boolean;
  error?: string;
}

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
}

export interface Feature {
  No: string;
  Category: string;
  Feature: string;
  Value?: string;
}

/**
 * CSV에서 156개 특징 완전 로딩 함수
 */
export function getFeaturesFromCSV(): Feature[] {
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
    
    // 156개가 아니면 경고
    if (features.length !== 156) {
      console.warn(`⚠️ 특징 수가 예상과 다름: ${features.length}/156`);
    }
    
    return features;
    
  } catch (error: any) {
    console.error('❌ CSV 파일 로딩 실패:', error.message);
    throw new Error(`CSV 파일 로딩 실패: ${error.message}`);
  }
}

/**
 * CSV 라인 파싱 함수 (따옴표 처리 포함)
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // 이스케이프된 따옴표
        current += '"';
        i++; // 다음 따옴표 건너뛰기
      } else {
        // 따옴표 시작/끝
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // 컬럼 구분자
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

export class GoogleDriveUploader {
  private drive: any;
  private auth: JWT;
  
  constructor() {
    const credentials = this.parseCredentials();
    
    this.auth = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/drive'
      ],
      subject: 'contact@upnexx.ai' // ← 공유드라이브에 ‘멤버’로 등록된 조직 사용자 이메일!
    });
    
    this.drive = google.drive({ version: 'v3', auth: this.auth });
  }
  
  /**
   * 환경변수에서 인증 정보 파싱 (강화된 버전)
   */
  private parseCredentials(): { client_email: string; private_key: string } {
    // 방법 1: 통합 서비스 계정 JSON
    const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS;
    if (serviceAccountJson) {
      try {
        const credentials = JSON.parse(serviceAccountJson);
        if (credentials.client_email && credentials.private_key) {
          return {
            client_email: credentials.client_email,
            private_key: this.normalizePrivateKey(credentials.private_key)
          };
        }
      } catch (error) {
        console.warn('⚠️ GOOGLE_SERVICE_ACCOUNT_CREDENTIALS 파싱 실패, 개별 환경변수 사용');
      }
    }
    
    // 방법 2: 개별 환경변수
    const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY;
    
    if (!clientEmail || !privateKey) {
      throw new Error(`
🚨 구글 드라이브 인증 정보가 설정되지 않았습니다!

다음 환경변수 중 하나를 설정하세요:

방법 1 (권장): GOOGLE_SERVICE_ACCOUNT_CREDENTIALS
- 서비스 계정 JSON을 한 줄로 설정

방법 2: 개별 환경변수
- GOOGLE_DRIVE_CLIENT_EMAIL: ${clientEmail ? '✅ 설정됨' : '❌ 누락'}
- GOOGLE_DRIVE_PRIVATE_KEY: ${privateKey ? '✅ 설정됨' : '❌ 누락'}
- GOOGLE_DRIVE_FOLDER_ID: ${process.env.GOOGLE_DRIVE_FOLDER_ID ? '✅ 설정됨' : '❌ 누락'}

현재 설정된 서비스 계정: ${clientEmail || '없음'}
      `);
    }
    
    return {
      client_email: clientEmail,
      private_key: this.normalizePrivateKey(privateKey)
    };
  }
  
  /**
   * Private Key 정규화 (이스케이프 문자, 줄바꿈 처리)
   */
  private normalizePrivateKey(key: string): string {
    if (!key) return key;
    
    // 따옴표 제거
    let normalized = key.trim();
    if ((normalized.startsWith('"') && normalized.endsWith('"')) || 
        (normalized.startsWith("'") && normalized.endsWith("'"))) {
      normalized = normalized.slice(1, -1);
    }
    
    // 이스케이프된 줄바꿈 처리
    normalized = normalized.replace(/\\n/g, '\n').replace(/\\r/g, '');
    
    // CRLF 정리
    normalized = normalized.replace(/\r\n/g, '\n').replace(/\r/g, '');
    
    // BOM 제거
    normalized = normalized.replace(/^\uFEFF/, '').trim();
    
    // PEM 형식 확인 및 보정
    if (!normalized.includes('-----BEGIN PRIVATE KEY-----')) {
      throw new Error('❌ Private Key가 올바른 PEM 형식이 아닙니다');
    }
    
    // 마지막 줄바꿈 보장
    if (!normalized.endsWith('\n')) {
      normalized += '\n';
    }
    
    return normalized;
  }
  
  /**
   * 폴더 ID 해석 (URL에서 ID 추출 지원)
   */
  private resolveFolderId(input?: string): string {
    const envId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    const candidate = input || envId;
    
    if (!candidate) {
      throw new Error('GOOGLE_DRIVE_FOLDER_ID 환경변수가 설정되지 않았습니다');
    }
    
    // URL에서 폴더 ID 추출
    const foldersMatch = candidate.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (foldersMatch?.[1]) return foldersMatch[1];
    
    const openIdMatch = candidate.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (openIdMatch?.[1]) return openIdMatch[1];
    
    return candidate; // 이미 ID로 제공된 경우
  }
  
  /**
   * 주간 폴더명 생성 (YYYY-MM-DD_to_YYYY-MM-DD 형식)
   */
  private getWeeklyFolderName(): string {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - now.getDay() + 1); // 이번 주 월요일
    
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6); // 이번 주 일요일
    
    const formatDate = (date: Date) => date.toISOString().split('T')[0];
    
    return `${formatDate(monday)}_to_${formatDate(sunday)}`;
  }
  
  /**
   * 주간 폴더 생성 또는 찾기
   */
  private async getOrCreateWeeklyFolder(parentFolderId: string): Promise<string> {
    const weeklyFolderName = this.getWeeklyFolderName();
    
    try {
      // 기존 주간 폴더 검색
      const searchResponse = await this.drive.files.list({
        q: `name='${weeklyFolderName}' and parents in '${parentFolderId}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name)',
      });
      
      if (searchResponse.data.files && searchResponse.data.files.length > 0) {
        console.log(`📁 기존 주간 폴더 사용: ${weeklyFolderName} (${searchResponse.data.files[0].id})`);
        return searchResponse.data.files[0].id;
      }
      
      // 새 주간 폴더 생성
      const createResponse = await this.drive.files.create({
        resource: {
          name: weeklyFolderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [parentFolderId],
        },
        fields: 'id, name',
      });
      
      console.log(`📁 새 주간 폴더 생성: ${weeklyFolderName} (${createResponse.data.id})`);
      return createResponse.data.id;
      
    } catch (error: any) {
      console.error('❌ 주간 폴더 생성/검색 실패:', error.message);
      throw new Error(`주간 폴더 처리 실패: ${error.message}`);
    }
  }
  
  /**
   * 기존 파일 검색 (제목 기반)
   */
  private async findExistingFile(titlePattern: string, folderId: string): Promise<string | null> {
    try {
      // 안전한 제목으로 변환
      const safeTitle = titlePattern.replace(/[\\/:*?"<>|]/g, '_').substring(0, 50);
      
      const response = await this.drive.files.list({
        q: `parents in '${folderId}' and name contains '${safeTitle}' and trashed=false`,
        fields: 'files(id, name, modifiedTime)',
        orderBy: 'modifiedTime desc'
      });
      
      if (response.data.files && response.data.files.length > 0) {
        console.log(`🔍 기존 파일 발견: ${response.data.files[0].name}`);
        return response.data.files[0].id;
      }
      
      return null;
    } catch (error: any) {
      console.warn('⚠️ 기존 파일 검색 중 오류:', error.message);
      return null;
    }
  }
  
  /**
   * 단일 분석 결과를 Excel로 업로드 (메인 함수)
   */
  async uploadAnalysisResult(analysisResult: AnalysisResult): Promise<DriveUploadResult> {
    try {
      // 분석 완료 여부 검증
      if (!analysisResult || analysisResult.status !== 'completed' || !analysisResult.analysis) {
        console.log(`⏭️ 분석 미완료로 업로드 건너뛰기: ${analysisResult?.title || 'Unknown'}`);
        return { 
          success: false, 
          error: '분석이 완료되지 않았습니다' 
        };
      }
      
      // 파일명 생성
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
      const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
      
      const safeTitle = analysisResult.title.replace(/[\\/:*?"<>|]/g, '_').substring(0, 50);
      const fileName = `youtube_analysis_${safeTitle}_${dateStr}_${timeStr}.xlsx`;
      
      console.log(`📤 드라이브 업로드 시작: ${fileName}`);
      
      // 폴더 준비
      const parentFolderId = this.resolveFolderId();
      const weeklyFolderId = await this.getOrCreateWeeklyFolder(parentFolderId);
      
      // 기존 파일 검색
      const existingFileId = await this.findExistingFile(safeTitle, weeklyFolderId);
      
      // Excel 버퍼 생성 (156개 특징 모두 포함)
      let excelBuffer: Buffer;
      try {
        excelBuffer = await buildWorkbookBuffer([analysisResult], 'YouTube AI Analysis');
        console.log(`📊 Excel 파일 생성 완료: ${excelBuffer.length} bytes`);
      } catch (error: any) {
        throw new Error(`Excel 파일 생성 실패: ${error.message}`);
      }
      
      // 업로드 실행
      let response;
      let overwritten = false;
      
      const uploadParams = {
        resource: {
          name: fileName,
          parents: [weeklyFolderId],
        },
        media: {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          body: Readable.from(excelBuffer),
        },
        fields: 'id, name, webViewLink, createdTime, modifiedTime',
      };
      
      if (existingFileId) {
        // 기존 파일 업데이트
        response = await this.drive.files.update({
          fileId: existingFileId,
          media: uploadParams.media,
          fields: uploadParams.fields,
        });
        overwritten = true;
        console.log(`🔄 기존 파일 업데이트: ${fileName}`);
      } else {
        // 새 파일 생성
        response = await this.drive.files.create(uploadParams);
        console.log(`📊 새 파일 생성: ${fileName}`);
      }
      
      const result = {
        success: true,
        fileId: response.data.id,
        webViewLink: response.data.webViewLink,
        overwritten
      };
      
      console.log(`✅ 드라이브 업로드 성공: ${response.data.name}`);
      console.log(`🔗 파일 링크: ${response.data.webViewLink}`);
      
      return result;
      
    } catch (error: any) {
      const errorMessage = error.message || '알 수 없는 오류';
      console.error('❌ 드라이브 업로드 실패:', errorMessage);
      console.error('분석 결과 정보:', {
        title: analysisResult?.title,
        url: analysisResult?.url,
        status: analysisResult?.status,
        hasAnalysis: !!analysisResult?.analysis
      });
      
      return { 
        success: false, 
        error: errorMessage 
      };
    }
  }
  
  /**
   * 일괄 업로드 (여러 분석 결과)
   */
  async uploadBatchAnalysisResults(analysisResults: AnalysisResult[]): Promise<{
    total: number;
    success: number;
    failed: number;
    results: Array<{ title: string } & DriveUploadResult>;
  }> {
    const results = [];
    let successCount = 0;
    let failedCount = 0;
    
    console.log(`📤 일괄 업로드 시작: ${analysisResults.length}개 파일`);
    
    for (let i = 0; i < analysisResults.length; i++) {
      const result = analysisResults[i];
      
      try {
        console.log(`[${i + 1}/${analysisResults.length}] 업로드 진행: ${result.title}`);
        
        const uploadResult = await this.uploadAnalysisResult(result);
        
        if (uploadResult.success) {
          successCount++;
        } else {
          failedCount++;
        }
        
        results.push({
          title: result.title,
          ...uploadResult
        });
        
        // API 제한 방지 (500ms 대기)
        if (i < analysisResults.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
      } catch (error: any) {
        console.error(`❌ 업로드 실패: ${result.title}`, error.message);
        failedCount++;
        results.push({
          title: result.title,
          success: false,
          error: error.message
        });
      }
    }
    
    console.log(`📊 일괄 업로드 완료: 성공 ${successCount}개, 실패 ${failedCount}개`);
    
    return {
      total: analysisResults.length,
      success: successCount,
      failed: failedCount,
      results
    };
  }
  
  /**
   * 드라이브 권한 테스트
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const folderId = this.resolveFolderId();
      
      // 폴더 접근 테스트
      const folderInfo = await this.drive.files.get({
        fileId: folderId,
        fields: 'id, name, permissions'
      });
      
      console.log(`✅ 드라이브 연결 테스트 성공`);
      console.log(`📁 대상 폴더: ${folderInfo.data.name} (${folderInfo.data.id})`);
      
      return {
        success: true,
        message: `연결 성공: ${folderInfo.data.name} 폴더에 접근 가능`
      };
      
    } catch (error: any) {
      console.error('❌ 드라이브 연결 테스트 실패:', error.message);
      
      let message = '드라이브 연결 실패: ';
      if (error.message.includes('File not found')) {
        message += '폴더 ID가 잘못되었거나 서비스 계정에 권한이 없습니다';
      } else if (error.message.includes('auth')) {
        message += '인증 정보가 잘못되었습니다';
      } else {
        message += error.message;
      }
      
      return { success: false, message };
    }
  }
  
  /**
   * 폴더 정리 (30일 이상 된 주간 폴더 삭제)
   */
  async cleanupOldFolders(): Promise<void> {
    try {
      const parentFolderId = this.resolveFolderId();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const response = await this.drive.files.list({
        q: `parents in '${parentFolderId}' and mimeType='application/vnd.google-apps.folder' and modifiedTime < '${thirtyDaysAgo.toISOString()}' and trashed=false`,
        fields: 'files(id, name, modifiedTime)',
      });
      
      if (response.data.files && response.data.files.length > 0) {
        for (const folder of response.data.files) {
          await this.drive.files.delete({ fileId: folder.id });
          console.log(`🗑️ 오래된 폴더 삭제: ${folder.name}`);
        }
        console.log(`🧹 정리 완료: ${response.data.files.length}개 폴더 삭제`);
      } else {
        console.log('🧹 삭제할 오래된 폴더 없음');
      }
      
    } catch (error: any) {
      console.error('❌ 폴더 정리 실패:', error.message);
    }
  }
}

/**
 * 자동 업로드 관리자
 */
export class AutoDriveUploader {
  private uploader: GoogleDriveUploader;
  private cleanupInterval: NodeJS.Timeout | null = null;
  
  constructor() {
    this.uploader = new GoogleDriveUploader();
  }
  
  /**
   * 즉시 업로드 (분석 완료 시 호출)
   */
  async uploadImmediately(analysisResult: AnalysisResult): Promise<DriveUploadResult> {
    console.log(`🚀 즉시 업로드 요청: ${analysisResult.title}`);
    return await this.uploader.uploadAnalysisResult(analysisResult);
  }
  
  /**
   * 일괄 업로드
   */
  async uploadBatch(analysisResults: AnalysisResult[]) {
    return await this.uploader.uploadBatchAnalysisResults(analysisResults);
  }
  
  /**
   * 연결 테스트
   */
  async testConnection() {
    return await this.uploader.testConnection();
  }
  
  /**
   * 자동 정리 스케줄 시작 (매일 새벽 3시)
   */
  startAutoCleanup(): void {
    if (this.cleanupInterval) {
      console.log('⚠️ 자동 정리가 이미 실행 중입니다');
      return;
    }
    
    console.log('🔄 자동 정리 스케줄 시작 (매일 새벽 3시)');
    
    const scheduleNextCleanup = () => {
      const now = new Date();
      const targetTime = new Date();
      targetTime.setHours(3, 0, 0, 0); // 새벽 3시 설정
      
      // 오늘 새벽 3시가 지났으면 내일로 설정
      if (now > targetTime) {
        targetTime.setDate(targetTime.getDate() + 1);
      }
      
      const msUntilCleanup = targetTime.getTime() - now.getTime();
      console.log(`⏰ 다음 정리 예정: ${targetTime.toLocaleString()}`);
      
      this.cleanupInterval = setTimeout(async () => {
        try {
          await this.uploader.cleanupOldFolders();
        } catch (error: any) {
          console.error('❌ 스케줄된 정리 실패:', error.message);
        }
        
        // 다음 정리 예약
        scheduleNextCleanup();
      }, msUntilCleanup);
    };
    
    scheduleNextCleanup();
  }
  
  /**
   * 자동 정리 중지
   */
  stopAutoCleanup(): void {
    if (this.cleanupInterval) {
      clearTimeout(this.cleanupInterval);
      this.cleanupInterval = null;
      console.log('⏹️ 자동 정리 스케줄 중지');
    }
  }
}

// 전역 인스턴스 (싱글톤)
export const globalDriveUploader = new AutoDriveUploader();

// 서버 사이드에서만 자동 정리 시작
if (typeof window === 'undefined') {
  try {
    globalDriveUploader.startAutoCleanup();
  } catch (error: any) {
    console.warn('⚠️ 자동 정리 시작 실패:', error.message);
  }
}
