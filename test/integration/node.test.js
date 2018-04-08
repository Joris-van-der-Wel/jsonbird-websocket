'use strict';
const {describe, it, beforeEach, afterEach} = require('mocha-sugar-free');
const {assert: {deepEqual: deq, strictEqual: eq, lengthOf, instanceOf, match}} = require('chai');
const http = require('http');
const ws = require('ws');

const readyState = require('../../lib/readyState');
const Wait = require('../utilities/Wait');
const {WebSocketClient} = require('../../');

describe('integration/Node.js', () => {
    let httpServer;
    let wsServer;
    let connections;
    let waitForConnection;
    let rpc;
    const verifyClientTimeout = Symbol();
    let verifyClient;

    const port = () => httpServer.address().port;

    beforeEach(async () => {
        httpServer = http.createServer((req, res) => {
            res.writeHead(404, {'Content-Type': 'text/plain'});
            res.end('Niet gevonden');
        });
        httpServer.timeout = 10 * 1000;
        httpServer.on('connection', socket => {
            socket.setKeepAlive(true, 10 * 1000);
            socket.unref(); // Prevent these sockets from keeping the node.js process alive
        });
        verifyClient = [true];
        wsServer = new ws.Server({
            server: httpServer,
            path: '/my-test',
            verifyClient: (info, cb) => verifyClient !== verifyClientTimeout && cb(...verifyClient),
        });

        httpServer.listen(0, '127.0.0.1');
        await new Promise(resolve => httpServer.once('listening', resolve));

        waitForConnection = new Wait();
        connections = [];
        wsServer.on('connection', (webSocket, httpRequest) => {
            const conn = {
                webSocket,
                httpRequest,
                messages: [],
                waitForMessage: new Wait(),
            };
            webSocket.on('message', jsonMessage => {
                const message = JSON.parse(jsonMessage);
                if (message.method === 'jsonbird.ping') {
                    return;
                }

                conn.messages.push(message);
                conn.waitForMessage.advance();
            });
            connections.push(conn);
            waitForConnection.advance();
        });
    });

    afterEach(() => {
        httpServer && httpServer.close();
        httpServer = null;
    });

    afterEach(() => {
        rpc && rpc.stop();
        rpc = null;
    });

    it('Should send messages and reply to them (text opcode)', async () => {
        rpc = new WebSocketClient({url: `ws://127.0.0.1:${port()}/my-test`});
        rpc.start();
        const firstCall = rpc.call('hello', 123, 'foo');
        await waitForConnection.waitUntil(1);
        const conn = connections[0];
        await conn.waitForMessage.waitUntil(1);
        {
            const message = conn.messages[0];
            deq(message, {
                id: message.id,
                jsonrpc: '2.0',
                method: 'hello',
                params: [123, 'foo'],
            });
            conn.webSocket.send(JSON.stringify({
                id: message.id,
                jsonrpc: '2.0',
                result: 'world',
            }));
            eq(await firstCall, 'world');
        }

        rpc.method('foo', async x => x * 2);

        conn.webSocket.send(JSON.stringify({
            id: 'wefy84heg',
            jsonrpc: '2.0',
            method: 'foo',
            params: [333],
        }));

        await conn.waitForMessage.waitUntil(2);
        {
            const message = conn.messages[1];
            deq(message, {
                id: 'wefy84heg',
                jsonrpc: '2.0',
                result: 666,
            });
        }
    });

    it('Should send messages and reply to them (binary opcode)', async () => {
        rpc = new WebSocketClient({url: `ws://127.0.0.1:${port()}/my-test`});
        rpc.start();
        const firstCall = rpc.call('hello', 123, 'foo');
        await waitForConnection.waitUntil(1);
        const conn = connections[0];
        await conn.waitForMessage.waitUntil(1);
        {
            const message = conn.messages[0];
            deq(message, {
                id: message.id,
                jsonrpc: '2.0',
                method: 'hello',
                params: [123, 'foo'],
            });
            conn.webSocket.send(JSON.stringify({
                id: message.id,
                jsonrpc: '2.0',
                result: 'world',
            }));
            eq(await firstCall, 'world');
        }

        rpc.method('foo', async x => x * 2);

        conn.webSocket.send(Buffer.from(JSON.stringify({
            id: 'wefy84heg',
            jsonrpc: '2.0',
            method: 'foo',
            params: [333],
        }), 'utf8'));

        await conn.waitForMessage.waitUntil(2);
        {
            const message = conn.messages[1];
            deq(message, {
                id: 'wefy84heg',
                jsonrpc: '2.0',
                result: 666,
            });
        }
    });

    it('Should emit "webSocketClose" and reconnect if the server closed the WebSocket', async () => {
        rpc = new WebSocketClient({
            url: `ws://127.0.0.1:${port()}/my-test`,
            reconnectDelayCallback: x => (x + 1) * 11,
        });
        const waitWebSocketOpen = new Wait();
        const waitWebSocketClose = new Wait();
        rpc.on('webSocketOpen', waitWebSocketOpen.spy);
        rpc.on('webSocketClose', waitWebSocketClose.spy);

        rpc.start();
        await waitWebSocketOpen.waitUntil(1);
        await waitForConnection.waitUntil(1);
        eq(rpc.hasActiveConnection, true);

        connections[0].webSocket.close(1000, 'Closed by server in a unit test');
        await waitWebSocketClose.waitUntil(1);
        deq(waitWebSocketClose.spy.args, [[{
            closedByRemote: true,
            code: 1000,
            reason: 'Closed by server in a unit test',
            reconnect: true,
            reconnectDelay: 11,
        }]]);
        eq(rpc.hasActiveConnection, false);

        // should reconnect after 11ms
        await waitWebSocketOpen.waitUntil(2);
        eq(rpc.hasActiveConnection, true);
        lengthOf(connections, 2);
    });

    it('Should emit "webSocketClose" and reconnect if the client closes the WebSocket', async () => {
        rpc = new WebSocketClient({
            url: `ws://127.0.0.1:${port()}/my-test`,
            reconnectDelayCallback: x => (x + 1) * 11,
        });
        const waitWebSocketOpen = new Wait();
        const waitWebSocketClose = new Wait();
        rpc.on('webSocketOpen', waitWebSocketOpen.spy);
        rpc.on('webSocketClose', waitWebSocketClose.spy);

        rpc.start();
        await waitWebSocketOpen.waitUntil(1);
        await waitForConnection.waitUntil(1);
        eq(rpc.hasActiveConnection, true);

        rpc.closeConnection(1000, 'Closed by the client in a unit test');
        await waitWebSocketClose.waitUntil(1);
        deq(waitWebSocketClose.spy.args, [[{
            closedByRemote: false,
            code: 1000,
            reason: 'Closed by the client in a unit test',
            reconnect: true,
            reconnectDelay: 11,
        }]]);
        eq(rpc.hasActiveConnection, false);

        // should reconnect after 11ms
        await waitWebSocketOpen.waitUntil(2);
        eq(rpc.hasActiveConnection, true);
        lengthOf(connections, 2);
    });

    it('Should keep reconnecting (until stop())', {timeout: 10000, slow: 4000}, async () => {
        rpc = new WebSocketClient({
            url: `ws://127.0.0.1:${port()}/my-test`,
            reconnectDelayCallback: x => 11,
        });
        const waitWebSocketOpen = new Wait();
        const waitWebSocketClose = new Wait();
        rpc.on('webSocketOpen', waitWebSocketOpen.spy);
        rpc.on('webSocketClose', waitWebSocketClose.spy);

        rpc.start();

        for (let iteration = 0; iteration < 25; ++iteration) {
            await waitWebSocketOpen.waitUntil(iteration + 1);
            await waitForConnection.waitUntil(iteration + 1);
            eq(rpc.hasActiveConnection, true);

            connections[iteration].webSocket.close(1000, 'Closed by the server in a unit test');
            await waitWebSocketClose.waitUntil(iteration + 1);
            eq(rpc.hasActiveConnection, false);
        }

        rpc.stop();
        lengthOf(connections, 25);
        for (const connection of connections) {
            eq(connection.webSocket.readyState, readyState.CLOSED);
        }

        // should stop reconnecting after .stop()
        await new Promise(r => setTimeout(r, 1000));
        lengthOf(connections, 25);
    });

    it('Should reconnect after a connection error', async () => {
        rpc = new WebSocketClient({
            url: `ws://127.0.0.1:${port()}/my-test`,
            reconnectDelayCallback: x => (x + 1) * 11,
        });
        const waitWebSocketOpen = new Wait();
        const waitWebSocketError = new Wait();
        const waitWebSocketClose = new Wait();
        rpc.on('webSocketOpen', waitWebSocketOpen.spy);
        rpc.on('webSocketClose', waitWebSocketClose.spy);
        rpc.on('webSocketError', waitWebSocketError.spy);

        verifyClient = [false, 403, 'Not allowed to connect by a unit test!'];
        rpc.start();
        await waitWebSocketClose.waitUntil(1);
        await waitWebSocketError.waitUntil(1);

        deq(waitWebSocketClose.spy.args, [[{
            closedByRemote: true,
            code: 1006,
            reason: '',
            reconnect: true,
            reconnectDelay: 11,
        }]]);
        const error = waitWebSocketError.spy.args[0][0];
        eq(error.type, 'error');
        match(error.message, /server.*403/i);
        match(error.error.message, /server.*403/i);
        instanceOf(error.error, Error);
        eq(rpc.hasActiveConnection, false);

        // should reconnect after 111ms
        verifyClient = [true];
        await waitWebSocketOpen.waitUntil(1);
        eq(rpc.hasActiveConnection, true);
        lengthOf(connections, 1);

        eq(waitWebSocketClose.spy.callCount, 1);
        eq(waitWebSocketError.spy.callCount, 1);
    });

    it('Should reconnect after a connect timeout', async () => {
        rpc = new WebSocketClient({
            url: `ws://127.0.0.1:${port()}/my-test`,
            reconnectDelayCallback: x => (x + 1) * 11,
            connectTimeout: 25,
        });
        const waitWebSocketOpen = new Wait();
        const waitWebSocketClose = new Wait();
        rpc.on('webSocketOpen', waitWebSocketOpen.spy);
        rpc.on('webSocketClose', waitWebSocketClose.spy);

        verifyClient = verifyClientTimeout;
        rpc.start();
        await waitWebSocketClose.waitUntil(1);
        deq(waitWebSocketClose.spy.args, [[{
            closedByRemote: false,
            code: 4100,
            reason: 'Timeout: Opening WebSocket took longer than 25ms',
            reconnect: true,
            reconnectDelay: 11,
        }]]);

        verifyClient = [true];
        await waitWebSocketOpen.waitUntil(1);
        eq(waitWebSocketClose.spy.callCount, 1);
        eq(waitWebSocketOpen.spy.callCount, 1);
    });

    it('Should reconnect if too many pings fail', {timeout: 10000, slow: 3000}, async () => {
        rpc = new WebSocketClient({
            url: `ws://127.0.0.1:${port()}/my-test`,
            reconnectDelayCallback: x => (x + 1) * 11,
            consecutivePingFailClose: 10,
            jsonbird: {
                pingInterval: 50,
                pingTimeout: 25,
            },
        });

        const waitWebSocketOpen = new Wait();
        const waitWebSocketClose = new Wait();
        const waitPingFail = new Wait();
        rpc.on('webSocketOpen', waitWebSocketOpen.spy);
        rpc.on('webSocketClose', waitWebSocketClose.spy);
        rpc.on('pingFail', waitPingFail.spy);

        rpc.start();
        await waitWebSocketOpen.waitUntil(1);
        await waitPingFail.waitUntil(4);
        deq(waitPingFail.spy.args.map(([consecutive]) => consecutive), [1, 2, 3, 4]);
        eq(waitWebSocketClose.spy.callCount, 0);

        await waitWebSocketClose.waitUntil(1);
        deq(waitWebSocketClose.spy.args, [[{
            closedByRemote: false,
            code: 4100,
            reason: 'Timeout: No responses received to ping calls',
            reconnect: true,
            reconnectDelay: 11,
        }]]);
        deq(waitPingFail.spy.args.map(([consecutive]) => consecutive), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

        // should reconnect
        await waitWebSocketOpen.waitUntil(2);
    });
});
