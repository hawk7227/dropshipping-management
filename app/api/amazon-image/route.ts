import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const asin = request.nextUrl.searchParams.get('asin')?.trim().toUpperCase();
  if (!asin || !/^B[0-9A-Z]{9}$/.test(asin)) {
    return NextResponse.json({ error: 'Invalid ASIN', images: [], primary: '' }, { status: 400 });
  }

  const images: string[] = [];
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate, br',
  };

  // Try both URL patterns
  for (const url of [`https://www.amazon.com/dp/${asin}`, `https://www.amazon.com/gp/product/${asin}`]) {
    try {
      const res = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(12000) });
      if (!res.ok) continue;
      const html = await res.text();

      // 1. og:image meta tag (most reliable)
      const og = html.match(/<meta\s+(?:property|name)="og:image"\s+content="([^"]+)"/i);
      if (og?.[1]) {
        const hi = og[1].replace(/\._[A-Z]{2}_[A-Z0-9_]+_\./, '._AC_SL1500_.');
        images.push(hi);
        if (hi !== og[1]) images.push(og[1]);
      }

      // 2. data-old-hires (main product image)
      for (const m of html.matchAll(/data-old-hires="([^"]+)"/g)) {
        if (m[1]?.startsWith('http') && !images.includes(m[1])) images.push(m[1]);
      }

      // 3. hiRes from colorImages JSON
      for (const m of html.matchAll(/"hiRes"\s*:\s*"(https:\/\/[^"]+)"/g)) {
        if (m[1] && !images.includes(m[1])) images.push(m[1]);
      }

      // 4. large from colorImages JSON
      for (const m of html.matchAll(/"large"\s*:\s*"(https:\/\/[^"]+)"/g)) {
        if (m[1] && !images.includes(m[1])) images.push(m[1]);
      }

      // 5. landingImageUrl
      const landing = html.match(/"landingImageUrl"\s*:\s*"([^"]+)"/);
      if (landing?.[1]) {
        const clean = landing[1].replace(/\\u002F/g, '/');
        const hi = clean.replace(/\._[A-Z]{2}_[A-Z0-9_]+_\./, '._AC_SL1500_.');
        if (!images.includes(hi)) images.push(hi);
      }

      // 6. m.media-amazon.com CDN URLs (upgrade to hi-res)
      for (const m of html.matchAll(/https:\/\/m\.media-amazon\.com\/images\/I\/[A-Za-z0-9+\-._]+\.(?:jpg|png|webp)/g)) {
        const u = m[0].replace(/\._[A-Z]{2}_[A-Z0-9_]+_\./, '._AC_SL1500_.');
        if (!images.includes(u) && (u.includes('_AC_') || u.includes('_SL') || !u.includes('._'))) images.push(u);
      }

      if (images.length > 0) break; // Got images, stop trying URLs
    } catch (e) {
      console.error(`Scrape failed for ${url}:`, e);
    }
  }

  // Dedupe and limit
  const unique = [...new Set(images)].filter(u => u.startsWith('http')).slice(0, 8);
  return NextResponse.json({ asin, images: unique, primary: unique[0] || '', count: unique.length });
}
