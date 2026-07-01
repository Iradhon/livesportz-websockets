import { WebSocket, WebSocketServer } from 'ws';
import { wsArcjet } from '../arcjet.js';

const matchSubscribers = new Map();

function subcribe(matchId, socket){
    if(!matchSubscribers.has(matchId)){
        matchSubscribers.set(matchId, new Set());
    }

    matchSubscribers.get(matchId).add(socket);
}

function unsubscribe(matchId, socket){
    const subscribers = matchSubscribers.get(matchId);

    if(!subscribers) return;

    subscribers.delete(socket);

    if(subscribers.size === 0){
        matchSubscribers.delete(matchId);
    }
}

function cleanupSubscribers(socket){
    for(const matchId of socket.subscriptions){
        unsubscribe(matchId, socket);
    }
}

function sendJson(socket, payload){
    if(socket.readyState !== WebSocket.OPEN) return;
    
    socket.send(JSON.stringify(payload));
}

function broadcastToAll(wss, payload){
    for(const client of wss.clients){
        if(client.readyState !== WebSocket.OPEN) continue;
        
        client.send(JSON.stringify(payload));
    }
}

function broadcastToMatch(matchId, payload){
    const subscribers = matchSubscribers.get(matchId);
    if(!subscribers || subscribers.size === 0) return;

    const message = JSON.stringify(payload);

    for(const client of subscribers){
        if(client.readyState === WebSocket.OPEN){
            client.send(message);
        } 
    }
}

function handleMessage(socket, data){
    let message;

    try {
        message = JSON.parse(data.toString());
    } catch (error) {
        sendJson(socket, { type: 'error', message: 'Invalid JSON format' });
        return;
    }

    if(message?.type === 'subscribe' && Number.isInteger(message.matchId)){
        subcribe(message.matchId, socket);
        socket.subscriptions.add(message.matchId);
        sendJson(socket, { type: 'subscribed', matchId: message.matchId });
        return;
    }

    if(message?.type === 'unsubscribe' && Number.isInteger(message.matchId)){
        unsubscribe(message.matchId, socket);
        socket.subscriptions.delete(message.matchId);
        sendJson(socket, { type: 'unsubscribed', matchId: message.matchId });
        return;
    }
}

function rejectUpgrade(socket, statusCode, reason, body = ''){
    socket.write(
        `HTTP/1.1 ${statusCode} ${reason}\r\n` +
        'Connection: close\r\n' +
        'Content-Type: text/plain; charset=utf-8\r\n' +
        `Content-Length: ${Buffer.byteLength(body)}\r\n` +
        '\r\n' +
        body
    );
    socket.destroy();
}

export function attachWebSocketServer(server) {
    const wss = new WebSocketServer({
        noServer: true,
        maxPayload: 1024 * 1024, // 1MB
    });

    server.on('upgrade', async (req, socket, head) => {
        const { pathname } = new URL(req.url, 'http://localhost');

        if(pathname !== '/ws') {
            rejectUpgrade(socket, 404, 'Not Found');
            return;
        }

        req.headers['user-agent'] ??= 'websocket-client';

        if(wsArcjet){
            try {
                const decision = await wsArcjet.protect(req)

                if(decision.isDenied()){
                    const statusCode = decision.reason.isRateLimit() ? 429 : 403;
                    const reason = decision.reason.isRateLimit() ? 'Too Many Requests' : 'Forbidden';
                    const body = decision.reason.isRateLimit() ? 'Rate limit exceeded' : 'Access denied';

                    rejectUpgrade(socket, statusCode, reason, body);
                    return;
                }
            } catch (error) {
                console.error('ws upgrade error', error)
                socket.destroy();
                return;
            }
        }

        wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit('connection', ws, req);
        });
    })

    wss.on('connection', (socket) => {
        socket.isAlive = true;
        socket.on('pong', () => { socket.isAlive = true; });

        socket.subscriptions = new Set();

        sendJson(socket, { type: 'Welcome' });

        socket.on('message', (data) => {
            handleMessage(socket, data);
        })

        socket.on('error', () => {
            socket.terminate();
        })
        socket.on('close', () => {
            cleanupSubscribers(socket);
        })

        socket.on('error', console.error);
    })

    const interval = setInterval(() => {
        wss.clients.forEach((ws) => {
            if(!ws.isAlive) return ws.terminate();
            ws.isAlive = false;
            ws.ping();
        })
    }, 30000)

    wss.on('close', () => {clearInterval(interval);})

    function broadcastMatchCreated(match) {
        broadcastToAll(wss, { type: 'Match_Created', data: match });
    }

    function broadcastCommentary(matchId, commentary) {
        broadcastToMatch(matchId, { type: 'Commentary_Created', data: commentary });
    }

    return { broadcastMatchCreated, broadcastCommentary }
}
