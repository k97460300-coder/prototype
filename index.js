addEventListener('fetch', event => {
  event.respondWith(handleRequest(event).catch(
    (err) => new Response(err.stack, { status: 500 })
  ))
})

async function handleRequest(event) {
  const request = event.request;
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Explicitly serve the HTML for the root path by fetching it from GitHub
  if (pathname === '/') {
    const githubUrl = 'https://raw.githubusercontent.com/k97460300-coder/prototype/main/index.html?v=' + Date.now();
    const response = await fetch(githubUrl);
    return new Response(response.body, {
      headers: { 'Content-Type': 'text/html;charset=UTF-8' },
    });
  }

  let targetUrl;

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
    // MASTER_KEY is a global variable in the worker environment (from .dev.vars or secrets)
    targetUrl = `${endpoint}&serviceKey=${MASTER_KEY}`;
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
  }
  else {
    return new Response('API endpoint not found.', { status: 404 });
  }

  // --- Generic Proxy Logic ---
  const proxyRequest = new Request(targetUrl, {
    method: request.method,
    headers: request.headers,
    redirect: 'follow'
  });

  try {
    const response = await fetch(proxyRequest);
    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');
    newHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
    newHeaders.set('Access-Control-Allow-Headers', 'Content-Type');
    
    // Handle EUC-KR encoding for Hallasan page
    if (pathname === '/hallasan' && response.headers.get('content-type')?.includes('euc-kr')) {
        const buffer = await response.arrayBuffer();
        const decoder = new TextDecoder('euc-kr');
        const text = decoder.decode(buffer);
        return new Response(text, { status: response.status, headers: newHeaders });
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });
  } catch (error) {
    return new Response('Error fetching from proxy: ' + error.message, { status: 500 });
  }
}