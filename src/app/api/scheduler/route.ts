import { NextRequest, NextResponse } from 'next/server';
import { globalScheduler } from '@/lib/scheduler';

export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json();
    
    switch (action) {
      case 'start':
        globalScheduler.start();
        return NextResponse.json({ 
          success: true, 
          message: '자동화 스케줄러가 시작되었습니다.' 
        });
        
      case 'stop':
        globalScheduler.stop();
        return NextResponse.json({ 
          success: true, 
          message: '자동화 스케줄러가 중지되었습니다.' 
        });
        
      case 'status':
        const status = globalScheduler.getStatus();
        return NextResponse.json({ 
          success: true, 
          data: status 
        });
        
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Scheduler API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const status = globalScheduler.getStatus();
    return NextResponse.json({ success: true, data: status });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to get status' }, { status: 500 });
  }
}
