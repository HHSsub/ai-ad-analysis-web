import { google } from 'googleapis';

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
  
  async uploadFile(options: {
    name: string;
    content: string;
    mimeType: string;
    folderId?: string;
  }) {
    try {
      const fileMetadata = {
        name: options.name,
        parents: options.folderId ? [options.folderId] : undefined,
      };
      
      const media = {
        mimeType: options.mimeType,
        body: options.content,
      };
      
      const response = await this.drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id,name,webViewLink',
      });
      
      console.log(`✅ Drive 업로드 성공: ${response.data.name}`);
      return response.data;
      
    } catch (error) {
      console.error('❌ Drive 업로드 실패:', error);
      throw error;
    }
  }
  
  async uploadExcelFile(analysisResults: any[], fileName: string) {
    try {
      const XLSX = require('xlsx');
      
      // Excel 워크북 생성
      const workbook = XLSX.utils.book_new();
      
      // 분석 결과를 Excel 형태로 변환
      const worksheetData = analysisResults.map(result => ({
        '제목': result.title,
        'URL': result.url,
        '전체 점수': result.analysis?.total_score || 0,
        '시각적 매력도': result.analysis?.visual_appeal || 0,
        '메시지 명확성': result.analysis?.message_clarity || 0,
        '감정적 호소력': result.analysis?.emotional_appeal || 0,
        '브랜드 인지도': result.analysis?.brand_recognition || 0,
        '음향/BGM': result.analysis?.audio_bgm || 0,
        '콜투액션': result.analysis?.call_to_action || 0,
        '창의성': result.analysis?.creativity || 0,
        '분석일': new Date(result.analyzed_at).toLocaleDateString('ko-KR'),
      }));
      
      const worksheet = XLSX.utils.json_to_sheet(worksheetData);
      XLSX.utils.book_append_sheet(workbook, worksheet, '분석 결과');
      
      // Excel 파일을 버퍼로 변환
      const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      
      // Drive에 업로드
      const fileMetadata = {
        name: fileName,
        parents: process.env.GOOGLE_DRIVE_FOLDER_ID ? [process.env.GOOGLE_DRIVE_FOLDER_ID] : undefined,
      };
      
      const media = {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: excelBuffer,
      };
      
      const response = await this.drive.files.create({
        resource: fileMetadata,
        media: media,
        fields: 'id,name,webViewLink',
      });
      
      console.log(`📊 Excel 파일 Drive 업로드 성공: ${response.data.name}`);
      return response.data;
      
    } catch (error) {
      console.error('❌ Excel Drive 업로드 실패:', error);
      throw error;
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
  
  startAutoUpload(intervalMinutes: number = 60) {
    this.stopAutoUpload(); // 기존 스케줄 중지
    
    console.log(`🔄 자동 Drive 업로드 시작 (${intervalMinutes}분 간격)`);
    
    this.intervalId = setInterval(async () => {
      try {
        await this.performScheduledUpload();
      } catch (error) {
        console.error('스케줄된 업로드 실패:', error);
      }
    }, intervalMinutes * 60 * 1000);
  }
  
  stopAutoUpload() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('⏹️ 자동 Drive 업로드 중지됨');
    }
  }
  
  private async performScheduledUpload() {
    // 최근 분석된 결과들을 가져와서 Excel 파일로 업로드
    const recentResults = await this.getRecentAnalysisResults();
    
    if (recentResults.length > 0) {
      const fileName = `youtube_analysis_${new Date().toISOString().split('T')[0]}.xlsx`;
      await this.uploader.uploadExcelFile(recentResults, fileName);
    }
  }
  
  private async getRecentAnalysisResults() {
    // 실제 DB에서 최근 분석 결과를 가져오는 로직
    // 여기서는 예시로 빈 배열 반환
    return [];
  }
}
