import { google } from 'googleapis';
import { buildWorkbookBuffer } from './excel/buildWorkbook';

export class GoogleDriveUploader {
  private drive: any;
  
  constructor(credentials: { clientEmail: string; privateKey: string }) {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: credentials.clientEmail,
        private_key: credentials.privateKey,
      },
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    });
    
    this.drive = google.drive({ version: 'v3', auth });
  }
  
  /**
   * 주간 폴더명 생성 (예: "2025-01-20_to_2025-01-26")
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
        q: `name='${weeklyFolderName}' and parents in '${parentFolderId}' and mimeType='application/vnd.google-apps.folder'`,
        fields: 'files(id, name)',
      });
      
      if (searchResponse.data.files && searchResponse.data.files.length > 0) {
        console.log(`📁 기존 주간 폴더 사용: ${weeklyFolderName}`);
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
      
      console.log(`📁 새 주간 폴더 생성: ${weeklyFolderName}`);
      return createResponse.data.id;
      
    } catch (error) {
      console.error('❌ 주간 폴더 생성/검색 실패:', error);
      throw error;
    }
  }
  
  /**
   * 기존 파일 검색
   */
  private async findExistingFile(fileName: string, folderId: string): Promise<string | null> {
    try {
      const response = await this.drive.files.list({
        q: `name='${fileName}' and parents in '${folderId}'`,
        fields: 'files(id, name, modifiedTime)',
      });
      
      if (response.data.files && response.data.files.length > 0) {
        return response.data.files[0].id;
      }
      
      return null;
    } catch (error) {
      console.error('❌ 기존 파일 검색 실패:', error);
      return null;
    }
  }
  
  /**
   * 단일 영상 분석 결과를 Excel로 업로드
   */
  async uploadAnalysisResult(analysisResult: any): Promise<{ success: boolean; fileId?: string; webViewLink?: string; overwritten?: boolean }> {
    try {
      // 분석 실패한 경우 건너뛰기
      if (!analysisResult || analysisResult.status !== 'completed' || !analysisResult.analysis) {
        console.log(`⏭️ 분석 미완료 영상 건너뛰기: ${analysisResult?.title || 'Unknown'}`);
        return { success: false };
      }
      
      // 파일명 생성
      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, '-').split('T');
      const dateStr = timestamp[0];
      const timeStr = timestamp[1].substring(0, 8); // HH-MM-SS
      
      const safeTitle = analysisResult.title.replace(/[\\/:*?"<>|]/g, '_').substring(0, 50);
      const fileName = `youtube_analysis_${safeTitle}_${dateStr}_${timeStr}.xlsx`;
      
      // 주간 폴더 생성/찾기
      const parentFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
      if (!parentFolderId) {
        throw new Error('GOOGLE_DRIVE_FOLDER_ID 환경변수가 설정되지 않았습니다.');
      }
      
      const weeklyFolderId = await this.getOrCreateWeeklyFolder(parentFolderId);
      
      // 기존 파일 검색 (같은 제목의 파일)
      const searchPattern = `youtube_analysis_${safeTitle}_*`;
      const existingFileId = await this.findExistingFile(searchPattern, weeklyFolderId);
      
      // Excel 버퍼 생성 (156개 feature 포함)
      const excelBuffer = await buildWorkbookBuffer([analysisResult], 'YouTube AI Analysis');
      
      let response;
      let overwritten = false;
      
      if (existingFileId) {
        // 기존 파일 덮어쓰기
        response = await this.drive.files.update({
          fileId: existingFileId,
          media: {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            body: excelBuffer,
          },
          fields: 'id, name, webViewLink, modifiedTime',
        });
        overwritten = true;
        console.log(`🔄 기존 파일 덮어쓰기: ${fileName}`);
      } else {
        // 새 파일 생성
        response = await this.drive.files.create({
          resource: {
            name: fileName,
            parents: [weeklyFolderId],
          },
          media: {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            body: excelBuffer,
          },
          fields: 'id, name, webViewLink, createdTime',
        });
        console.log(`📊 새 파일 업로드: ${fileName}`);
      }
      
      console.log(`✅ Drive 업로드 성공: ${response.data.name}`);
      console.log(`🔗 파일 링크: ${response.data.webViewLink}`);
      
      return {
        success: true,
        fileId: response.data.id,
        webViewLink: response.data.webViewLink,
        overwritten
      };
      
    } catch (error) {
      console.error('❌ Drive 업로드 실패:', error);
      console.error('영상 정보:', {
        title: analysisResult?.title,
        url: analysisResult?.url,
        status: analysisResult?.status
      });
      
      return { success: false };
    }
  }
  
  /**
   * 여러 영상 분석 결과를 일괄 업로드
   */
  async uploadBatchAnalysisResults(analysisResults: any[]): Promise<{ total: number; success: number; failed: number; results: any[] }> {
    const results = [];
    let successCount = 0;
    let failedCount = 0;
    
    console.log(`📤 일괄 업로드 시작: ${analysisResults.length}개 파일`);
    
    for (let i = 0; i < analysisResults.length; i++) {
      const result = analysisResults[i];
      
      try {
        console.log(`[${i + 1}/${analysisResults.length}] 업로드 중: ${result.title}`);
        
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
        
        // API 제한 방지를 위한 대기 (500ms)
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error(`❌ 업로드 실패: ${result.title}`, error);
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
   * 폴더 정리 (30일 이상 된 주간 폴더 삭제)
   */
  async cleanupOldFolders(): Promise<void> {
    try {
      const parentFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
      if (!parentFolderId) return;
      
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const response = await this.drive.files.list({
        q: `parents in '${parentFolderId}' and mimeType='application/vnd.google-apps.folder' and modifiedTime < '${thirtyDaysAgo.toISOString()}'`,
        fields: 'files(id, name, modifiedTime)',
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
    this.uploader = new GoogleDriveUploader({
      clientEmail: process.env.GOOGLE_DRIVE_CLIENT_EMAIL!,
      privateKey: process.env.GOOGLE_DRIVE_PRIVATE_KEY!.replace(/\\n/g, '\n')
    });
  }
  
  /**
   * 즉시 업로드 (분석 완료 즉시 호출용)
   */
  async uploadImmediately(analysisResult: any): Promise<any> {
    console.log(`🚀 즉시 업로드 시작: ${analysisResult.title}`);
    return await this.uploader.uploadAnalysisResult(analysisResult);
  }
  
  /**
   * 자동 정리 스케줄 시작 (매일 새벽 3시에 오래된 폴더 정리)
   */
  startAutoCleanup() {
    console.log('🔄 자동 정리 스케줄 시작 (매일 새벽 3시)');
    
    const scheduleCleanup = () => {
      const now = new Date();
      const targetTime = new Date();
      targetTime.setHours(3, 0, 0, 0); // 새벽 3시
      
      if (now > targetTime) {
        targetTime.setDate(targetTime.getDate() + 1); // 다음날 새벽 3시
      }
      
      const timeUntilCleanup = targetTime.getTime() - now.getTime();
      
      setTimeout(async () => {
        await this.uploader.cleanupOldFolders();
        scheduleCleanup(); // 다음 정리 예약
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

// 앱 시작시 자동 정리 스케줄 시작
if (typeof window === 'undefined') { // 서버 사이드에서만 실행
  globalDriveUploader.startAutoCleanup();
}
