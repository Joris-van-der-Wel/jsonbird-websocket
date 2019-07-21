'use strict';
const {describe, it, beforeEach, afterEach} = require('mocha-sugar-free');
const {assert, assert: {strictEqual: eq, throws, deepEqual: deq, lengthOf}} = require('chai');
const sinon = require('sinon');

const Wait = require('./utilities/Wait');
const {WebSocketClient} = require('../');
const symbols = require('../lib/symbols');
const {webSocketClientMock, WS_MOCK_STATE} = require('./utilities/webSocketMock');

const delay = delay => new Promise(r => setTimeout(r, delay));

const ALL_EVENT_NAMES = new Set([
    'error', 'protocolError', 'webSocketConnecting', 'webSocketOpen', 'pingSuccess', 'pingFail', 'webSocketError', 'webSocketClose',
]);

describe('WebSocketClient', () => {
    describe('constructor', () => {
        it('Should set defaults for all options', async () => {
            const rpc = new WebSocketClient();
            eq(rpc.url, '');
            eq(rpc.reconnect, true);
            eq(rpc.consecutivePingFailClose, 4);
            eq(rpc.connectTimeout, 10000);
            eq(rpc.timeoutCloseCode, 4100);
            eq(rpc.internalErrorCloseCode, 4101);
            eq(rpc.reconnectCounterMax, 8);
            eq(rpc.receiveErrorStack, false);
            eq(rpc.sendErrorStack, false);
            eq(rpc.defaultTimeout, 0);
            eq(rpc.pingInterval, 2000);
            eq(rpc.pingTimeout, 1000);
        });

        it('Should set option passed to the constructor', () => {
            const rpc = new WebSocketClient({
                url: 'ws://localhost',
                reconnect: false,
                consecutivePingFailClose: 123,
                connectTimeout: 45678,
                timeoutCloseCode: 4123,
                internalErrorCloseCode: 4987,
                reconnectCounterMax: 21,
                jsonbird: {
                    receiveErrorStack: true,
                    sendErrorStack: true,
                    defaultTimeout: 59983,
                    pingInterval: 5082,
                    pingTimeout: 5982,
                },
            });
            eq(rpc.url, 'ws://localhost');
            eq(rpc.reconnect, false);
            eq(rpc.consecutivePingFailClose, 123);
            eq(rpc.connectTimeout, 45678);
            eq(rpc.timeoutCloseCode, 4123);
            eq(rpc.internalErrorCloseCode, 4987);
            eq(rpc.reconnectCounterMax, 21);
            eq(rpc.receiveErrorStack, true);
            eq(rpc.sendErrorStack, true);
            eq(rpc.defaultTimeout, 59983);
            eq(rpc.pingInterval, 5082);
            eq(rpc.pingTimeout, 5982);
        });
    });

    describe('getters and setters', () => {
        let rpc;
        const test = (prop, newValue, expected = newValue) => {
            rpc[prop] = newValue;
            eq(rpc[prop], expected);
        };

        beforeEach(() => {
            rpc = new WebSocketClient();
        });

        it('Should set and get values as-is if they are of the proper type', () => {
            test('url', 'ws://example.com');
            test('createConnectionCallback', () => {});
            test('reconnect', false);
            test('reconnectDelayCallback', () => {});
            test('consecutivePingFailClose', 123);
            test('connectTimeout', 45678);
            test('timeoutCloseCode', 4123);
            test('internalErrorCloseCode', 4987);
            test('reconnectCounterMax', 21);
            test('receiveErrorStack', true);
            test('sendErrorStack', true);
            test('defaultTimeout', 59983);
            test('pingInterval', 5082);
            test('pingTimeout', 5982);
        });

        it('Should cast values to the proper type when setting', () => {
            test('url', {toString: () => 'ws://foo.bar/'}, 'ws://foo.bar/');
            test('reconnect', 0, false);
            test('reconnect', 1, true);
            test('consecutivePingFailClose', '123', 123);
            test('connectTimeout', '45678', 45678);
            test('timeoutCloseCode', '4123', 4123);
            test('internalErrorCloseCode', '4987', 4987);
            test('reconnectCounterMax', '21', 21);
            test('receiveErrorStack', 5, true);
            test('sendErrorStack', 4, true);
            test('defaultTimeout', '59983', 59983);
            test('pingInterval', '5082', 5082);
            test('pingTimeout', '5982', 5982);
        });

        it('Should throw if the value can not be cast when setting', () => {
            throws(() => { rpc.createConnectionCallback = 'foo'; }, Error, /createConnectionCallback.*must.*function/i);
            throws(() => { rpc.reconnectDelayCallback = 'foo'; }, Error, /reconnectDelayCallback.*must.*function/i);
        });
    });

    describe('connection management', () => {
        let rpc;
        let wsMock;
        let timerMock;
        let events;
        let eventWaits;
        let pingIdsWithReplies;

        beforeEach(() => {
            wsMock = webSocketClientMock();
            pingIdsWithReplies = new Set();
            let nextTimerId = Math.floor(Math.random() * 100000000);
            timerMock = {
                setTimeout: sinon.spy(() => nextTimerId++),
                clearTimeout: sinon.spy(id => void timerMock.clearedTimers.add(id)),
                clearedTimers: new Set(),

                setTimeoutCalls: {
                    connectTimeout() {
                        return timerMock.setTimeout.getCalls().filter(call => call.args[2] === symbols.connectTimeoutTimerId);
                    },
                    reconnectTimer() {
                        return timerMock.setTimeout.getCalls().filter(call => call.args[2] === symbols.reconnectTimerId);
                    },
                },
            };

            rpc = new WebSocketClient({
                createConnectionCallback: wsMock,
                jsonbird: {
                    setTimeout: timerMock.setTimeout,
                    clearTimeout: timerMock.clearTimeout,
                },
            });
            // eslint-disable-next-line no-console
            rpc.on('error', err => console.error('Error event during test!', err));

            events = {ALL: []};
            eventWaits = {};
            for (const eventName of ALL_EVENT_NAMES) {
                eventWaits[eventName] = new Wait();
                // eslint-disable-next-line no-loop-func
                events[eventName] = sinon.spy((...args) => {
                    events.ALL.push([eventName, args]);
                    eventWaits[eventName].advance();
                });
                rpc.on(eventName, events[eventName]);
            }
        });

        afterEach(() => {
            rpc.stop();
            assertClearedAllConnectTimeoutTimers();
            assertClearedAllReconnectTimers();
            lengthOf(events.error, 0);
            lengthOf(events.protocolError, 0);
            rpc = null;
        });

        const assertClearedAllConnectTimeoutTimers = () => {
            for (const call of timerMock.setTimeoutCalls.connectTimeout()) {
                assert(timerMock.clearedTimers.has(call.returnValue), 'Should have cleaned up all connect timeout timers');
            }
        };

        const assertClearedAllReconnectTimers = () => {
            for (const call of timerMock.setTimeoutCalls.reconnectTimer()) {
                assert(timerMock.clearedTimers.has(call.returnValue), 'Should have cleaned up all reconnect timers');
            }
        };

        const invokePingTimers = async (ws, isPingCall) => {
            const wsMockState = ws[WS_MOCK_STATE];

            const calls = timerMock.setTimeout.getCalls().filter(call =>
                !timerMock.clearedTimers.has(call.returnValue) &&
                isPingCall(call)
            );
            for (const call of calls) {
                timerMock.clearedTimers.add(call.returnValue);
                // invoke the timer
                await wsMockState.waitForSend.waitForSideEffect(1, () => call.args[0]());
            }
        };

        const invokeReconnectTimer = async () => {
            const calls = timerMock.setTimeoutCalls.reconnectTimer();
            const call = calls[calls.length - 1];
            assert(!timerMock.clearedTimers.has(call.returnValue), 'The latest reconnect timer has been cleared or invoked before');
            timerMock.clearedTimers.add(call.returnValue);
            eventWaits.webSocketConnecting.waitForSideEffect(1, () => call.args[0]());
            return call;
        };

        const invokeConnectTimeoutTimer = async () => {
            const calls = timerMock.setTimeoutCalls.connectTimeout();
            const call = calls[calls.length - 1];
            assert(!timerMock.clearedTimers.has(call.returnValue), 'The latest connect timeout timer has been cleared or invoked before');
            timerMock.clearedTimers.add(call.returnValue);
            eventWaits.webSocketClose.waitForSideEffect(1, () => call.args[0]());
            return call;
        };

        const replyToPings = async (ws, {withError}) => {
            const wsMockState = ws[WS_MOCK_STATE];

            const calls = ws.send.getCalls();
            for (const call of calls) {
                const pingMessage = JSON.parse(call.args[0]);
                if (pingMessage.method !== 'jsonbird.ping' || pingIdsWithReplies.has(pingMessage.id)) {
                    continue;
                }

                pingIdsWithReplies.add(pingMessage.id);
                const wait = withError ? eventWaits.pingFail : eventWaits.pingSuccess;
                await wait.waitForSideEffect(1, () => {
                    const data = {jsonrpc: '2.0', id: pingMessage.id};
                    if (withError) {
                        data.error = {message: 'ping failed by test!'};
                    }
                    else {
                        data.result = true;
                    }
                    wsMockState.mockEvents.emit('message', {
                        // (MessageEvent)
                        type: 'message',
                        data: JSON.stringify(data),
                    });
                });
            }
        };

        it('Should perform a connection attempt immediately when starting', () => {
            eq(wsMock.callCount, 0);
            eq(rpc.started, false);

            rpc.start();
            eq(rpc.hasActiveConnection, false);
            eq(rpc.started, true);
            eq(wsMock.callCount, 1);
            const ws = wsMock.firstCall.returnValue;
            eq(ws.binaryType, 'arraybuffer');
        });

        it('Should start flowing RPC messages after the open event, and not before', async () => {
            const fooCall = rpc.call('foo', 123);
            rpc.start();
            const ws = wsMock.firstCall.returnValue;
            const wsMockState = ws[WS_MOCK_STATE];
            eq(ws.send.callCount, 0);

            wsMockState.open();
            deq(events.ALL, [['webSocketConnecting', []], ['webSocketOpen', []]]);
            eq(rpc.hasActiveConnection, true);
            await wsMockState.waitForSend.waitUntil(1);
            eq(ws.send.callCount, 1);
            const rpcMessage = JSON.parse(ws.send.args[0][0]);
            deq(rpcMessage, {jsonrpc: '2.0', id: rpcMessage.id, method: 'foo', params: [123]});

            wsMockState.mockEvents.emit('message', {
                // (MessageEvent)
                type: 'message',
                data: JSON.stringify({jsonrpc: '2.0', id: rpcMessage.id, result: 456}),
            });
            eq(await fooCall, 456);
        });

        it('Should immediately send out RPC messages while a connection is open', async () => {
            rpc.start();
            const ws = wsMock.firstCall.returnValue;
            const wsMockState = ws[WS_MOCK_STATE];
            wsMockState.open();

            rpc.call('foo', 123);
            await wsMockState.waitForSend.waitUntil(1);
            eq(ws.send.callCount, 1);
            rpc.call('bar');
            rpc.call('baz');
            await wsMockState.waitForSend.waitUntil(3);
            eq(ws.send.callCount, 3);
        });

        it('Should stop flowing RPC messages after the close event', async () => {
            rpc.reconnect = false;
            rpc.start();
            const ws1 = wsMock.firstCall.returnValue;
            const wsMockState1 = ws1[WS_MOCK_STATE];
            wsMockState1.open();

            rpc.call('foo', 123);
            await wsMockState1.waitForSend.waitUntil(1);

            wsMockState1.close(3294, 'bye bye');
            deq(events.ALL, [
                ['webSocketConnecting', []],
                ['webSocketOpen', []],
                ['webSocketClose', [{closedByRemote: true, code: 3294, reason: 'bye bye', reconnect: false}]],
            ]);
            eq(rpc.hasActiveConnection, false);
            eq(rpc.started, false);
            eq(ws1.send.callCount, 1);
            rpc.call('bar');
            await delay(10);
            eq(ws1.send.callCount, 1, 'Must not send out data while closed');

            // connect again
            rpc.start();
            eq(rpc.started, true);
            const ws2 = wsMock.secondCall.returnValue;
            await delay(10);
            eq(ws2.send.callCount, 0);

            const wsMockState2 = ws2[WS_MOCK_STATE];
            wsMockState2.open();
            eq(rpc.hasActiveConnection, true);
            eq(rpc.started, true);
            await wsMockState2.waitForSend.waitUntil(1);
            eq(ws1.send.callCount, 1, 'Must not send out data while closed');
            eq(ws2.send.callCount, 1);
        });

        it('Should stop flowing RPC messages after closing from our side', async () => {
            rpc.reconnect = false;
            rpc.start();
            const ws1 = wsMock.firstCall.returnValue;
            const wsMockState1 = ws1[WS_MOCK_STATE];
            wsMockState1.open();

            rpc.call('foo', 123);
            await wsMockState1.waitForSend.waitUntil(1);

            rpc.stop();
            eq(ws1.close.callCount, 1);
            deq(ws1.close.args, [[1000, 'Normal Closure']]);

            deq(events.ALL, [
                ['webSocketConnecting', []],
                ['webSocketOpen', []],
                ['webSocketClose', [{closedByRemote: false, code: 1000, reason: 'Normal Closure', reconnect: false}]],
            ]);

            wsMockState1.close(1000, 'Normal Closure');
            eq(events.ALL.length, 3, 'Must not emit the close event again');

            eq(ws1.send.callCount, 1);
            rpc.call('bar');
            await delay(10);
            eq(ws1.send.callCount, 1, 'Must not send out data while closed');

            // connect again
            rpc.start();
            const ws2 = wsMock.secondCall.returnValue;
            await delay(10);
            eq(ws2.send.callCount, 0);

            const wsMockState2 = ws2[WS_MOCK_STATE];
            wsMockState2.open();
            await wsMockState2.waitForSend.waitUntil(1);
            eq(ws1.send.callCount, 1, 'Must not send out data while closed');
            eq(ws2.send.callCount, 1, 'Must send the queued data over the new socket');
        });

        it('Should timeout the connection attempt', async () => {
            rpc.reconnect = false;
            rpc.connectTimeout = 29875;
            rpc.start();
            eq(rpc.started, true);
            const ws1 = wsMock.firstCall.returnValue;
            {
                const call = await invokeConnectTimeoutTimer();
                eq(call.args[1], 29875);
            }
            eq(rpc.hasActiveConnection, false);
            eq(rpc.started, false);
            deq(events.ALL, [
                ['webSocketConnecting', []],
                ['webSocketClose', [{
                    closedByRemote: false,
                    code: 4100,
                    reason: 'Timeout: Opening WebSocket took longer than 29875ms',
                    reconnect: false,
                }]],
            ]);
            eq(ws1.close.callCount, 1);
            deq(ws1.close.args, [[4100, 'Timeout: Opening WebSocket took longer than 29875ms']]);

            // connect again
            rpc.start();
            eq(rpc.started, true);
            eq(wsMock.callCount, 2);
            lengthOf(timerMock.setTimeoutCalls.connectTimeout(), 2);
            eq(rpc.hasActiveConnection, false);
        });

        it('Should reconnect after a closed connection if reconnect=true', async () => {
            rpc.reconnect = true;
            rpc.connectTimeout = 29875;
            rpc.reconnectDelayCallback = x => (x + 1) * 1111;
            rpc.start();
            eq(rpc.reconnectCounter, 0);
            const ws1 = wsMock.firstCall.returnValue;
            const wsMockState1 = ws1[WS_MOCK_STATE];
            wsMockState1.open();

            wsMockState1.close(3294, 'bye bye');
            deq(events.ALL, [
                ['webSocketConnecting', []],
                ['webSocketOpen', []],
                ['webSocketClose', [{closedByRemote: true, code: 3294, reason: 'bye bye', reconnect: true, reconnectDelay: 1111}]],
            ]);
            eq(rpc.reconnectCounter, 1);
            eq(rpc.hasActiveConnection, false);
            eq(rpc.started, true, 'must remain "started" after a close if reconnect is enabled');

            await delay(10);
            eq(wsMock.callCount, 1, 'Must not reconnect without the timer having passed');

            // connect again
            {
                const call = await invokeReconnectTimer();
                eq(call.args[1], 1111);
            }

            eq(rpc.started, true);
            eq(rpc.hasActiveConnection, false);
            const ws2 = wsMock.secondCall.returnValue;
            const wsMockState2 = ws2[WS_MOCK_STATE];
            wsMockState2.open();
            eq(rpc.hasActiveConnection, true);
            eq(rpc.started, true);

            rpc.call('foo');
            await wsMockState2.waitForSend.waitUntil(1);
            eq(ws1.send.callCount, 0, 'Must not send out data while closed');
            eq(ws2.send.callCount, 1);

            // close & connect again
            wsMockState2.close(3001, 'bye bye!');
            deq(events.ALL, [
                ['webSocketConnecting', []],
                ['webSocketOpen', []],
                ['webSocketClose', [{closedByRemote: true, code: 3294, reason: 'bye bye', reconnect: true, reconnectDelay: 1111}]],
                ['webSocketConnecting', []],
                ['webSocketOpen', []],
                ['webSocketClose', [{closedByRemote: true, code: 3001, reason: 'bye bye!', reconnect: true, reconnectDelay: 2222}]],
            ]);
            eq(rpc.reconnectCounter, 2);
            eq(rpc.hasActiveConnection, false);
            eq(rpc.started, true, 'must remain "started" after a close if reconnect is enabled');
            lengthOf(timerMock.setTimeoutCalls.reconnectTimer(), 2);
        });

        it('Should reconnect after a closed connection if reconnect=true and raise the reconnectCounter', async () => {
            rpc.reconnect = true;
            rpc.connectTimeout = 29875;
            rpc.reconnectCounterMax = 8;
            rpc.reconnectDelayCallback = sinon.spy(x => (x + 1) * 1111);
            rpc.start();

            for (let iteration = 0; iteration < 12; ++iteration) {
                eq(wsMock.callCount, iteration + 1);
                const ws = wsMock.getCall(iteration).returnValue;
                const wsMockState = ws[WS_MOCK_STATE];

                wsMockState.open();
                eq(rpc.started, true);
                eq(events.webSocketOpen.callCount, iteration + 1);

                const expectedReconnectDelay = Math.min((iteration + 1) * 1111, 9999);
                wsMockState.close(3000 + iteration, 'bye bye');
                eq(rpc.reconnectCounter, Math.min(iteration + 1, 8));
                eq(events.webSocketClose.callCount, iteration + 1);
                deq(events.webSocketClose.args[iteration], [{
                    closedByRemote: true,
                    code: 3000 + iteration,
                    reason: 'bye bye',
                    reconnect: true,
                    reconnectDelay: expectedReconnectDelay,
                }]);
                eq(rpc.reconnectDelayCallback.callCount, iteration + 1);
                eq(rpc.started, true);

                {
                    lengthOf(timerMock.setTimeoutCalls.reconnectTimer(), iteration + 1);
                    const call = await invokeReconnectTimer();
                    eq(call.args[1], expectedReconnectDelay);
                }
            }
        });

        it('Should reconnect after a connection timeout and raise the reconnectCounter', () => {
            rpc.reconnect = true;
            rpc.connectTimeout = 29875;
            rpc.reconnectCounterMax = 8;
            rpc.reconnectDelayCallback = sinon.spy(x => (x + 1) * 1111);
            rpc.start();

            for (let iteration = 0; iteration < 12; ++iteration) {
                eq(wsMock.callCount, iteration + 1);
                const ws = wsMock.getCall(iteration).returnValue;
                const wsMockState = ws[WS_MOCK_STATE];

                wsMockState.open();
                eq(rpc.started, true);
                eq(events.webSocketOpen.callCount, iteration + 1);
                const expectedReconnectDelay = Math.min((iteration + 1) * 1111, 9999);

                {
                    const timers = timerMock.setTimeoutCalls.connectTimeout();
                    lengthOf(timers, iteration + 1);
                    timers[iteration].args[0](); // invoke the connection timeout timer
                }

                eq(rpc.reconnectCounter, Math.min(iteration + 1, 8));
                eq(events.webSocketClose.callCount, iteration + 1);
                deq(events.webSocketClose.args[iteration], [{
                    closedByRemote: false,
                    code: 4100,
                    reason: 'Timeout: Opening WebSocket took longer than 29875ms',
                    reconnect: true,
                    reconnectDelay: expectedReconnectDelay,
                }]);
                eq(rpc.reconnectDelayCallback.callCount, iteration + 1);
                eq(rpc.started, true);

                {
                    const timers = timerMock.setTimeoutCalls.reconnectTimer();
                    lengthOf(timers, iteration + 1);
                    eq(timers[iteration].args[1], expectedReconnectDelay);
                    timers[iteration].args[0](); // invoke the reconnect timer
                }
            }
        });

        it('Should not wait for the server to finalize the WebSocket before scheduling a reconnect', async () => {
            rpc.reconnect = true;
            rpc.connectTimeout = 29875;
            rpc.reconnectDelayCallback = x => (x + 1) * 1111;
            rpc.start();
            const ws1 = wsMock.firstCall.returnValue;
            const wsMockState1 = ws1[WS_MOCK_STATE];
            wsMockState1.open();

            rpc.closeConnection(3294, 'bye bye');
            deq(events.ALL, [
                ['webSocketConnecting', []],
                ['webSocketOpen', []],
                ['webSocketClose', [{closedByRemote: false, code: 3294, reason: 'bye bye', reconnect: true, reconnectDelay: 1111}]],
            ]);
            deq(ws1.close.args, [[3294, 'bye bye']]);
            eq(rpc.hasActiveConnection, false);
            eq(rpc.started, true, 'must remain "started" after a close if reconnect is enabled');

            await delay(10);
            eq(wsMock.callCount, 1, 'Must not reconnect without the timer having passed');

            // connect again
            {
                const call = await invokeReconnectTimer();
                eq(call.args[1], 1111);
            }

            eq(rpc.started, true);
            eq(rpc.hasActiveConnection, false);
            const ws2 = wsMock.secondCall.returnValue;
            const wsMockState2 = ws2[WS_MOCK_STATE];
            wsMockState2.open();
            eq(rpc.hasActiveConnection, true);
            eq(rpc.started, true);

            rpc.call('foo');
            await wsMockState2.waitForSend.waitUntil(1);
            eq(ws1.send.callCount, 0, 'Must not send out data while closed');
            eq(ws2.send.callCount, 1);
        });

        it('Should decrease the reconnectCounter after a successful ping', async () => {
            rpc.reconnect = true;
            rpc.connectTimeout = 29875;
            rpc.reconnectCounterMax = 10;
            rpc.pingInterval = 1234;
            rpc.pingTimeout = 4567;
            rpc.reconnectDelayCallback = sinon.spy(x => (x + 1) * 1111);
            rpc.start();

            // fail the connection a few times
            for (let iteration = 0; iteration < 5; ++iteration) {
                const ws = wsMock.getCall(iteration).returnValue;
                const wsMockState = ws[WS_MOCK_STATE];
                wsMockState.open();
                wsMockState.close(3000 + iteration, 'bye bye');
                await invokeReconnectTimer();
            }
            eq(rpc.reconnectCounter, 5);

            const ws = wsMock.getCall(5).returnValue;
            const wsMockState = ws[WS_MOCK_STATE];
            wsMockState.open();
            await invokePingTimers(ws, call => call.args[1] === 1); // first ping should be scheduled 1ms after the "open" event
            await replyToPings(ws, {withError: false}); // reply to the first ping
            eq(events.pingSuccess.callCount, 1);
            eq(rpc.reconnectCounter, 4);

            // reply to a few more pings
            for (let iteration = 0; iteration < 6; ++iteration) {
                await invokePingTimers(ws, call => call.args[1] === 1234); // we set normal pings to an interval of 1234ms in this test
                await replyToPings(ws, {withError: false});
                eq(events.pingSuccess.callCount, iteration + 2);
                eq(rpc.reconnectCounter, Math.max(0, 3 - iteration));
            }

            eq(rpc.reconnectCounter, 0);
            eq(events.pingFail.callCount, 0);
        });

        it('Should reset ping statistics after a new connection has been made', async () => {
            rpc.reconnect = true;
            rpc.connectTimeout = 29875;
            rpc.reconnectCounterMax = 10;
            rpc.pingInterval = 1234;
            rpc.pingTimeout = 4567;
            rpc.consecutivePingFailClose = 1000;
            rpc.start();

            // fail the connection a few times
            for (let iteration = 0; iteration < 5; ++iteration) {
                const ws = wsMock.getCall(iteration).returnValue;
                const wsMockState = ws[WS_MOCK_STATE];
                wsMockState.open();
                wsMockState.close(3000 + iteration, 'bye bye');
                await invokeReconnectTimer();
            }
            eq(rpc.reconnectCounter, 5);

            {
                const ws = wsMock.getCall(5).returnValue;
                const wsMockState = ws[WS_MOCK_STATE];
                wsMockState.open();
                await invokePingTimers(ws, call => call.args[1] === 1); // first ping should be scheduled 1ms after the "open" event
                await replyToPings(ws, {withError: true}); // fail the first ping

                // fail a few more pings
                for (let iteration = 0; iteration < 6; ++iteration) {
                    await invokePingTimers(ws, call => call.args[1] === 1234); // we set normal pings to an interval of 1234ms in this test
                    await replyToPings(ws, {withError: true}); // fail the ping
                }

                eq(events.pingFail.callCount, 7);
                eq(events.pingSuccess.callCount, 0);
                deq(events.pingFail.args.map(([consecutive]) => consecutive), [1, 2, 3, 4, 5, 6, 7]);

                wsMockState.close(3000, 'bye bye');
                await invokeReconnectTimer();
            }

            // connect again
            {
                const ws = wsMock.getCall(6).returnValue;
                const wsMockState = ws[WS_MOCK_STATE];
                wsMockState.open();
                await invokePingTimers(ws, call => call.args[1] === 1);
                await replyToPings(ws, {withError: true});

                // fail a few more pings
                for (let iteration = 0; iteration < 3; ++iteration) {
                    await invokePingTimers(ws, call => call.args[1] === 1234); // we set normal pings to an interval of 1234ms in this test
                    await replyToPings(ws, {withError: true}); // fail the ping
                }

                eq(events.pingFail.callCount, 11);
                eq(events.pingSuccess.callCount, 0);
                deq(events.pingFail.args.map(([consecutive]) => consecutive), [1, 2, 3, 4, 5, 6, 7, 1, 2, 3, 4]);
            }
        });

        it('Should close the connection on stop and not reconnect', () => {
            rpc.reconnect = true;
            rpc.start();
            const ws = wsMock.getCall(0).returnValue;
            const wsMockState = ws[WS_MOCK_STATE];
            wsMockState.open();
            rpc.stop(3123, 'bye forever!');
            deq(ws.close.args, [[3123, 'bye forever!']]);
            lengthOf(timerMock.setTimeoutCalls.reconnectTimer(), 0);
        });

        it('Should abort the connection attempt on stop and not reconnect', () => {
            rpc.reconnect = true;
            rpc.start();
            const ws = wsMock.getCall(0).returnValue;
            rpc.stop(3123, 'bye forever!');
            deq(ws.close.args, [[3123, 'bye forever!']]);
            lengthOf(timerMock.setTimeoutCalls.reconnectTimer(), 0);
        });

        it('Should close the connection if too many consecutive pings fail', async () => {
            rpc.reconnect = true;
            rpc.pingInterval = 1234;
            rpc.pingTimeout = 4567;
            rpc.consecutivePingFailClose = 3;
            rpc.timeoutCloseCode = 3603;
            rpc.start();

            {
                const ws = wsMock.getCall(0).returnValue;
                const wsMockState = ws[WS_MOCK_STATE];
                wsMockState.open();
                await invokePingTimers(ws, call => call.args[1] === 1); // first ping should be scheduled 1ms after the "open" event
                await replyToPings(ws, {withError: false}); // success for the first ping
                eq(events.pingSuccess.callCount, 1);
                eq(events.pingFail.callCount, 0);

                for (let iteration = 0; iteration < 3; ++iteration) {
                    deq(ws.close.args, []);
                    eq(rpc.hasActiveConnection, true);
                    await invokePingTimers(ws, call => call.args[1] === 1234);
                    await replyToPings(ws, {withError: true});
                    eq(events.pingSuccess.callCount, 1);
                    eq(events.pingFail.callCount, iteration + 1);
                }
                deq(events.pingFail.args.map(([consecutive]) => consecutive), [1, 2, 3]);
                deq(ws.close.args, [[3603, 'Timeout: No responses received to ping calls']]);
                eq(rpc.hasActiveConnection, false);
                await invokeReconnectTimer();
            }
            {
                const ws = wsMock.getCall(1).returnValue;
                const wsMockState = ws[WS_MOCK_STATE];
                wsMockState.open();
                await invokePingTimers(ws, call => call.args[1] === 1); // first ping should be scheduled 1ms after the "open" event
                await replyToPings(ws, {withError: true});
                eq(events.pingSuccess.callCount, 1);
                eq(events.pingFail.callCount, 4);

                for (let iteration = 0; iteration < 2; ++iteration) {
                    deq(ws.close.args, []);
                    eq(rpc.hasActiveConnection, true);
                    await invokePingTimers(ws, call => call.args[1] === 1234);
                    await replyToPings(ws, {withError: true});
                    eq(events.pingSuccess.callCount, 1);
                    eq(events.pingFail.callCount, iteration + 5);
                }
                deq(events.pingFail.args.map(([consecutive]) => consecutive), [1, 2, 3, 1, 2, 3]);
                deq(ws.close.args, [[3603, 'Timeout: No responses received to ping calls']]);
                eq(rpc.hasActiveConnection, false);
            }
        });

        it('Should forward WebSocket error events', () => {
            // the error event is not used to mark the connection as closed / perform reconnecting / etc. Only the close event is used for
            // this, which should be enough.

            rpc.start();
            const ws = wsMock.firstCall.returnValue;
            const wsMockState = ws[WS_MOCK_STATE];
            const event = {
                type: 'error',
                message: 'Error from test',
                error: Error('Error from test'),
            };
            wsMockState.mockEvents.emit('error', event);
            eq(events.webSocketError.callCount, 1);
            eq(events.webSocketError.args[0][0], event);
            wsMockState.open();
            eq(rpc.hasActiveConnection, true);
        });
    });

    describe('RPC handling', () => {
        let rpc;

        afterEach(() => rpc && rpc.stop());

        it('Should close the connection and emit the error event for jsonbird errors', () => {
            const wsMock = webSocketClientMock();
            rpc = new WebSocketClient({
                createConnectionCallback: wsMock,
            });
            rpc.internalErrorCloseCode = 4204;
            const errors = [];
            rpc.on('error', err => void errors.push(err));
            rpc.start();
            const ws = wsMock.firstCall.returnValue;
            const err = Error('a very bad error from a unit test!');
            rpc.rpc.emit('error', err);
            lengthOf(errors, 1);
            eq(errors[0], err);
            deq(ws.close.args, [[4204, 'Internal JSON-RPC error']]);
        });

        it('Should forward protocol errors (without disconnecting)', async () => {
            const wsMock = webSocketClientMock();
            rpc = new WebSocketClient({
                createConnectionCallback: wsMock,
            });
            const errors = [];
            const wait = new Wait();
            rpc.on('protocolError', err => { errors.push(err); wait.advance(); });
            rpc.start();
            const ws = wsMock.firstCall.returnValue;
            const wsMockState = ws[WS_MOCK_STATE];
            wsMockState.open();

            lengthOf(errors, 0);
            await wait.waitForSideEffect(1, () => {
                wsMockState.mockEvents.emit('message', {
                    // (MessageEvent)
                    type: 'message',
                    data: JSON.stringify({jsonrpc: '1.5', id: 'foo', method: 'foo'}),
                });
            });
            lengthOf(errors, 1);
            eq(errors[0].message, 'JSONBird: Invalid Request: given "jsonrpc" version is not supported');
        });

        it('Should emit an "error" event if an exception is thrown in event listeners / callbacks', async () => {
            const wsMock = webSocketClientMock();
            rpc = new WebSocketClient({
                createConnectionCallback: wsMock,
            });
            const errors = [];
            const wait = new Wait();
            rpc.on('error', err => { errors.push(err); wait.advance(); });
            const err = Error('Error from unit test!');
            rpc.on('webSocketOpen', () => { throw err; });
            rpc.start();
            const ws = wsMock.firstCall.returnValue;
            const wsMockState = ws[WS_MOCK_STATE];
            lengthOf(errors, 0);
            wsMockState.open();
            lengthOf(errors, 1);
            eq(errors[0], err);
        });

        it('Should forward RPC functions to jsonbird', async () => {
            const wsMock = webSocketClientMock();
            rpc = new WebSocketClient({
                createConnectionCallback: wsMock,
            });

            const notifications = [];
            rpc.method('foo', async x => x + 123);
            rpc.methods({bar: async x => x * 2});
            rpc.notification('baz', x => notifications.push('baz ' + x));
            rpc.notifications({quux: x => notifications.push('quux ' + x)});

            eq(await rpc.rpc.callLocal('foo', 12), 135);
            eq(await rpc.rpc.callLocal('bar', 12), 24);
            await rpc.rpc.notifyLocal('baz', 'zzz');
            await rpc.rpc.notifyLocal('quux', 'yyy');
            deq(notifications, ['baz zzz', 'quux yyy']);

            rpc.start();
            const ws = wsMock.firstCall.returnValue;
            const wsMockState = ws[WS_MOCK_STATE];
            wsMockState.open();

            rpc.call('oof', 123);
            rpc.bindCall('rab')(456);
            rpc.notify('zab', 789);
            rpc.bindNotify('xuuq')(12);
            await wsMockState.waitForSend.waitUntil(4);
            eq(ws.send.callCount, 4);
            {
                const message = JSON.parse(ws.send.args[0][0]);
                deq(message, {
                    id: message.id,
                    jsonrpc: '2.0',
                    method: 'oof',
                    params: [123],
                });
            }
            {
                const message = JSON.parse(ws.send.args[1][0]);
                deq(message, {
                    id: message.id,
                    jsonrpc: '2.0',
                    method: 'rab',
                    params: [456],
                });
            }
            {
                const message = JSON.parse(ws.send.args[2][0]);
                deq(message, {
                    jsonrpc: '2.0',
                    method: 'zab',
                    params: [789],
                });
            }
            {
                const message = JSON.parse(ws.send.args[3][0]);
                deq(message, {
                    jsonrpc: '2.0',
                    method: 'xuuq',
                    params: [12],
                });
            }
        });
    });
});
