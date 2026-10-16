import { NextResponse } from 'next/server';
import worldData from 'world-atlas/countries-110m.json';

export async function GET() {
  return NextResponse.json(worldData, {
    headers: {
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
