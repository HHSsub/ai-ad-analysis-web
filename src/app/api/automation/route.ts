import { NextRequest, NextResponse } from 'next/server';
import { YouTubeAdsCollectorDB } from '@/lib/youtube-ads-collector';
import { WebServiceConnector } from '@/lib/web-service-connector';

export async function POST(request: NextRequest) {
  try {
    const { action, batchSize = 10 } = await request.json();
    
    switch (action) {
      case 'collect':
        return await handleCollectAds(batchSize);
      case 'send_to_analysis':
        return await handleSendToAnalysis(batchSize);
      case 'status':
        return await handleGetStatus();
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Automation API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function handleCollectAds(batchSize: number) {
  const collector = new YouTubeAdsCollectorDB(
    process.env.APIFY_TOKEN,
    process.env.SERPAPI_KEY
  );
  
  const results = await collector.collect_all_ads(undefined, batchSize);
  
  return NextResponse.json({
    success: true,
    message: `광고 수집 완료: ${results.new_ads}개 신규 추가`,
    data: results
  });
}

async function handleSendToAnalysis(batchSize: number) {
  const connector = new WebServiceConnector(
    process.env.NEXTAUTH_URL || 'http://localhost:3000',
    process.env.WEB_SERVICE_API_KEY
  );
  
  const results = await connector.send_batch_to_web_service(batchSize);
  
  return NextResponse.json({
    success: true,
    message: `분석 대기열에 ${results.success}개 전송 완료`,
    data: results
  });
}

async function handleGetStatus() {
  const collector = new YouTubeAdsCollectorDB();
  const stats = await collector.get_database_stats();
  
  return NextResponse.json({
    success: true,
    data: stats
  });
}
    
