import { WebSocket, WebSocketServer } from 'ws';
import { wsArcjet } from '../arcjet.js';

function sendJson(socket, payload){
    if(socket.readyState !== WebSocket.OPEN) return;

    socket.send(JSON.stringify(payload));
}

function broadcast(wss, payload){
    for(const client of wss.clients){
        if(client.readyState !== WebSocket.OPEN) continue;

        client.send(JSON.stringify(payload));
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

        if(!req.headers['user-agent']){
            rejectUpgrade(socket, 403, 'Forbidden', 'Access denied');
            return;
        }

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

        sendJson(socket, { type: 'Welcome' });

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
        broadcast(wss, { type: 'Match_Created', data: match });
    }

    return { broadcastMatchCreated }
}
