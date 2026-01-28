// Triggering deployment after Cloudflare API Token update
import html from './index.html';

export default {
  fetch(request) {
    return new Response(html, {
      headers: {
        'content-type': 'text/html;charset=UTF-8',
      },
    });
  },
};
