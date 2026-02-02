addEventListener('fetch', event => {
  event.respondWith(handleRequest(event).catch(
    (err) => new Response(err.stack, { status: 500 })
  ))
})

async function handleRequest(event) {
  const request = event.request;
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (pathname === '/favicon.ico') {
    return new Response(null, { status: 204 });
  }

  // For a pure Worker project, we must handle the root path ourselves.
  // Fetch the latest index.html from the main branch on GitHub.
  if (pathname === '/') {
    const githubUrl = 'https://raw.githubusercontent.com/k97460300-coder/prototype/main/index.html?v=' + Date.now();
    const response = await fetch(githubUrl);
    
    // Add security and cache-busting headers
    const headers = new Headers(response.headers);
    headers.set('Content-Type', 'text/html;charset=UTF-8');
    headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    headers.set('Pragma', 'no-cache');
    headers.set('Expires', '0');
    headers.set('Content-Security-Policy', 
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://www.googletagmanager.com https://www.google-analytics.com; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
        "font-src 'self' https://fonts.gstatic.com; " +
        "connect-src * https://www.google-analytics.com https://www.googletagmanager.com; " +
        "media-src 'self' blob: http://211.114.96.121:1935 http://119.65.216.155:1935; " +
        "img-src 'self' data: https://www.googletagmanager.com;"
    );

    return new Response(response.body, { headers });
  }

  let targetUrl;
  const newHeaders = new Headers(request.headers);

  // --- API Routing ---
  if (pathname.startsWith('/weather/')) {
    const type = pathname.split('/')[2];
    const regId = url.searchParams.get('regId');
    const tmFc = url.searchParams.get('tmFc');
    const nx = url.searchParams.get('nx');
    const ny = url.searchParams.get('ny');
    const base_date = url.searchParams.get('base_date');
    const base_time = url.searchParams.get('base_time');

    let endpoint;
    if (type === 'short') {
      endpoint = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?numOfRows=1000&pageNo=1&dataType=JSON&base_date=${base_date}&base_time=${base_time}&nx=${nx}&ny=${ny}`;
    } else if (type === 'mid-temp') {
      endpoint = `https://apis.data.go.kr/1360000/MidFcstInfoService/getMidTa?dataType=JSON&regId=${regId}&tmFc=${tmFc}`;
    } else if (type === 'mid-land') {
      endpoint = `https://apis.data.go.kr/1360000/MidFcstInfoService/getMidLandFcst?dataType=JSON&regId=${regId}&tmFc=${tmFc}`;
    } else {
      return new Response('Invalid weather API type', { status: 400 });
    }
    // MASTER_KEY is a global variable from secrets in the deployed environment
    targetUrl = `${endpoint}&serviceKey=${MASTER_KEY}`;
  }
  else if (pathname === '/festivals') {
    // VISIT_JEJU_API_KEY is a global variable from secrets in the deployed environment
    targetUrl = `http://api.visitjeju.net/vsjApi/contents/searchList?apiKey=${VISIT_JEJU_API_KEY}&locale=cn`;
  }
  else if (pathname.startsWith('/flights/')) {
    const type = pathname.split('/')[2];
    const airportParam = type === 'dep' ? 'airport_code=CJU' : 'arr_airport_code=CJU';
    const endpoint = type === 'dep' ? 'getDepFlightStatusList' : 'getArrFlightStatusList';
    const todayStr = url.searchParams.get('searchday');
    targetUrl = `http://openapi.airport.co.kr/service/rest/StatusOfFlights/${endpoint}?${airportParam}&line=I&searchday=${todayStr}&from_time=0000&to_time=2359&pageNo=1&numOfRows=100&serviceKey=${MASTER_KEY}`;
  }
  else if (pathname === '/hallasan') {
    targetUrl = 'https://jeju.go.kr/tool/hallasan/road-body.jsp';
  }
  else if (pathname.startsWith('/cctv/')) {
    targetUrl = url.searchParams.get('url');
    if (!targetUrl) return new Response('CCTV URL not provided', { status: 400 });
    const targetOrigin = new URL(targetUrl).origin;
    // Spoof headers to bypass anti-hotlinking measures
    newHeaders.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    newHeaders.set('Referer', targetOrigin + '/');
  }
  else {
    return new Response('API endpoint not found.', { status: 404 });
  }

  // --- Generic Proxy Logic ---
  const proxyRequest = new Request(targetUrl, {
    method: request.method,
    headers: newHeaders,
    redirect: 'follow'
  });

  try {
    const response = await fetch(proxyRequest);
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type');
    
    if (pathname === '/hallasan' && response.headers.get('content-type')?.includes('euc-kr')) {
        const buffer = await response.arrayBuffer();
        const decoder = new TextDecoder('euc-kr');
        const text = decoder.decode(buffer);
        return new Response(text, { status: response.status, headers: responseHeaders });
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    });
  } catch (error) {
    return new Response('Error fetching from proxy: ' + error.message, { status: 500 });
  }
}