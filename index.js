import { ChatRoom } from './chat.js';

export default {
  async fetch(request, env) {
    return await handleRequest(request, env).catch(
      (err) => new Response(err.stack, { status: 500 })
    );
  },
};

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  if (pathname.startsWith('/chat/')) {
    // This is a request for the chat room durable object.
    // We'll use a fixed ID to ensure there's only one chat room.
    const id = env.CHAT_ROOM.idFromName("global-chat-room");
    const stub = env.CHAT_ROOM.get(id);

    // Forward the request to the durable object.
    return stub.fetch(request);
  }

  if (pathname === '/favicon.ico') {
    return new Response(null, { status: 204 });
  }

  if (pathname === '/') {
    const githubUrl = 'https://raw.githubusercontent.com/k97460300-coder/prototype/main/index.html?v=' + Date.now();
    const response = await fetch(githubUrl);
    
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
        "connect-src * wss: https://www.google-analytics.com https://www.googletagmanager.com; " + // Added wss: for WebSocket
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
    targetUrl = `${endpoint}&serviceKey=${env.MASTER_KEY}`;
  }
  else if (pathname === '/festivals') {
    targetUrl = `http://api.visitjeju.net/vsjApi/contents/searchList?apiKey=${env.VISIT_JEJU_API_KEY}&locale=cn`;
  }
  else if (pathname.startsWith('/flights/')) {
    const type = pathname.split('/')[2];
    const airportParam = type === 'dep' ? 'airport_code=CJU' : 'arr_airport_code=CJU';
    const endpoint = type === 'dep' ? 'getDepFlightStatusList' : 'getArrFlightStatusList';
    const todayStr = url.searchParams.get('searchday');
    targetUrl = `http://openapi.airport.co.kr/service/rest/StatusOfFlights/${endpoint}?${airportParam}&line=I&searchday=${todayStr}&from_time=0000&to_time=2359&pageNo=1&numOfRows=100&serviceKey=${env.MASTER_KEY}`;
  }
  else if (pathname === '/hallasan') {
    targetUrl = 'https://jeju.go.kr/tool/hallasan/road-body.jsp';
  }
  else if (pathname.startsWith('/cctv/')) {
    targetUrl = url.searchParams.get('url');
    if (!targetUrl) return new Response('CCTV URL not provided', { status: 400 });
    const targetOrigin = new URL(targetUrl).origin;
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
