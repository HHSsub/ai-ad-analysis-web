// src/lib/google-drive.ts (기존 파일 완전 교체)
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
 * CSV에서 156개 특징 완전 로딩 함수 (수정됨)
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
    console.log(`📄 CSV 파일에서 ${lines.length}줄 읽음`);
    
    // 헤더 스킵하고 데이터 라인만
    const dataLines = lines.slice(1);
    
    const features: Feature[] = [];
    
    for (let i = 0; i < dataLines.length; i++) {
      const line = dataLines[i];
      if (!line.trim()) continue;
      
      const columns = parseCsvLine(line);
      
      if (columns.length >= 3) {
        const [no, category, feature] = columns;
        
        // 필수 필드 검증 - 경고만 출력하고 계속 진행
        if (!no?.trim() || !category?.trim() || !feature?.trim()) {
          // 빈 줄은 조용히 스킵
          if (line.trim()) {
            console.warn(`⚠️ Line ${i + 2}: 필수 필드 누락`);
          }
          continue;
        }
        
        features.push({
          No: no.trim(),
          Category: category.trim(),
          Feature: feature.trim(),
          Value: columns[3]?.trim() || ''
        });
      }
    }
    
    console.log(`📊 CSV에서 ${features.length}개 특징 로드 완료`);
    
    if (features.length !== 156) {
      console.warn(`⚠️ 특징 수가 예상과 다름: ${features.length}/156`);
    }
    
    return features;
    
  } catch (error: any) {
    console.error('❌ CSV 파일 로딩 실패:', error.message);
    // 폴백: 156개 기본 특징 생성
    return generateFallbackFeatures();
  }
}

function generateFallbackFeatures(): Feature[] {
  const categories = [
    '인물 분석', '감정 분석', '시각적 요소', '오디오 분석', 
    '브랜드 요소', '촬영 기법', '편집 기법', '텍스트 분석', 
    '상황/컨텍스트', '종합 분석'
  ];
  
  const features: Feature[] = [];
  
  for (let i = 1; i <= 156; i++) {
    const categoryIndex = Math.floor((i - 1) / 16) % categories.length;
    const featureIndex = ((i - 1) % 16) + 1;
    
    features.push({
      No: i.toString(),
      Category: categories[categoryIndex],
      Feature: `특징 ${featureIndex}`,
      Value: ''
    });
  }
  
  console.log('🔧 폴백으로 156개 기본 특징 생성됨');
  return features;
}

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
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current);
  return result.map(col => col.trim());
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
      ]
    });
    
    this.drive = google.drive({ version: 'v3', auth: this.auth });
    
    console.log(`🔐 Drive 인증 설정 완료: ${credentials.client_email}`);
  }
  
  private parseCredentials(): { client_email: string; private_key: string } {
    const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS;
    if (serviceAccountJson) {
      try {
        const credentials = JSON.parse(serviceAccountJson);
        return {
          client_email: credentials.client_email,
          private_key: credentials.private_key.replace(/\\n/g, '\n')
        };
      } catch (error) {
        console.warn('⚠️ JSON 인증 실패, 개별 환경변수 사용');
      }
    }
    
    const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    
    if (!clientEmail || !privateKey) {
      throw new Error('Google Drive 인증 정보가 설정되지 않았습니다');
    }
    
    return { client_email: clientEmail, private_key: privateKey };
  }
  
  private resolveFolderId(input?: string): string {
    const envId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    const candidate = input || envId;
    
    if (!candidate) {
      throw new Error('GOOGLE_DRIVE_FOLDER_ID 환경변수가 설정되지 않았습니다');
    }
    
    console.log(`🔍 폴더 ID 해석 중: ${candidate}`);
    
    // URL에서 폴더 ID 추출
    const foldersMatch = candidate.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (foldersMatch?.[1]) {
      console.log(`✅ URL에서 폴더 ID 추출: ${foldersMatch[1]}`);
      return foldersMatch[1];
    }
    
    console.log(`✅ 폴더 ID 사용: ${candidate}`);
    return candidate;
  }
  
  private getWeeklyFolderName(): string {
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - now.getDay() + 1);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    
    const formatDate = (date: Date) => date.toISOString().split('T')[0];
    return `${formatDate(monday)}_to_${formatDate(sunday)}`;
  }
  
  private async getOrCreateWeeklyFolder(): Promise<string> {
    const parentFolderId = this.resolveFolderId();
    const weeklyFolderName = this.getWeeklyFolderName();
    
    console.log(`📁 주간 폴더 확인: ${weeklyFolderName} in ${parentFolderId}`);
    
    try {
      const searchResponse = await this.drive.files.list({
        q: `name='${weeklyFolderName}' and parents in '${parentFolderId}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name)',
      });
      
      if (searchResponse.data.files && searchResponse.data.files.length > 0) {
        const folderId = searchResponse.data.files[0].id;
        console.log(`📁 기존 주간 폴더 사용: ${weeklyFolderName} (${folderId})`);
        return folderId;
      }
      
      const createResponse = await this.drive.files.create({
        requestBody: {
          name: weeklyFolderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [parentFolderId],
        },
        fields: 'id, name',
      });
      
      const folderId = createResponse.data.id;
      console.log(`📁 새 주간 폴더 생성: ${weeklyFolderName} (${folderId})`);
      return folderId;
      
    } catch (error: any) {
      console.error('❌ 주간 폴더 처리 실패:', error.message);
      console.log(`🔄 폴백: 상위 폴더 직접 사용 - ${parentFolderId}`);
      return parentFolderId;
    }
  }
  
  async uploadAnalysisResult(analysisResult: AnalysisResult): Promise<DriveUploadResult> {
    try {
      console.log(`🚀 Google Drive 업로드 시작: ${analysisResult.title}`);
      
      // 1. 폴더 준비
      const weeklyFolderId = await this.getOrCreateWeeklyFolder();
      
      // 2. 파일명 생성
      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const safeTitle = analysisResult.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 50);
      const fileName = `youtube_analysis_${safeTitle}_${timestamp}.xlsx`;
      
      // 3. Excel 워크북 생성 (156개 특징 완전 포함)
      console.log('📊 Excel 워크북 생성 시작...');
      const buffer = await buildWorkbookBuffer([analysisResult]);
      console.log(`📊 Excel 파일 생성 완료: ${buffer.length} bytes`);
      
      // 4. Drive에 업로드
      const mediaStream = Readable.from(buffer);
      
      const response = await this.drive.files.create({
        requestBody: {
          name: fileName,
          parents: [weeklyFolderId],
        },
        media: {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          body: mediaStream,
        },
        fields: 'id, name, webViewLink, webContentLink',
      });
      
      const fileId = response.data.id;
      const webViewLink = response.data.webViewLink;
      
      console.log(`✅ 드라이브 업로드 성공: ${fileName}`);
      console.log(`🔗 파일 링크: ${webViewLink}`);
      
      return {
        success: true,
        fileId,
        webViewLink,
        overwritten: false
      };
      
    } catch (error: any) {
      console.error('❌ 드라이브 업로드 실패:', error.message);
      
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const folderId = this.resolveFolderId();
      console.log(`🧪 드라이브 연결 테스트: 폴더 ${folderId}`);
      
      const response = await this.drive.files.get({
        fileId: folderId,
        fields: 'id, name, mimeType'
      });
      
      console.log(`✅ 폴더 접근 성공: ${response.data.name}`);
      
      return {
        success: true,
        message: `폴더 접근 성공: ${response.data.name} (${folderId})`
      };
      
    } catch (error: any) {
      console.error('❌ 드라이브 연결 테스트 실패:', error.message);
      
      return {
        success: false,
        message: `연결 실패: ${error.message}`
      };
    }
  }
  
  async cleanupOldFolders(): Promise<void> {
    try {
      const parentFolderId = this.resolveFolderId();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const cutoffDate = thirtyDaysAgo.toISOString();

      const response = await this.drive.files.list({
        q: `parents in '${parentFolderId}' and mimeType='application/vnd.google-apps.folder' and createdTime < '${cutoffDate}' and trashed=false`,
        fields: 'files(id, name, createdTime)'
      });
      
      if (response.data.files && response.data.files.length > 0) {
        for (const folder of response.data.files) {
          await this.drive.files.delete({ fileId: folder.id });
          console.log(`🗑️ 오래된 폴더 삭제: ${folder.name}`);
        }
      }
      
    } catch (error) {
      console.error('❌ 폴더 정리 실패:', error);
    }
  }
}

// 자동 업로드 스케줄러
export class AutoDriveUploader {
  private uploader: GoogleDriveUploader;
  private intervalId: NodeJS.Timeout | null = null;
  
  constructor() {
    this.uploader = new GoogleDriveUploader();
  }
  
  async uploadImmediately(analysisResult: any): Promise<any> {
    console.log(`🚀 즉시 업로드 요청: ${analysisResult.title}`);
    return await this.uploader.uploadAnalysisResult(analysisResult);
  }
  
  startAutoCleanup() {
    console.log('🔄 자동 정리 스케줄 시작 (매일 새벽 3시)');
    
    const scheduleCleanup = () => {
      const now = new Date();
      const targetTime = new Date();
      targetTime.setHours(3, 0, 0, 0);
      
      if (now > targetTime) {
        targetTime.setDate(targetTime.getDate() + 1);
      }
      
      const timeUntilCleanup = targetTime.getTime() - now.getTime();
      
      setTimeout(async () => {
        await this.uploader.cleanupOldFolders();
        scheduleCleanup();
      }, timeUntilCleanup);
    };
    
    scheduleCleanup();
  }
  
  stopAutoCleanup() {
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
      console.log('⏹️ 자동 정리 스케줄 중지');
    }
  }
}

// 전역 인스턴스
export const globalDriveUploader = new AutoDriveUploader();

if (typeof window === 'undefined') {
  globalDriveUploader.startAutoCleanup();
}
