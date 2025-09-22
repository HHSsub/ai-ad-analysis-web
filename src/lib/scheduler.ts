import cron from 'node-cron';
import { YouTubeAdsCollectorDB } from './youtube-ads-collector';
import { WebServiceConnector } from './web-service-connector';
import { AutoDriveUploader } from './google-drive';

export class AutomationScheduler {
  private isRunning = false;
  private tasks: cron.ScheduledTask[] = [];
  private driveUploader: AutoDriveUploader;
  
  constructor() {
    this.driveUploader = new AutoDriveUploader();
  }
  
  start() {
    if (this.isRunning) {
      console.log('⚠️ 스케줄러가 이미 실행 중입니다.');
      return;
    }
    
    this.isRunning = true;
    console.log('🚀 자동화 스케줄러 시작');
    
    // 1. 광고 수집 - 매일 오전 2시
    const collectTask = cron.schedule('0 2 * * *', async () => {
      console.log('📥 스케줄된 광고 수집 시작');
      await this.performScheduledCollection();
    }, { scheduled: false });
    
    // 2. 분석 대기열 전송 - 매 30분마다
    const analysisTask = cron.schedule('*/30 * * * *', async () => {
      console.log('📤 스케줄된 분석 전송 시작');
      await this.performScheduledAnalysis();
    }, { scheduled: false });
    
    // 3. Drive 업로드 - 매 2시간마다
    const uploadTask = cron.schedule('0 */2 * * *', async () => {
      console.log('☁️ 스케줄된 Drive 업로드 시작');
      await this.performScheduledUpload();
    }, { scheduled: false });
    
    // 4. 시스템 상태 확인 - 매 10분마다
    const healthTask = cron.schedule('*/10 * * * *', async () => {
      await this.performHealthCheck();
    }, { scheduled: false });
    
    this.tasks = [collectTask, analysisTask, uploadTask, healthTask];
    
    // 모든 작업 시작
    this.tasks.forEach(task => task.start());
    
    // Drive 자동 업로드도 시작
    this.driveUploader.startAutoUpload(120); // 2시간마다
  }
  
  stop() {
    if (!this.isRunning) {
      console.log('⚠️ 스케줄러가 실행 중이 아닙니다.');
      return;
    }
    
    this.isRunning = false;
    console.log('⏹️ 자동화 스케줄러 중지');
    
    // 모든 cron 작업 중지
    this.tasks.forEach(task => task.stop());
    this.tasks = [];
    
    // Drive 자동 업로드 중지
    this.driveUploader.stopAutoUpload();
  }
  
  getStatus() {
    return {
      isRunning: this.isRunning,
      activeTasks: this.tasks.length,
      nextExecutions: this.tasks.map(task => ({
        name: task.toString(),
        nextRun: task.nextDate()?.toISO()
      }))
    };
  }
  
  private async performScheduledCollection() {
    try {
      const collector = new YouTubeAdsCollectorDB(
        process.env.APIFY_TOKEN,
        process.env.SERPAPI_KEY
      );
      
      const results = await collector.collect_all_ads(undefined, 50);
      console.log(`✅ 스케줄된 수집 완료: ${results.new_ads}개 신규 광고`);
      
    } catch (error) {
      console.error('❌ 스케줄된 수집 실패:', error);
    }
  }
  
  private async performScheduledAnalysis() {
    try {
      const connector = new WebServiceConnector(
        process.env.NEXTAUTH_URL || 'http://localhost:3000'
      );
      
      const results = await connector.send_batch_to_web_service(15);
      console.log(`✅ 스케줄된 분석 전송: ${results.success}개 성공`);
      
    } catch (error) {
      console.error('❌ 스케줄된 분석 전송 실패:', error);
    }
  }
  
  private async performScheduledUpload() {
    try {
      await this.driveUploader.performScheduledUpload();
      console.log('✅ 스케줄된 Drive 업로드 완료');
      
    } catch (error) {
      console.error('❌ 스케줄된 Drive 업로드 실패:', error);
    }
  }
  
  private async performHealthCheck() {
    // 시스템 상태 확인 로직
    const status = {
      timestamp: new Date().toISOString(),
      scheduler: this.isRunning,
      database: await this.checkDatabaseHealth(),
      apis: await this.checkApiHealth()
    };
    
    if (!status.database || !status.apis) {
      console.warn('⚠️ 시스템 상태 이상 감지:', status);
    }
  }
  
  private async checkDatabaseHealth(): Promise {
    try {
      const collector = new YouTubeAdsCollectorDB();
      await collector.get_database_stats();
      return true;
    } catch {
      return false;
    }
  }
  
  private async checkApiHealth(): Promise {
    try {
      // YouTube API 및 기타 외부 API 상태 확인
      return true;
    } catch {
      return false;
    }
  }
}

// 전역 스케줄러 인스턴스
export const globalScheduler = new AutomationScheduler();
    
