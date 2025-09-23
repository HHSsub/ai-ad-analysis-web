'use client';

import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';

interface AutomationStats {
  total_ads: number;
  pending: number;
  completed: number;
  failed: number;
}

export default function AutomationPanel() {
  const [isCollecting, setIsCollecting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [stats, setStats] = useState<AutomationStats | null>(null);
  const [schedulerStatus, setSchedulerStatus] = useState('stopped');

  useEffect(() => {
    fetchStatus();
    
    // 30초마다 상태 업데이트
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

    // fetchStatus 함수도 업데이트
    const fetchStatus = async () => {
      try {
        const response = await fetch('/api/automation/collect', {
          method: 'GET'
        });
        
        const result = await response.json();
        if (result.success && result.data?.stats) {
          setStats(result.data.stats);
        }
      } catch (error) {
        console.error('Status fetch failed:', error);
      }
    };
        

  const handleCollectAds = async () => {
    setIsCollecting(true);
    toast.loading('Python 광고 수집기 실행 중...', { id: 'collect' });
    
    try {
      const response = await fetch('/api/automation/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          maxAds: 25,
          searchQueries: [
            "advertisement commercial",
            "product promotion", 
            "brand commercial",
            "sponsored content"
          ]
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        toast.success(result.message, { id: 'collect' });
        
        // 상태 즉시 업데이트
        if (result.data?.stats) {
          setStats(result.data.stats);
        }
        
        // 전체 상태 재조회
        await fetchStatus();
      } else {
        toast.error(`수집 실패: ${result.message}`, { id: 'collect' });
        console.error('수집 에러:', result.error);
      }
    } catch (error) {
      toast.error('수집 중 네트워크 오류 발생', { id: 'collect' });
      console.error('네트워크 에러:', error);
    } finally {
      setIsCollecting(false);
    }
  };

  const handleSendToAnalysis = async () => {
    setIsSending(true);
    toast.loading('분석 대기열로 전송 중...', { id: 'send' });
    
    try {
      const response = await fetch('/api/automation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send_to_analysis', batchSize: 10 })
      });
      
      const result = await response.json();
      
      if (result.success) {
        toast.success(result.message, { id: 'send' });
        fetchStatus();
      } else {
        toast.error('전송 실패', { id: 'send' });
      }
    } catch (error) {
      toast.error('전송 중 오류 발생', { id: 'send' });
    } finally {
      setIsSending(false);
    }
  };

  const toggleScheduler = async () => {
    // 스케줄러 시작/중지 로직 구현
    const newStatus = schedulerStatus === 'running' ? 'stopped' : 'running';
    setSchedulerStatus(newStatus);
    
    toast.success(`자동 스케줄러 ${newStatus === 'running' ? '시작' : '중지'}됨`);
  };

  return (
    <div className="automation-panel">
      <h2>🤖 수집 자동화 시스템</h2>
      
      {/* 현재 상태 표시 */}
      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <h3>전체 광고</h3>
            <span className="stat-number">{stats.total_ads}</span>
          </div>
          <div className="stat-card">
            <h3>분석 대기</h3>
            <span className="stat-number pending">{stats.pending}</span>
          </div>
          <div className="stat-card">
            <h3>분석 완료</h3>
            <span className="stat-number completed">{stats.completed}</span>
          </div>
          <div className="stat-card">
            <h3>분석 실패</h3>
            <span className="stat-number failed">{stats.failed}</span>
          </div>
        </div>
      )}
      
      {/* 수동 실행 버튼들 */}
      <div className="action-buttons">
        <button
          onClick={handleCollectAds}
          disabled={isCollecting}
          className="btn-primary"
        >
          {isCollecting ? '수집 중...' : '📥 광고 수집 실행'}
        </button>
        
        <button
          onClick={handleSendToAnalysis}
          disabled={isSending || !stats?.pending}
          className="btn-secondary"
        >
          {isSending ? '전송 중...' : `📤 분석 대기열 전송 (${stats?.pending || 0}개)`}
        </button>
        
        <button
          onClick={toggleScheduler}
          className={`btn-scheduler ${schedulerStatus === 'running' ? 'active' : ''}`}
        >
          {schedulerStatus === 'running' ? '⏸️ 자동화 중지' : '▶️ 자동화 시작'}
        </button>
      </div>
      
      {/* 스케줄러 상태 */}
      <div className="scheduler-status">
        <span className={`status-indicator ${schedulerStatus}`}></span>
        스케줄러 상태: {schedulerStatus === 'running' ? '실행 중' : '중지됨'}
      </div>
    </div>
  );
}
    
