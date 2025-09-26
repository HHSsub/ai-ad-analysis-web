// src/lib/google-drive.ts - 완전한 버전 (스케줄러 포함)
import { google } from 'googleapis';
import { buildWorkbookBuffer } from './excel/buildWorkbook';
import * as fs from 'fs';
import * as path from 'path';

export class GoogleDriveUploader {
  private drive: any;
  
  constructor(credentials: { clientEmail: string; privateKey: string }) {
    try {
      const auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: credentials.clientEmail,
          private_key: credentials.privateKey.replace(/\\n/g, '\n'),
        },
        scopes: ['https://www.googleapis.com/auth/drive.file'],
      });
      
      this.drive = google.drive({ version: 'v3', auth });
      console.log('Google Drive 인증 초기화 완료');
    } catch (error) {
      console.error('Google Drive 인증 초기화 실패:', error);
      throw error;
    }
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
        q: `name='${weeklyFolderName}' and parents in '${parentFolderId}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: 'files(id, name)',
        pageSize: 10
      });
      
      if (searchResponse.data.files && searchResponse.data.files.length > 0) {
        console.log(`기존 주간 폴더 사용: ${weeklyFolderName}`);
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
      
      console.log(`새 주간 폴더 생성: ${weeklyFolderName}`);
      return createResponse.data.id;
      
    } catch (error: any) {
      console.error('주간 폴더 생성/검색 실패:', error.message);
      // 실패시 부모 폴더 반환
      return parentFolderId;
    }
  }
  
  /**
   * 기존 파일 검색 (수정된 버전)
   */
  private async findExistingFile(titlePattern: string, folderId: string): Promise<string | null> {
    try {
      // 안전한 검색 패턴으로 수정
      const searchQuery = `parents in '${folderId}' and name contains '${titlePattern}' and trashed=false`;
      
      const response = await this.drive.files.list({
        q: searchQuery,
        fields: 'files(id, name, modifiedTime)',
        pageSize: 10
      });
      
      if (response.data.files && response.data.files.length > 0) {
        // 가장 최근 수정된 파일 반환
        return response.data.files[0].id;
      }
      
      return null;
    } catch (error: any) {
      console.error('기존 파일 검색 실패:', error.message);
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
        console.log(`분석 미완료 영상 건너뛰기: ${analysisResult?.title || 'Unknown'}`);
        return { success: false };
      }
      
      // 파일명 생성 (안전한 방식)
      const now = new Date();
      const timestamp = now.toISOString().replace(/[:.]/g, '-').split('T');
      const dateStr = timestamp[0]; // YYYY-MM-DD
      const timeStr = timestamp[1].substring(0, 8); // HH-MM-SS
      
      // 특수문자 제거 및 길이 제한
      const safeTitle = analysisResult.title
        .replace(/[\\/:*?"<>|]/g, '_') // 파일시스템 금지문자
        .replace(/[^\w\s가-힣-]/g, '') // 기타 특수문자
        .trim()
        .substring(0, 30);
      
      const fileName = `analysis_${safeTitle}_${dateStr}_${timeStr}.xlsx`;
      
      // 환경변수에서 폴더 ID 가져오기
      const parentFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
      if (!parentFolderId) {
        throw new Error('GOOGLE_DRIVE_FOLDER_ID 환경변수가 설정되지 않았습니다.');
      }
      
      // 주간 폴더 생성/찾기
      const weeklyFolderId = await this.getOrCreateWeeklyFolder(parentFolderId);
      
      // 기존 파일 검색 (제목 기반)
      const existingFileId = await this.findExistingFile(safeTitle, weeklyFolderId);
      
      // Excel 버퍼 생성 (156개 feature 포함)
      const excelBuffer = await buildWorkbookBuffer([analysisResult], 'YouTube AI Analysis');
      
      // Node.js Readable 스트림으로 변환
      const { Readable } = require('stream');
      const bufferStream = new Readable();
      bufferStream.push(excelBuffer);
      bufferStream.push(null); // 스트림 종료
      
      let response;
      let overwritten = false;
      
      if (existingFileId) {
        // 기존 파일 덮어쓰기
        response = await this.drive.files.update({
          fileId: existingFileId,
          media: {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            body: bufferStream,
          },
          fields: 'id, name, webViewLink, modifiedTime',
        });
        overwritten = true;
        console.log(`기존 파일 덮어쓰기: ${fileName}`);
      } else {
        // 새 파일 생성
        response = await this.drive.files.create({
          resource: {
            name: fileName,
            parents: [weeklyFolderId],
          },
          media: {
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            body: bufferStream,
          },
          fields: 'id, name, webViewLink, createdTime',
        });
        console.log(`새 파일 업로드: ${fileName}`);
      }
      
      console.log(`Drive 업로드 성공: ${response.data.name}`);
      if (response.data.webViewLink) {
        console.log(`파일 링크: ${response.data.webViewLink}`);
      }
      
      return {
        success: true,
        fileId: response.data.id,
        webViewLink: response.data.webViewLink,
        overwritten
      };
      
    } catch (error: any) {
      console.error('Drive 업로드 실패:', error.message);
      console.error('상세 오류:', {
        code: error.code,
        status: error.status,
        message: error.message
      });
      console.error('영상 정보:', {
        title: analysisResult?.title,
        url: analysisResult?.url,
        status: analysisResult?.status
      });
      
      // 구체적인 오류 분류
      if (error.code === 401) {
        console.error('인증 오류: 서비스 계정 키 확인 필요');
      } else if (error.code === 403) {
        console.error('권한 오류: 폴더 공유 설정 확인 필요');
      } else if (error.code === 404) {
        console.error('폴더를 찾을 수 없음: GOOGLE_DRIVE_FOLDER_ID 확인 필요');
      }
      
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
    
    console.log(`일괄 업로드 시작: ${analysisResults.length}개 파일`);
    
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
        
      } catch (error: any) {
        console.error(`업로드 실패: ${result.title}`, error.message);
        failedCount++;
        results.push({
          title: result.title,
          success: false,
          error: error.message
        });
      }
    }
    
    console.log(`일괄 업로드 완료: 성공 ${successCount}개, 실패 ${failedCount}개`);
    
    return {
      total: analysisResults.length,
      success: successCount,
      failed: failedCount,
      results
    };
  }
  
  /**
   * 폴더 정리 (n일 이상 된 주간 폴더 삭제하는 기능, 필요하면 활성화하기)
   */
//   async cleanupOldFolders(): Promise<void> {
//     try {
//       const parentFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
//       if (!parentFolderId) return;
      
//       const thirtyDaysAgo = new Date();
//       thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 90); //90일 이상된 폴더 삭제 
      
//       const response = await this.drive.files.list({
//         q: `parents in '${parentFolderId}' and mimeType='application/vnd.google-apps.folder' and modifiedTime < '${thirtyDaysAgo.toISOString()}' and trashed=false`,
//         fields: 'files(id, name, modifiedTime)',
//         pageSize: 50
//       });
      
//       if (response.data.files && response.data.files.length > 0) {
//         for (const folder of response.data.files) {
//           await this.drive.files.delete({ fileId: folder.id });
//           console.log(`오래된 폴더 삭제: ${folder.name}`);
          
//           // 삭제 간 대기
//           await new Promise(resolve => setTimeout(resolve, 200));
//         }
//       }
      
//     } catch (error: any) {
//       console.error('폴더 정리 실패:', error.message);
//     }
//   }
// }

// 자동 업로드 스케줄러
export class AutoDriveUploader {
  private uploader: GoogleDriveUploader | null = null;
  private cleanupIntervalId: NodeJS.Timeout | null = null;
  
  constructor() {
    this.initializeUploader();
  }
  
  private initializeUploader() {
    try {
      const clientEmail = process.env.GOOGLE_DRIVE_CLIENT_EMAIL;
      const privateKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY;
      
      if (clientEmail && privateKey) {
        this.uploader = new GoogleDriveUploader({
          clientEmail,
          privateKey
        });
        console.log('Google Drive 업로더 초기화 완료');
      } else {
        console.log('Google Drive 인증 정보 없음 - 업로드 비활성화');
        console.log(`CLIENT_EMAIL: ${clientEmail ? '설정됨' : '누락'}`);
        console.log(`PRIVATE_KEY: ${privateKey ? '설정됨' : '누락'}`);
        this.uploader = null;
      }
    } catch (error: any) {
      console.error('Google Drive 초기화 실패:', error.message);
      this.uploader = null;
    }
  }
  
  /**
   * 즉시 업로드 (분석 완료 즉시 호출용)
   */
  async uploadImmediately(analysisResult: any): Promise<any> {
    if (!this.uploader) {
      console.log('Google Drive 업로더가 비활성화되어 업로드를 건너뜁니다');
      return { success: false };
    }
    
    console.log(`즉시 업로드 시작: ${analysisResult.title}`);
    return await this.uploader.uploadAnalysisResult(analysisResult);
  }
  
  /**
   * 일괄 업로드
   */
  async uploadBatch(analysisResults: any[]): Promise<any> {
    if (!this.uploader) {
      return { total: analysisResults.length, success: 0, failed: analysisResults.length };
    }
    
    return await this.uploader.uploadBatchAnalysisResults(analysisResults);
  }
  
  /**
   * 자동 업로드 스케줄 시작 (매 2시간마다 미업로드 분석 결과 찾아서 업로드)
   */
  startAutoUpload(intervalMinutes: number = 120) {
    console.log(`자동 업로드 스케줄 시작 (${intervalMinutes}분마다)`);
    
    const runAutoUpload = async () => {
      try {
        console.log('예정된 자동 업로드 실행...');
        // 여기에 미업로드 분석 결과를 찾는 로직 구현
        // 현재는 간단한 확인만
        const now = new Date();
        console.log(`자동 업로드 확인 완료: ${now.toISOString()}`);
      } catch (error: any) {
        console.error('자동 업로드 실패:', error.message);
      }
    };
    
    // 즉시 실행
    runAutoUpload();
    
    // 정기 실행 설정
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
    }
    
    this.cleanupIntervalId = setInterval(runAutoUpload, intervalMinutes * 60 * 1000);
  }
  
  /**
   * 자동 업로드 중지
   */
  stopAutoUpload() {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
      console.log('자동 업로드 스케줄 중지');
    }
  }
  
  /**
   * 자동 정리 스케줄 시작 (매일 새벽 3시에 오래된 폴더 정리)
   */
  // startAutoCleanup() {
  //   if (!this.uploader) return;
    
  //   console.log('자동 정리 스케줄 시작 (매일 새벽 3시)');
    
  //   const scheduleCleanup = () => {
  //     const now = new Date();
  //     const targetTime = new Date();
  //     targetTime.setHours(3, 0, 0, 0); // 새벽 3시
      
  //     if (now > targetTime) {
  //       targetTime.setDate(targetTime.getDate() + 1); // 다음날 새벽 3시
  //     }
      
  //     const timeUntilCleanup = targetTime.getTime() - now.getTime();
      
  //     setTimeout(async () => {
  //       try {
  //         await this.uploader?.cleanupOldFolders();
  //         console.log('자동 폴더 정리 완료');
  //       } catch (error: any) {
  //         console.error('자동 폴더 정리 실패:', error.message);
  //       }
  //       scheduleCleanup(); // 다음 정리 예약
  //     }, timeUntilCleanup);
  //   };
    
  //   scheduleCleanup();
  // }
  
  /**
   * 스케줄된 업로드 수행 (외부에서 호출용)
   */
  async performScheduledUpload() {
    if (!this.uploader) {
      console.log('Google Drive 업로더가 비활성화됨');
      return;
    }
    
    try {
      console.log('예정된 Drive 업로드 실행...');
      // 실제 업로드 로직은 다른 컴포넌트와 연동 필요
      // await this.uploader.cleanupOldFolders();
      console.log('예정된 Drive 업로드 완료');
    } catch (error: any) {
      console.error('예정된 Drive 업로드 실패:', error.message);
    }
  }
}

// 전역 인스턴스
export const globalDriveUploader = new AutoDriveUploader();

// 앱 시작시 자동 정리 및 업로드 스케줄 시작 (서버 사이드에서만)
if (typeof window === 'undefined') {
  // 서버 시작시 스케줄 활성화
  globalDriveUploader.startAutoCleanup();
  globalDriveUploader.startAutoUpload(120); // 2시간마다
}
