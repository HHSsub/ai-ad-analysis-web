// src/lib/google-drive.ts - 공유 드라이브 지원 추가
import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import ExcelJS from 'exceljs';
import { Readable } from 'stream';
import { getGlobalDB } from './sql-database';

// 기존 타입들 모두 유지
interface AnalysisResult {
  id: string;
  title: string;
  url: string;
  notes: string;
  status: string;
  analysis: { [category: string]: { [feature: string]: string } };
  completionStats: {
    completed: number;
    incomplete: number;
    total: number;
    percentage: number;
  };
  scriptLanguage: string;
  youtubeData?: {
    viewCount: number;
    likeCount: number;
    commentCount: number;
    duration: string;
    channelTitle: string;
    publishedAt: string;
    description: string;
    tags: string[];
    categoryId: string;
  };
}

interface DriveUploadResult {
  success: boolean;
  fileUrl?: string;
  fileId?: string;
  fileName?: string;
  message?: string;
  error?: string;
}

export class GoogleDriveUploader {
  private auth: JWT;
  private drive: any;

  constructor(serviceAccountKey?: any) {
    this.initializeAuth(serviceAccountKey);
  }

  private initializeAuth(serviceAccountKey?: any) {
    let credentials: any;

    if (serviceAccountKey) {
      credentials = serviceAccountKey;
    } else {
      const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_CREDENTIALS;
      
      if (serviceAccountJson) {
        try {
          credentials = JSON.parse(serviceAccountJson);
        } catch {
          throw new Error('GOOGLE_SERVICE_ACCOUNT_CREDENTIALS JSON 파싱 실패');
        }
      } else {
        credentials = {
          client_email: process.env.GOOGLE_DRIVE_CLIENT_EMAIL,
          private_key: process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, '\n')
        };
      }
    }

    if (!credentials.client_email || !credentials.private_key) {
      throw new Error('Google Drive 서비스 계정 정보가 없습니다');
    }

    this.auth = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/drive.file'
      ],
    });

    this.drive = google.drive({ version: 'v3', auth: this.auth });
    console.log(`🔐 Drive 인증 설정 완료: ${credentials.client_email}`);
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
      // ✅ 공유 드라이브 지원 추가
      const searchResponse = await this.drive.files.list({
        q: `name='${weeklyFolderName}' and parents in '${parentFolderId}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
      });
      
      if (searchResponse.data.files && searchResponse.data.files.length > 0) {
        const folderId = searchResponse.data.files[0].id;
        console.log(`📁 기존 주간 폴더 사용: ${weeklyFolderName} (${folderId})`);
        return folderId;
      }
      
      // ✅ 공유 드라이브 지원 추가
      const createResponse = await this.drive.files.create({
        requestBody: {
          name: weeklyFolderName,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [parentFolderId],
        },
        fields: 'id, name',
        supportsAllDrives: true
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
      
      // 3. 엑셀 파일 생성
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('AI Ad Analysis');

      // 헤더 설정
      const headers = [
        'ID', '제목', 'URL', '상태', '완료율(%)', '자막언어',
        '조회수', '좋아요', '댓글수', '길이', '채널', '게시일'
      ];

      // 분석 데이터 추가 (평면화)
      const flattenedData: any = {};
      Object.entries(analysisResult.analysis).forEach(([category, features]) => {
        Object.entries(features).forEach(([feature, value]) => {
          const key = `${category}_${feature}`;
          headers.push(key);
          flattenedData[key] = value;
        });
      });

      worksheet.addRow(headers);

      // 데이터 행 추가
      const dataRow = [
        analysisResult.id,
        analysisResult.title,
        analysisResult.url,
        analysisResult.status,
        analysisResult.completionStats.percentage,
        analysisResult.scriptLanguage,
        analysisResult.youtubeData?.viewCount || 0,
        analysisResult.youtubeData?.likeCount || 0,
        analysisResult.youtubeData?.commentCount || 0,
        analysisResult.youtubeData?.duration || '',
        analysisResult.youtubeData?.channelTitle || '',
        analysisResult.youtubeData?.publishedAt || ''
      ];

      // 분석 데이터 추가
      headers.slice(12).forEach(header => {
        dataRow.push(flattenedData[header] || '');
      });

      worksheet.addRow(dataRow);

      // 헤더 스타일링
      const headerRow = worksheet.getRow(1);
      headerRow.eachCell((cell) => {
        cell.font = { bold: true };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFE6F3FF' }
        };
      });

      // 컬럼 너비 자동 조정
      worksheet.columns.forEach((column) => {
        column.width = 15;
      });

      // 4. 버퍼로 변환
      const buffer = await workbook.xlsx.writeBuffer();
      const stream = Readable.from(buffer as Buffer);

      // 5. ✅ Drive에 업로드 (공유 드라이브 지원)
      const uploadResponse = await this.drive.files.create({
        requestBody: {
          name: fileName,
          parents: [weeklyFolderId],
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
        media: {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          body: stream,
        },
        fields: 'id, name, webViewLink',
        supportsAllDrives: true
      });

      // 6. ✅ 공유 설정 (공유 드라이브 지원)
      await this.drive.permissions.create({
        fileId: uploadResponse.data.id,
        requestBody: {
          role: 'reader',
          type: 'anyone',
        },
        supportsAllDrives: true
      });

      const result: DriveUploadResult = {
        success: true,
        fileId: uploadResponse.data.id,
        fileName: uploadResponse.data.name,
        fileUrl: uploadResponse.data.webViewLink,
        message: `업로드 성공: ${fileName}`
      };

      console.log(`✅ Drive 업로드 완료: ${result.fileUrl}`);
      return result;

    } catch (error: any) {
      console.error('❌ Drive 업로드 실패:', error);
      return {
        success: false,
        error: error.message,
        message: `업로드 실패: ${error.message}`
      };
    }
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      await this.auth.authorize();
      
      const folderId = this.resolveFolderId();
      // ✅ 공유 드라이브 지원 추가
      const response = await this.drive.files.get({
        fileId: folderId,
        fields: 'id, name, mimeType',
        supportsAllDrives: true
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

      // ✅ 공유 드라이브 지원 추가
      const response = await this.drive.files.list({
        q: `parents in '${parentFolderId}' and mimeType='application/vnd.google-apps.folder' and createdTime < '${cutoffDate}' and trashed=false`,
        fields: 'files(id, name, createdTime)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
      });
      
      if (response.data.files && response.data.files.length > 0) {
        for (const folder of response.data.files) {
          // ✅ 공유 드라이브 지원 추가
          await this.drive.files.delete({ 
            fileId: folder.id,
            supportsAllDrives: true
          });
          console.log(`🗑️ 오래된 폴더 삭제: ${folder.name}`);
        }
      }
      
    } catch (error) {
      console.error('❌ 폴더 정리 실패:', error);
    }
  }

  // ✅ DB CSV 업로드 기능 (공유 드라이브 지원)
  async uploadDatabaseCSV(): Promise<DriveUploadResult> {
    try {
      console.log('📊 DB에서 CSV 데이터 생성 중...');
      
      const db = getGlobalDB();
      const csvContent = db.exportToCSV();
      
      if (!csvContent || csvContent.length < 100) {
        return {
          success: false,
          error: 'CSV 데이터가 비어있거나 너무 짧습니다',
          message: 'DB에 분석 완료된 영상이 없습니다'
        };
      }

      // 폴더 준비
      const weeklyFolderId = await this.getOrCreateWeeklyFolder();
      
      // 파일명 생성
      const timestamp = new Date().toISOString().split('T')[0];
      const fileName = `youtube_analysis_database_${timestamp}.csv`;
      
      console.log(`📤 CSV 파일 업로드 시작: ${fileName}`);

      // ✅ 기존 파일 확인 (공유 드라이브 지원)
      const searchResponse = await this.drive.files.list({
        q: `name='${fileName}' and parents in '${weeklyFolderId}' and trashed=false`,
        fields: 'files(id, name)',
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
      });

      let fileId: string;
      const buffer = Buffer.from(csvContent, 'utf-8');
      const stream = Readable.from(buffer);

      if (searchResponse.data.files && searchResponse.data.files.length > 0) {
        // ✅ 기존 파일 업데이트 (공유 드라이브 지원)
        fileId = searchResponse.data.files[0].id!;
        console.log(`🔄 기존 CSV 파일 업데이트: ${fileName}`);
        
        await this.drive.files.update({
          fileId: fileId,
          media: {
            mimeType: 'text/csv',
            body: stream
          },
          supportsAllDrives: true
        });
      } else {
        // ✅ 새 파일 생성 (공유 드라이브 지원)
        console.log(`📄 새 CSV 파일 생성: ${fileName}`);
        
        const uploadResponse = await this.drive.files.create({
          requestBody: {
            name: fileName,
            parents: [weeklyFolderId],
            mimeType: 'text/csv'
          },
          media: {
            mimeType: 'text/csv',
            body: stream
          },
          fields: 'id, name, webViewLink',
          supportsAllDrives: true
        });
        
        fileId = uploadResponse.data.id!;
      }

      // ✅ 공유 설정 (공유 드라이브 지원)
      await this.drive.permissions.create({
        fileId,
        requestBody: {
          role: 'reader',
          type: 'anyone'
        },
        supportsAllDrives: true
      });

      const fileUrl = `https://drive.google.com/file/d/${fileId}/view`;
      
      console.log(`✅ DB CSV 업로드 완료: ${fileUrl}`);
      
      return {
        success: true,
        fileId,
        fileName,
        fileUrl,
        message: `DB CSV 업로드 성공: ${fileName} (156개 특성 포함)`
      };

    } catch (error: any) {
      console.error('❌ DB CSV 업로드 실패:', error);
      return {
        success: false,
        error: error.message,
        message: `DB CSV 업로드 실패: ${error.message}`
      };
    }
  }
}

// 자동 업로드 스케줄러 클래스 (기존 유지)
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

  async uploadDatabaseCSVImmediately(): Promise<DriveUploadResult> {
    console.log('🚀 DB CSV 즉시 업로드 요청');
    return await this.uploader.uploadDatabaseCSV();
  }
  
  startAutoUpload(intervalMinutes: number = 120) {
    console.log(`🔄 자동 업로드 스케줄 시작 (${intervalMinutes}분마다)`);
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    
    this.intervalId = setInterval(async () => {
      try {
        console.log('⏰ 스케줄된 자동 업로드 실행');
        const result = await this.uploader.uploadDatabaseCSV();
        if (result.success) {
          console.log(`✅ 자동 DB CSV 업로드 성공: ${result.fileName}`);
        } else {
          console.log(`❌ 자동 DB CSV 업로드 실패: ${result.message}`);
        }
      } catch (error) {
        console.error('❌ 스케줄된 업로드 실패:', error);
      }
    }, intervalMinutes * 60 * 1000);
  }
  
  stopAutoUpload() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('⏹️ 자동 업로드 스케줄 중지');
    }
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

  async testDriveAccess(): Promise<{ success: boolean; message: string }> {
    return await this.uploader.testConnection();
  }
}

// 전역 인스턴스 (기존 유지)
export const globalDriveUploader = new AutoDriveUploader();

if (typeof window === 'undefined') {
  globalDriveUploader.startAutoCleanup();
  globalDriveUploader.startAutoUpload(120);
}

// 간편 함수들
export async function uploadSingleAnalysisResult(analysisResult: AnalysisResult): Promise<DriveUploadResult> {
  return await globalDriveUploader.uploadImmediately(analysisResult);
}

export async function uploadDatabaseToCSV(): Promise<DriveUploadResult> {
  return await globalDriveUploader.uploadDatabaseCSVImmediately();
}

export async function testGoogleDriveConnection(): Promise<{ success: boolean; message: string }> {
  return await globalDriveUploader.testDriveAccess();
}
