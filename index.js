//-
import html from './index.html';



export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/') {
      return new Response(html, {
        headers: {
          'content-type': 'text/html;charset=UTF-8',
        },
      });
    }

    if (url.pathname === '/api') {
      const apiUrl = url.searchParams.get('url');
      if (!apiUrl) {
        return new Response('Missing url parameter', { status: 400 });
      }

      // Append the API key to the target URL
      const fullApiUrl = `${apiUrl}&serviceKey=${env.MASTER_KEY}`;

      // Forward the request to the actual API
      const apiRequest = new Request(fullApiUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });

      // To avoid CORS issues, we can fetch and return the response
      const apiResponse = await fetch(apiRequest);

      // Create a new response with CORS headers to allow the frontend to access it
      const response = new Response(apiResponse.body, apiResponse);
      response.headers.set('Access-Control-Allow-Origin', '*');
      response.headers.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type');

      return response;
    }

    if (url.pathname === '/cctv') {
      const cctvUrl = url.searchParams.get('url');
      if (!cctvUrl) {
        return new Response('Missing url parameter', { status: 400 });
      }

      const cctvRequest = new Request(cctvUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });

      const cctvResponse = await fetch(cctvRequest);

      const response = new Response(cctvResponse.body, cctvResponse);
      response.headers.set('Access-Control-Allow-Origin', '*');
      response.headers.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type');

      return response;
    }

    if (url.pathname === '/proxy') {
        const targetUrl = url.searchParams.get('url');
        if (!targetUrl) {
            return new Response('Missing target URL', { status: 400 });
        }

        try {
            const res = await fetch(targetUrl);
            const response = new Response(res.body, res);
            response.headers.set('Access-Control-Allow-Origin', '*');
            response.headers.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
            response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
            return response;
        } catch (e) {
            return new Response('Error fetching from proxy: ' + e.message, { status: 500 });
        }
    }


    return new Response('Not found', { status: 404 });
  },
};
