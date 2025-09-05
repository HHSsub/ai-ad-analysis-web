import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      return NextResponse.redirect(new URL('/?auth=error', req.url));
    }

    if (!code) {
      return NextResponse.redirect(new URL('/?auth=missing_code', req.url));
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/auth/google/callback`
    );

    // 인증 코드를 액세스 토큰으로 교환
    const { tokens } = await oauth2Client.getToken(code);
    
    // 액세스 토큰을 쿼리 파라미터로 전달하여 메인 페이지로 리다이렉트
    const redirectUrl = new URL('/', req.url);
    redirectUrl.searchParams.set('access_token', tokens.access_token!);
    redirectUrl.searchParams.set('auth', 'success');

    return NextResponse.redirect(redirectUrl);

  } catch (error: any) {
    console.error('Google OAuth 콜백 오류:', error);
    return NextResponse.redirect(new URL('/?auth=callback_error', req.url));
  }
}