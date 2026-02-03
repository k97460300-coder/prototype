import { ChatRoom } from './chat.js';

// Durable Object 클래스를 export 해야 wrangler가 인식할 수 있습니다.
export { ChatRoom };

// ES 모듈 형식의 기본 export
export default {
  async fetch(request, env, ctx) {
    try {
      return await handleRequest(request, env);
    } catch (e) {
      // 에러 발생 시, 에러 스택을 포함한 응답을 반환합니다.
      return new Response(e.stack, { status: 500 });
    }
  }
};

// 모든 요청을 처리하는 메인 함수
async function handleRequest(request, env) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // 1. 채팅 관련 요청(/chat/으로 시작)은 Durable Object로 전달합니다.
  if (pathname.startsWith('/chat/')) {
    // 모든 사용자가 동일한 채팅방을 사용하도록 고정된 ID를 사용합니다.
    const id = env.CHAT_ROOM.idFromName("global-chat-room");
    const stub = env.CHAT_ROOM.get(id);
    return stub.fetch(request); // 요청을 Durable Object로 전달
  }

  // 2. 파비콘 요청은 204 No Content로 처리하여 콘솔 에러를 방지합니다.
  if (pathname === '/favicon.ico') {
    return new Response(null, { status: 204 });
  }

  // 4. API 요청을 프록시 처리합니다.
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

  // targetUrl이 설정된 경우 (즉, API 라우트가 일치하는 경우) 프록시 요청을 실행합니다.
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

  // API 라우트가 아닌 다른 모든 요청은 여기로 오게 되며,
  // 아무것도 반환하지 않음으로써 정적 에셋 핸들러가 처리하도록 합니다.
}