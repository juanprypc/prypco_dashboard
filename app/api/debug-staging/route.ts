import { NextResponse } from 'next/server';

/**
 * Debug endpoint to verify environment detection
 * 
 * - Returns 200 with environment info on preview/staging
 * - Returns 404 on production (to prevent exposure)
 */
export async function GET() {
  const vercelEnv = process.env.VERCEL_ENV;
  const nodeEnv = process.env.NODE_ENV;
  
  // Only available in preview/staging environments
  if (vercelEnv?.toUpperCase() !== 'PREVIEW' && nodeEnv !== 'development') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  
  return NextResponse.json({
    environment: 'staging/preview',
    VERCEL_ENV: vercelEnv || 'not set',
    NODE_ENV: nodeEnv || 'not set',
    isPreview: vercelEnv?.toUpperCase() === 'PREVIEW',
    isDevelopment: nodeEnv === 'development',
    message: 'This endpoint is only available in staging/preview environments',
  });
}
