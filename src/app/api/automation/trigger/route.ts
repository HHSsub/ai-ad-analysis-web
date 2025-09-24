import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

// Python 스크립트 실행 함수
async function runPythonCollector(maxAds: number = 20): Promise<any> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), 'python_scripts', 'youtube_ads_collector_with_db.py');
    const venvPython = path.join(process.cwd(), 'venv', 'bin', 'python');
    
    // Python 스크립트에 파라미터 전달을 위한 환경변수
    const env = {
      ...process.env,
      MAX_ADS_PER_QUERY: maxAds.toString(),
      AUTO_MODE: 'true', // 대화형 입력 스킵
    };
    
    const pythonProcess = spawn(venvPython, [scriptPath], {
      env,
      cwd: process.cwd(),
    });
    
    let output = '';
    let errorOutput = '';
    
    pythonProcess.stdout.on('data', (data) => {
      output += data.toString();
      console.log('[Python]:', data.toString().trim());
    });
    
    pythonProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
      console.error('[Python Error]:', data.toString().trim());
    });
    
    pythonProcess.on('close', (code) => {
      if (code === 0) {
        // 결과 파싱 시도
        try {
          // Python 출력에서 JSON 결과 추출
          const lines = output.split('\n');
          const resultLine = lines.find(line => line.includes('RESULT_JSON:'));
          
          if (resultLine) {
            const jsonStr = resultLine.replace('RESULT_JSON:', '').trim();
            const result = JSON.parse(jsonStr);
            resolve(result);
          } else {
            // JSON이 없으면 기본 성공 응답
            resolve({
              success: true,
              output: output,
            });
          }
        } catch (e) {
          resolve({
            success: true,
            output: output,
          });
        }
      } else {
        reject(new Error(`Python script exited with code ${code}: ${errorOutput}`));
      }
    });
    
    pythonProcess.on('error', (error) => {
      reject(error);
    });
  });
}

// DB에서 분석 대기중인 광고 가져오기
async function getPendingAds(): Promise<any[]> {
  const dbPath = path.join(process.cwd(), 'data', 'youtube_ads.db');
  
  try {
    // SQLite3 명령으로 직접 쿼리
    const { execSync } = require('child_process');
    const query = `SELECT * FROM youtube_ads WHERE analysis_status = 'pending' ORDER BY collected_at DESC LIMIT 30;`;
    const result = execSync(`sqlite3 -json "${dbPath}" "${query}"`).toString();
    
    return JSON.parse(result || '[]');
  } catch (error) {
    console.error('DB 조회 실패:', error);
    return [];
  }
}

// 분석 API 호출
async function analyzeVideo(video: any): Promise<any> {
  try {
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    
    const response = await fetch(`${baseUrl}/api/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        videos: [{
          id: video.id || `auto_${Date.now()}`,
          title: video.title,
          url: video.url,
          note: video.note || '자동 수집됨',
        }],
      }),
    });
    
    if (!response.ok) {
      throw new Error(`분석 API 오류: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('영상 분석 실패:', error);
    throw error;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { 
      action = 'collect_and_analyze', 
      maxAds = 20,
      autoUpload = true 
    } = body;
    
    console.log(`[자동화] ${action} 시작...`);
    
    if (action === 'collect') {
      // Python 수집만 실행
      const result = await runPythonCollector(maxAds);
      
      return NextResponse.json({
        success: true,
        message: '수집 완료',
        data: result,
      });
      
    } else if (action === 'analyze_pending') {
      // 대기중인 광고만 분석
      const pendingAds = await getPendingAds();
      
      if (pendingAds.length === 0) {
        return NextResponse.json({
          success: true,
          message: '분석할 광고가 없습니다.',
          analyzed: 0,
        });
      }
      
      const results = [];
      let successCount = 0;
      
      for (const ad of pendingAds) {
        try {
          console.log(`분석 중: ${ad.title}`);
          const analysisResult = await analyzeVideo(ad);
          
          if (analysisResult.success) {
            successCount++;
            results.push({
              url: ad.url,
              status: 'success',
              sessionId: analysisResult.sessionId,
            });
          }
          
          // API Rate Limit 고려
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } catch (error) {
          results.push({
            url: ad.url,
            status: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
      
      // Google Drive 업로드 (선택사항)
      if (autoUpload && successCount > 0) {
        try {
          const timestamp = new Date().toISOString().split('T')[0];
          const uploadResponse = await fetch(`${process.env.NEXTAUTH_URL}/api/drive/upload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileName: `auto_analysis_${timestamp}.csv`,
              data: results.filter(r => r.status === 'success'),
              dataType: 'csv',
            }),
          });
          
          if (!uploadResponse.ok) {
            console.error('Drive 업로드 실패');
          }
        } catch (error) {
          console.error('Drive 업로드 오류:', error);
        }
      }
      
      return NextResponse.json({
        success: true,
        message: `${successCount}개 영상 분석 완료`,
        analyzed: successCount,
        failed: results.length - successCount,
        results,
      });
      
    } else if (action === 'collect_and_analyze') {
      // 1. Python 수집 실행
      const collectResult = await runPythonCollector(maxAds);
      
      // 2. 대기중인 광고 분석
      await new Promise(resolve => setTimeout(resolve, 3000)); // 잠시 대기
      
      const analyzeResponse = await fetch(`${process.env.NEXTAUTH_URL}/api/automation/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'analyze_pending',
          autoUpload,
        }),
      });
      
      const analyzeResult = await analyzeResponse.json();
      
      return NextResponse.json({
        success: true,
        message: '수집 및 분석 완료',
        collection: collectResult,
        analysis: analyzeResult,
      });
    }
    
    return NextResponse.json(
      { error: '알 수 없는 action' },
      { status: 400 }
    );
    
  } catch (error) {
    console.error('자동화 오류:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : '자동화 실행 실패'
      },
      { status: 500 }
    );
  }
}

// GET: 자동화 상태 확인
export async function GET(req: NextRequest) {
  try {
    // DB 상태 조회
    const dbPath = path.join(process.cwd(), 'data', 'youtube_ads.db');
    
    const { execSync } = require('child_process');
    const statsQuery = `
      SELECT 
        COUNT(*) as total_ads,
        SUM(CASE WHEN analysis_status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN analysis_status = 'completed' THEN 1 ELSE 0 END) as completed,
        MAX(collected_at) as latest_collection
      FROM youtube_ads;
    `;
    
    const result = execSync(`sqlite3 -json "${dbPath}" "${statsQuery}"`).toString();
    const stats = JSON.parse(result || '[{}]')[0];
    
    return NextResponse.json({
      success: true,
      stats,
    });
    
  } catch (error) {
    return NextResponse.json(
      { 
        success: false,
        error: 'DB 상태 조회 실패'
      },
      { status: 500 }
    );
  }
}
