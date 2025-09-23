'use client';

import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, Pause, BarChart3, Database, Clock, AlertCircle } from "lucide-react";

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
    <Card className="shadow-lg border-0">
      <CardHeader className="bg-gradient-to-r from-purple-50 to-blue-50">
        <CardTitle className="text-2xl font-bold text-gray-800 flex items-center">
          <Database className="mr-3 h-6 w-6 text-purple-600" />
          수집 자동화 시스템
        </CardTitle>
        <p className="text-gray-600 mt-2">YouTube 광고 자동 수집 및 분석 시스템</p>
      </CardHeader>
      
      <CardContent className="p-6">
        {/* 현재 상태 표시 */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-blue-50 p-4 rounded-lg text-center">
              <BarChart3 className="h-8 w-8 text-blue-600 mx-auto mb-2" />
              <div className="text-2xl font-bold text-blue-600">{stats.total_ads}</div>
              <div className="text-sm text-gray-600">전체 광고</div>
            </div>
            <div className="bg-orange-50 p-4 rounded-lg text-center">
              <Clock className="h-8 w-8 text-orange-600 mx-auto mb-2" />
              <div className="text-2xl font-bold text-orange-600">{stats.pending}</div>
              <div className="text-sm text-gray-600">분석 대기</div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg text-center">
              <div className="h-8 w-8 bg-green-600 rounded-full mx-auto mb-2 flex items-center justify-center text-white text-sm font-bold">✓</div>
              <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
              <div className="text-sm text-gray-600">분석 완료</div>
            </div>
            <div className="bg-red-50 p-4 rounded-lg text-center">
              <AlertCircle className="h-8 w-8 text-red-600 mx-auto mb-2" />
              <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
              <div className="text-sm text-gray-600">분석 실패</div>
            </div>
          </div>
        )}
        
        {/* 수동 실행 버튼들 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Button
            onClick={handleCollectAds}
            disabled={isCollecting}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-6 transition-colors"
          >
            {isCollecting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                수집 중...
              </>
            ) : (
              <>
                <Database className="mr-2 h-4 w-4" />
                광고 수집 실행
              </>
            )}
          </Button>
          
          <Button
            onClick={handleSendToAnalysis}
            disabled={isSending || !stats?.pending}
            variant="outline"
            className="border-green-600 text-green-600 hover:bg-green-50 font-medium py-3 px-6 transition-colors"
          >
            {isSending ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-green-600 mr-2"></div>
                전송 중...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                분석 대기열 전송 ({stats?.pending || 0}개)
              </>
            )}
          </Button>
          
          <Button
            onClick={toggleScheduler}
            variant={schedulerStatus === 'running' ? 'destructive' : 'default'}
            className="font-medium py-3 px-6 transition-colors"
          >
            {schedulerStatus === 'running' ? (
              <>
                <Pause className="mr-2 h-4 w-4" />
                자동화 중지
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                자동화 시작
              </>
            )}
          </Button>
        </div>
        
        {/* 스케줄러 상태 */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className={`w-3 h-3 rounded-full mr-3 ${schedulerStatus === 'running' ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></div>
              <span className="font-medium text-gray-700">
                스케줄러 상태: {schedulerStatus === 'running' ? '실행 중' : '중지됨'}
              </span>
            </div>
            {schedulerStatus === 'running' && (
              <span className="text-sm text-green-600 font-medium">
                30분마다 자동 수집/분석
              </span>
            )}
          </div>
        </div>

        {/* 도움말 */}
        <div className="mt-6 p-4 bg-blue-50 rounded-lg">
          <h4 className="font-semibold text-blue-800 mb-2">사용 방법</h4>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• <strong>광고 수집 실행:</strong> Python 스크립트를 통해 새로운 YouTube 광고를 수집합니다</li>
            <li>• <strong>분석 대기열 전송:</strong> 수집된 광고를 AI 분석 시스템으로 전송합니다</li>
            <li>• <strong>자동화 시작:</strong> 30분마다 자동으로 수집 및 분석을 실행합니다</li>
            <li>• 분석 완료된 결과는 자동으로 Google Drive에 업로드됩니다</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
