// This is a trivial change to trigger a new build (final attempt for secret)
// import { ChatRoom } from './chat.js';
import { getAssetFromKV } from "@cloudflare/kv-asset-handler";

// export { ChatRoom };

async function handleDynamicRequest(request, env) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // 1. 채팅 관련 요청 (일시적으로 비활성화)
  // if (pathname.startsWith('/chat/')) {
  //   const id = env.CHAT_ROOM.idFromName("global-chat-room");
  //   const stub = env.CHAT_ROOM.get(id);
  //   return stub.fetch(request);
  // }

  // 2. 파비콘 요청
  if (pathname === '/favicon.ico') {
    return new Response(null, { status: 204 });
  }

  // 3. API 요청을 프록시 처리합니다.
  let targetUrl;
  const newHeaders = new Headers(request.headers);

  if (pathname.startsWith('/weather/')) {
    const type = pathname.split('/')[2];
    const params = url.searchParams;
    let endpoint;
    if (type === 'short') {
      endpoint = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?numOfRows=1000&pageNo=1&dataType=JSON&base_date=${params.get('base_date')}&base_time=${params.get('base_time')}&nx=${params.get('nx')}&ny=${params.get('ny')}`;
    } else if (type === 'mid-temp') {
      endpoint = `https://apis.data.go.kr/1360000/MidFcstInfoService/getMidTa?dataType=JSON&regId=${params.get('regId')}&tmFc=${params.get('tmFc')}`;
    } else {
      endpoint = `https://apis.data.go.kr/1360000/MidFcstInfoService/getMidLandFcst?dataType=JSON&regId=${params.get('regId')}&tmFc=${params.get('tmFc')}`;
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
    targetUrl = `http://openapi.airport.co.kr/service/rest/StatusOfFlights/${endpoint}?${airportParam}&line=I&searchday=${url.searchParams.get('searchday')}&from_time=0000&to_time=2359&pageNo=1&numOfRows=100&serviceKey=${env.MASTER_KEY}`;
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

  if (targetUrl) {
    const proxyRequest = new Request(targetUrl, {
      method: request.method,
      headers: newHeaders,
      redirect: 'follow'
    });

    try {
      const response = await fetch(proxyRequest);
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set('Access-Control-Allow-Origin', '*');

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

  return null;
}

export default {
  async fetch(request, env, ctx) {
    try {
      const response = await handleDynamicRequest(request, env);
      if (response) {
        return response;
      }
      return await getAssetFromKV(
        {
          request,
          waitUntil: (promise) => ctx.waitUntil(promise),
        },
        {
          ASSET_NAMESPACE: env.__STATIC_CONTENT,
          ASSET_MANIFEST: JSON.parse(env.__STATIC_CONTENT_MANIFEST),
        }
      );
    } catch (e) {
      return new Response('Not Found', { status: 404 });
    }
  }
};