// chat.js - Durable Object
export class ChatRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = [];
    this.messages = [];

    // Load persisted messages from storage
    this.state.storage.get('messages').then(messages => {
        if (messages) {
            this.messages = messages;
        }
    });
  }

  // Handle HTTP requests and WebSocket connections
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/chat/websocket') {
      // This is a WebSocket upgrade request.
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      
      server.accept();
      this.handleSession(server);

      return new Response(null, { status: 101, webSocket: client });
    } else if (url.pathname === '/chat/messages') {
        // Return current messages for new users
        return new Response(JSON.stringify(this.messages), {
            headers: { 'Content-Type': 'application/json' },
        });
    }

    return new Response('Not found', { status: 404 });
  }

  handleSession(websocket) {
    this.sessions.push(websocket);

    websocket.addEventListener('message', async event => {
        try {
            const message = JSON.parse(event.data);
            
            // Add a timestamp and store the message
            const timestamp = new Date().toISOString();
            const storedMessage = { ...message, timestamp };
            
            this.messages.push(storedMessage);
            // Cap the stored messages at 100
            if (this.messages.length > 100) {
                this.messages.shift();
            }

            // Persist messages to storage
            await this.state.storage.put('messages', this.messages);
            
            // Broadcast the message to all connected clients
            this.broadcast(JSON.stringify(storedMessage));

        } catch (err) {
            websocket.send(JSON.stringify({ error: 'Invalid message format' }));
        }
    });

    websocket.addEventListener('close', () => {
      // Remove the session from the list
      this.sessions = this.sessions.filter(session => session !== websocket);
    });

    websocket.addEventListener('error', (err) => {
        console.error('WebSocket error:', err);
    });
  }

  // Broadcast a message to all connected sessions
  broadcast(message) {
    this.sessions.forEach(session => {
      try {
        session.send(message);
      } catch (err) {
        // This session is likely closed, remove it
        this.sessions = this.sessions.filter(s => s !== session);
      }
    });
  }
}
