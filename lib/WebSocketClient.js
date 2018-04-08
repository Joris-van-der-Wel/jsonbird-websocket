'use strict';
const WebSocket = require('isomorphic-ws');
const JSONBird = require('jsonbird');
const {EventEmitter} = require('events');

const closeCodes = require('./closeCodes');
const readyState = require('./readyState');
const {
    connectTimeoutTimerId,
    reconnectTimerId,
    webSocketClientPrivate: PRIVATE,
} = require('./symbols');

const defaultCreateConnectionCallback = ({WebSocket, url}) => new WebSocket(url);
const defaultReconnectDelayCallback = x => 2 ** x * 100 * (Math.random() + 0.5);

const DEFAULT_OPTIONS = Object.freeze({
    jsonbird: {},
    url: '',
    createConnectionCallback: defaultCreateConnectionCallback,
    reconnect: true,
    reconnectDelayCallback: defaultReconnectDelayCallback,
    reconnectCounterMax: 8, // 2 ** 8 * 100 = 25600
    connectTimeout: 10000,
    consecutivePingFailClose: 4,
    timeoutCloseCode: 4100,
    internalErrorCloseCode: 4101,
});

const assert = (condition, message) => {
    if (!condition) {
        throw Error(message);
    }
};

// The browser API only accepts these numbers for webSocket.close() (see HTML whatwg spec)
// The ws library for node.js supports more close codes, however we void those to ensure compatability
const assertValidOutgoingCloseCode = (number, message) => assert(
    Number.isInteger(number) && (number === 1000 || (number >= 3000 && number <= 4999)),
    `${message} Invalid close code (${number}). It must be 1000 or in the range 3000 and 4999 inclusive`
);

class WebSocketClient extends EventEmitter {
    /**
     * This event is fired if an uncaught error occurred
     *
     * Most errors end up at the caller of our functions or at the remote peer, instead of this event.
     * Note that if you do not listen for this event on node.js, your process might exit.
     *
     * @event WebSocketClient#error
     * @param {Error} error
     */

    /**
     * This event is fired if our peer sent us something that we were unable to parse.
     *
     * These kind of errors do not end up at the 'error' event
     *
     * @event WebSocketClient#protocolError
     * @param {Error} error
     */

    /**
     * The most recent ping sent to our peer succeeded
     *
     * @event WebSocketClient#pingSuccess
     * @param {number} delay How long the ping took to resolve (in milliseconds)
     */

    /**
     * The most recent ping sent to our peer timed out or resulted in an error
     *
     * @event WebSocketClient#pingFail
     * @param {number} consecutiveFails The amount of consecutive pings that failed
     * @param {Error} error
     */

    /**
     * The WebSocket connection is being established but is not yet open.
     *
     * @event WebSocketClient#webSocketConnecting
     */

    /**
     * The WebSocket connection is now open and all pending RPC calls will be flushed to the server
     *
     * @event WebSocketClient#webSocketOpen
     */

    /**
     * The WebSocket API raised an error.
     *
     * @event WebSocketClient#webSocketError
     * @param {window.Event|ws.ErrorEvent} error When running in node.js this contains an ErrorEvent from the "ws" library, interesting
     *        properties include `message` (string) and `error` (Error)
     *        However when run in a browser, this will contain a plain `Event` without any useful error information.
     */

    /**
     * The WebSocket connection has been (half) closed by either side.
     *
     * @event WebSocketClient#webSocketClose
     * @param {{code: number, reason: string, closedByRemote: boolean}}
     */

    /**
     * This event is fired if the WebSocket connection has been closed.
     * A new connection might be established after this event if the `reconnect` option is enabled.
     *
     * @example
     * rpc = new WebSocketClient(...);
     * rpc.on('webSocketClose', ({code, reason}) => {
     *   if (reason === closeCodes.POLICY_VIOLATION) {
     *     rpc.stop(); // stop reconnecting
     *   }
     * });
     *
     * @event WebSocketClient#webSocketClose
     * @param {{code: number, reason: string, closedByRemote: boolean}} info
     */

    /**
     * @param {object} [opts] The effect of these options are documented at the getter/setter with the same name
     * @param {string} opts.url
     * @param {function} [opts.createConnectionCallback=({WebSocket, url}) => new (require('isomorphic-ws'))(url)]
     * @param {boolean} [opts.reconnect=true]
     * @param {function} [opts.reconnectDelayCallback=x => 2**x * 100 * (Math.random() + 0.5)]
     * @param {number} [opts.reconnectCounterMax=8]
     * @param {number} [opts.connectTimeout=10000]
     * @param {number} [opts.consecutivePingFailClose=4]
     * @param {number} [opts.timeoutCloseCode=4100]
     * @param {number} [opts.internalErrorCloseCode=4101]
     * @param {object} [opts.jsonbird] Options passed to the [JSONBird constructor](https://www.npmjs.com/package/jsonbird#new_JSONBird_new)
     * @param {boolean} [opts.jsonbird.receiveErrorStack=false]
     * @param {boolean} [opts.jsonbird.sendErrorStack=false]
     * @param {number} [opts.jsonbird.firstRequestId=0] The first request id to use
     * @param {string} [opts.jsonbird.sessionId=randomString()]
     * @param {string} [opts.jsonbird.endOfJSONWhitespace=]
     * @param {boolean} [opts.jsonbird.endOnFinish=true]
     * @param {boolean} [opts.jsonbird.finishOnEnd=true]
     * @param {boolean} [opts.jsonbird.pingReceive=true]
     * @param {string} [opts.jsonbird.pingMethod='jsonbird.ping']
     * @param {number} [opts.jsonbird.pingInterval=2000]
     * @param {number} [opts.jsonbird.pingTimeout=1000]
     * @param {number} [opts.jsonbird.pingNow=Date.now] Timer function used to figure out ping delays
     * @param {Function} [opts.jsonbird.setTimeout=global.setTimeout]
     * @param {Function} [opts.jsonbird.clearTimeout=global.clearTimeout]
     */
    constructor(opts = {}) {
        super();
        const options = Object.assign({}, DEFAULT_OPTIONS, opts);

        this[PRIVATE] = Object.seal({
            // settings
            url: '',
            createConnectionCallback: null,
            reconnect: false,
            reconnectDelayCallback: null,
            reconnectCounterMax: 0,
            connectTimeout: 0,
            consecutivePingFailClose: 0,
            timeoutCloseCode: 0,
            internalErrorCloseCode: 0,

            // state
            started: false,
            activeWebSocket: null,
            reconnectCounter: 0,
            hasHandledWebSocketClose: false,
            reconnectTimer: null,
            connectTimeoutTimer: null,
        });

        this.url = options.url;
        this.createConnectionCallback = options.createConnectionCallback;
        this.reconnect = options.reconnect;
        this.reconnectDelayCallback = options.reconnectDelayCallback;
        this.reconnectCounterMax = options.reconnectCounterMax;
        this.connectTimeout = options.connectTimeout;
        this.consecutivePingFailClose = options.consecutivePingFailClose;
        this.timeoutCloseCode = options.timeoutCloseCode;
        this.internalErrorCloseCode = options.internalErrorCloseCode;

        const rpc = new JSONBird(Object.assign({}, options.jsonbird, {
            writableMode: 'json-stream',
            readableMode: 'json-message',
        }));

        Object.defineProperty(this, 'rpc', {enumerable: true, value: rpc});

        this.rpc.on('error', this._wrapListener((...args) => this._handleRpcError(...args)));
        this.rpc.on('pingSuccess', this._wrapListener((...args) => this._handleRpcPingSuccess(...args)));
        this.rpc.on('pingFail', this._wrapListener((...args) => this._handleRpcPingFail(...args)));
        this.rpc.on('data', this._wrapListener((...args) => this._handleRpcData(...args)));

        // note: the error event might stop the node.js process, so make
        // sure _handleRpcError has been called first
        this.rpc.on('error', err => this.emit('error', err));
        this.rpc.on('protocolError', err => this.emit('protocolError', err));
        this.rpc.on('pingSuccess', delay => this.emit('pingSuccess', delay));
        this.rpc.on('pingFail', (consecutiveFails, err) => this.emit('pingFail', consecutiveFails, err));
        this.rpc.pause();
    }

    /**
     * The URL to which to connect; this should be the URL to which the WebSocket server will respond.
     * @param {string} value
     */
    set url(value) {
        this[PRIVATE].url = String(value);
    }

    /**
     * The URL to which to connect; this should be the URL to which the WebSocket server will respond.
     * @return {string}
     */
    get url() {
        return this[PRIVATE].url;
    }

    /**
     * If true, a new connection will be made (after a delay) if the connection closes for any reason (error, timeouts, explicit close)
     * @param {boolean} value
     */
    set reconnect(value) {
        this[PRIVATE].reconnect = Boolean(value);
    }

    /**
     * If `true`, a new connection will be made (after a delay) if the connection closes for any reason (error, timeouts, explicit close)
     * @return {boolean}
     */
    get reconnect() {
        return this[PRIVATE].reconnect;
    }

    /**
     * If this amount of pings fail consecutively, the connection will be automatically closed. If `reconnect` is `true` a new connection
     * will be established.
     * @param {number} value
     */
    set consecutivePingFailClose(value) {
        this[PRIVATE].consecutivePingFailClose = Number(value);
    }

    /**
     * If this amount of pings fail consecutively, the connection will be automatically closed. If `reconnect` is `true` a new connection
     * will be established.
     * @return {number}
     */
    get consecutivePingFailClose() {
        return this[PRIVATE].consecutivePingFailClose;
    }

    /**
     * Abort the connection if it takes longer than this many milliseconds to complete the connection attempt.
     * This is the maximum amount of time that we will wait for the WebSocket `readyState` to transition from `CONNECTING` to `OPEN`
     * @param {number} value milliseconds
     */
    set connectTimeout(value) {
        this[PRIVATE].connectTimeout = Number(value);
    }

    /**
     * Abort the connection if it takes longer than this many milliseconds to complete the connection attempt.
     * This is the maximum amount of time that we will wait for the WebSocket `readyState` to transition from `CONNECTING` to `OPEN`
     * @return {number} milliseconds
     */
    get connectTimeout() {
        return this[PRIVATE].connectTimeout;
    }

    /**
     * The close code to send to the server when the connection is going to be closed because of a timeout
     * @param {number} value `1000` or in the range `3000` and `4999` inclusive
     */
    set timeoutCloseCode(value) {
        const number = Number(value);
        assertValidOutgoingCloseCode(number, 'Invalid value for timeoutCloseCode:');
        this[PRIVATE].timeoutCloseCode = number;
    }

    /**
     * The close code to send to the server when the connection is going to be closed because of a timeout
     * @return {number} `1000` or integer in the range `3000` and `4999` inclusive
     */
    get timeoutCloseCode() {
        return this[PRIVATE].timeoutCloseCode;
    }

    /**
     * The close code to send to the server when the connection is going to be closed because an `error` event was raised
     * by the node.js stream api or jsonbird.
     * @param {number} value `1000` or in the range `3000` and `4999` inclusive
     */
    set internalErrorCloseCode(value) {
        const number = Number(value);
        assertValidOutgoingCloseCode(number, 'Invalid value for internalErrorCloseCode:');
        this[PRIVATE].internalErrorCloseCode = number;
    }

    /**
     * The close code to send to the server when the connection is going to be closed because an `error` event was raised
     * by the node.js stream api or jsonbird.
     * @return {number} `1000` or in the range `3000` and `4999` inclusive
     */
    get internalErrorCloseCode() {
        return this[PRIVATE].internalErrorCloseCode;
    }

    /**
     * A callback which is called whenever this library wants to establish a new WebSocket connection.
     * The callback is called with a single argument, an object containing the following properties:
     *
     * * "url" - The same value as `this.url`
     * * "WebSocket" - The WebSocket class provided by the NPM package "isomorphic-ws"... If this library
     *   is used with browserify/webpack this will be equal to `window.WebSocket`. Otherwise this value
     *   will be equal to the NPM "ws" package.
     *
     * @param {function} value
     */
    set createConnectionCallback(value) {
        assert(typeof value === 'function', 'createConnectionCallback must be a function');
        this[PRIVATE].createConnectionCallback = value;
    }

    /**
     * A callback which is called whenever this library wants to establish a new WebSocket connection.
     * The callback is called with a single argument, an object containing the following properties:
     *
     * * "url" - The same value as `this.url`
     * * "WebSocket" - The WebSocket class provided by the NPM package "isomorphic-ws"... If this library
     *   is used with browserify/webpack this will be equal to `window.WebSocket`. Otherwise this value
     *   will be equal to the NPM "ws" package.
     *
     * @return {function}
     */
    get createConnectionCallback() {
        return this[PRIVATE].createConnectionCallback;
    }

    /**
     * A callback which is called after a failed connection to determine the delay before the next connection attempt.
     * The callback is called with a single argument, a number specifying the current `reconnectCounter`. This counter
     * is increased by `1` whenever a connection attempt fails, and it is slowly decreased while the connection is healthy
     *
     * The reconnectCounter is always a value between `0` and `this.reconnectCounterMax` inclusive.
     * The callback must return the reconnect delay as a number in milliseconds.
     *
     * @param {function} value
     */
    set reconnectDelayCallback(value) {
        assert(typeof value === 'function', 'reconnectDelayCallback must be a function');
        this[PRIVATE].reconnectDelayCallback = value;
    }

    /**
     * A callback which is called after a failed connection to determine the delay before the next connection attempt.
     * The callback is called with a single argument, a number specifying the current `reconnectCounter`. This counter
     * is increased by `1` whenever a connection attempt fails, and it is slowly decreased while the connection is healthy
     *
     * The reconnectCounter is always a value between `0` and `this.reconnectCounterMax` inclusive.
     * The callback must return the reconnect delay as a number in milliseconds.
     *
     * @return {function}
     */
    get reconnectDelayCallback() {
        return this[PRIVATE].reconnectDelayCallback;
    }

    /**
     * The maximum value for the `reconnectCounter` (see reconnectDelayCallback). This can be used to easily set a maximum reconnect delay.
     * For example if `reconnectCounterMax` is set to `8`, and `reconnectDelayCallback` is set to the default value, the highest reconnect
     * delay is: `2**8 * 100 * (Math.random() + 0.5)` = random between 12800 and 38400
     *
     * @param {number} value
     */
    set reconnectCounterMax(value) {
        this[PRIVATE].reconnectCounterMax = Number(value);
    }

    /**
     * The maximum value for the `reconnectCounter` (see reconnectDelayCallback). This can be used to easily set a maximum reconnect delay.
     * For example if `reconnectCounterMax` is set to `8`, and `reconnectDelayCallback` is set to the default value, the highest reconnect
     * delay is: `2**8 * 100 * (Math.random() + 0.5)` = random between 12800 and 38400
     *
     * @return {number}
     */
    get reconnectCounterMax() {
        return this[PRIVATE].reconnectCounterMax;
    }

    /**
     * If true and a remote method throws, attempt to read stack trace information from the JSON-RPC `error.data` property. This stack
     * trace information is then used to set the `fileName`, `lineNumber`, `columnNumber` and `stack` properties of our local `Error`
     * object (the Error object that the `.call()` function will reject with).
     *
     * @return {boolean}
     */
    get receiveErrorStack() {
        return this.rpc.receiveErrorStack;
    }

    /**
     * If true and a remote method throws, attempt to read stack trace information from the JSON-RPC `error.data` property. This stack
     * trace information is then used to set the `fileName`, `lineNumber`, `columnNumber` and `stack` properties of our local `Error`
     * object (the Error object that the `.call()` function will reject with).
     *
     * @param {boolean} value
     */
    set receiveErrorStack(value) {
        this.rpc.receiveErrorStack = value;
    }

    /**
     * If true, the `fileName`, `lineNumber`, `columnNumber` and `stack` of an `Error` thrown during a method is sent to the client
     * using the JSON-RPC `error.data` property.
     *
     * @return {boolean}
     */
    get sendErrorStack() {
        return this.rpc.sendErrorStack;
    }

    /**
     * If true, the `fileName`, `lineNumber`, `columnNumber` and `stack` of an `Error` thrown during a method is sent to the client
     * using the JSON-RPC `error.data` property.
     *
     * @param {boolean} value
     */
    set sendErrorStack(value) {
        this.rpc.sendErrorStack = value;
    }

    /**
     * The timeout to use for an outgoing method call unless a different timeout was explicitly specified to `call()`.
     *
     * @return {number}
     */
    get defaultTimeout() {
        return this.rpc.defaultTimeout;
    }

    /**
     * The timeout to use for an outgoing method call unless a different timeout was explicitly specified to `call()`.
     *
     * @param {number} value
     */
    set defaultTimeout(value) {
        this.rpc.defaultTimeout = value;
    }

    /**
     * The time (in milliseconds) between each ping if `isSendingPings` is true.
     * This time is in addition to the time spent waiting for the previous ping to settle.
     *
     * @return {number} milliseconds
     */
    get pingInterval() {
        return this.rpc.pingInterval;
    }

    /**
     * The time (in milliseconds) between each ping if `isSendingPings` is true.
     * This time is in addition to the time spent waiting for the previous ping to settle.
     *
     * @param {number} value milliseconds
     */
    set pingInterval(value) {
        this.rpc.pingInterval = Number(value);
    }

    /**
     * The maximum amount of time (in milliseconds) to wait for a ping method call to resolve.
     * @return {number} milliseconds
     */
    get pingTimeout() {
        return this.rpc.pingTimeout;
    }

    /**
     * The maximum amount of time (in milliseconds) to wait for a ping method call to resolve.
     * @param {number} value milliseconds
     */
    set pingTimeout(value) {
        this.rpc.pingTimeout = Number(value);
    }

    /**
     * Returns `true` if this instance has been started. Which means that we are either setting up a connection, connected or waiting for a
     * reconnect.
     * @return {boolean}
     */
    get started() {
        return this[PRIVATE].started;
    }

    get reconnectCounter() {
        return this[PRIVATE].reconnectCounter;
    }

    /**
     * Registers a new method with the given name.
     *
     * If the same method name is registered multiple times, earlier definitions will be overridden
     *
     * @param {string} name The method name
     * @param {Function} func
     */
    method(name, func) {
        this.rpc.method(name, func);
    }

    /**
     * Registers multiple methods using an object or Map.
     *
     * Each key->value pair is registered as a method.
     * Values that are not a function are ignored.
     * The `this` object during a method call is set to the `objectOrMap` (unless a Map was used)
     *
     * If the same method name is registered multiple times, earlier definitions will be overridden
     *
     * @param {Object|Map} objectOrMap
     */
    methods(objectOrMap) {
        this.rpc.methods(objectOrMap);
    }

    /**
     * Registers a notification with the given name.
     *
     * A notification is a method for which the return value or thrown Error is ignored. A response object is never sent.
     *
     * If the same method name is registered multiple times, all functions handlers will be called (in the same order as they were
     * registered)
     *
     * @param {string} name The method name
     * @param {Function} func
     */
    notification(name, func) {
        this.rpc.notification(name, func);
    }

    /**
     * Registers multiple notifications using an object or Map.
     *
     * A notification is a method for which the return value or thrown Error is ignored. A response object is never sent.
     *
     * If the same method name is registered multiple times, all functions handlers will be called (in the same order as they were
     * registered)
     *
     * Each key->value pair is registered as a notification.
     * Values that are not a "function" are ignored.
     * The `this` object during a method call is set to the `objectOrMap` (unless a Map was used)
     *
     * If the same method name is registered multiple times, earlier definitions will be overridden
     *
     * @param {Object|Map} objectOrMap
     */
    notifications(objectOrMap) {
        this.rpc.notifications(objectOrMap);
    }

    /**
     * Call a method on the remote instance, by sending a JSON-RPC request object to our write stream.
     *
     * If no write stream has been set, the method call will be buffered until a write stream is set (setWriteStream).
     * Note: if a read stream is never set, any call() will also never resolve.
     *
     * @param {string|Object} nameOrOptions The method name or an options object
     * @param {string} nameOrOptions.name The method name
     * @param {number} nameOrOptions.timeout A maximum time (in milliseconds) to wait for a response. The returned promise will reject
     * after this time.
     * @param {...*} args
     *
     * @return {Promise} A Promise which will resole with the return value of the remote method
     */
    async call(nameOrOptions, ...args) {
        return await this.rpc.call(nameOrOptions, ...args);
    }

    /**
     * Returns a new function which calls the given method name by binding the function to this RPC instance and the given method name (or
     * options object).
     *
     * For example:
     *
     * ```javascript
     * const subtract = rpc.bindCall('subtract');
     * subtract(10, 3).then(result => console.log(result)) // 7
     * ```
     *
     * @param {string|Object} nameOrOptions The method name or an options object
     * @param {string} nameOrOptions.name The method name
     * @param {number} nameOrOptions.timeout A maximum time (in milliseconds) to wait for a response. The returned promise will reject
     *                 after this time.
     * @return {Function}
     */
    bindCall(nameOrOptions) {
        return this.rpc.bindCall(nameOrOptions);
    }

    /**
     * Execute a notification on the remote instance, by sending a JSON-RPC request object to our write stream.
     *
     * If no write stream has been set, the method call will be buffered until a write stream is set (setWriteStream).
     *
     * This function resolves as soon as the request object has been buffered, but does not wait for the remote instance to have
     * actually received the request object.
     *
     * @param {string|Object} nameOrOptions The method name or an options object
     * @param {string} nameOrOptions.name The method name
     * @param {...*} args
     *
     * @return {Promise}
     */
    async notify(nameOrOptions, ...args) {
        return await this.rpc.notify(nameOrOptions, ...args);
    }

    /**
     * Returns a new function which sends a notification with the given method name by binding the function to this RPC instance and the
     * given method name (or options object).
     *
     * For example:
     *
     * ```javascript
     * const userDeleted = rpc.bindNotify('userDeleted');
     * userDeleted(123)
     * ```
     *
     * @param {string|Object} nameOrOptions The method name or an options object
     * @param {string} nameOrOptions.name The method name
     * @param {number} nameOrOptions.timeout A maximum time (in milliseconds) to wait for a response. The returned promise will reject
     *                 after this time.
     * @return {Function}
     */
    bindNotify(nameOrOptions) {
        return this.rpc.bindNotify(nameOrOptions);
    }

    /**
     * Establish the WebSocket connection, and automatically reconnect after an network error or timeout.
     */
    start() {
        assert(!this.started, 'start(): Already started');
        this[PRIVATE].started = true;
        this._connect();
    }

    /**
     * Close the active WebSocket connection, and stop reconnecting.
     * If there is no active connection the `code` and `reason` params are ignored.
     *
     * @param {number} code Must be equal to 1000 or in the range 3000 to 4999 inclusive
     * @param {string} reason Must be 123 bytes or less (utf8)
     */
    stop(code = closeCodes.NORMAL, reason = 'Normal Closure') {
        this[PRIVATE].started = false;
        this._clearReconnectTimer();
        this.rpc.stopPinging();
        this.closeConnection(code, reason);
    }

    /**
     * Returns `true` if there is an active WebSocket connection, in which case all RPC calls will be flushed out immediately and at which
     * point we might receive RPC calls directed to us.
     * If this property returns `false`, all outgoing RPC calls will be queued until we have a connection again
     * @return {boolean}
     */
    get hasActiveConnection() {
        return Boolean(
            this.started &&
            this[PRIVATE].activeWebSocket &&
            this[PRIVATE].activeWebSocket.readyState === readyState.OPEN &&
            !this.rpc.isPaused()
        );
    }

    /**
     * Close the active WebSocket connection and reconnect if reconnects are enabled.
     * If there is no active connection the `code` and `reason` params are ignored.
     *
     * @param {number} code Must be equal to 1000 or in the range 3000 to 4999 inclusive
     * @param {string} reason Must be 123 bytes or less (utf8)
     * @return {boolean}
     */
    closeConnection(code, reason) {
        assertValidOutgoingCloseCode(code, 'closeConnection(): ');
        const {activeWebSocket} = this[PRIVATE];
        const hadConnection = Boolean(activeWebSocket);
        if (hadConnection) {
            activeWebSocket.close(code, reason);
            this._webSocketClosed({code, reason, closedByRemote: false});
        }
        return hadConnection;
    }

    _wrapListener(func) {
        return (...args) => {
            try {
                func(...args);
            }
            catch (err) {
                this.emit('error', err);
            }
        };
    }

    _connect() {
        assert(this.started, '_connect(): Should be started');
        assert(!this[PRIVATE].activeWebSocket, '_connect(): There already is an active connection');

        const {url, connectTimeout} = this;
        this._clearReconnectTimer();
        this[PRIVATE].hasHandledWebSocketClose = false;
        const webSocket = this[PRIVATE].createConnectionCallback({WebSocket, url});
        this[PRIVATE].activeWebSocket = webSocket;
        const isActive = () => this[PRIVATE].activeWebSocket === webSocket;
        webSocket.binaryType = 'arraybuffer';
        // if addEventListener is used, the "ws' library fires the same kind of events as a browser would
        webSocket.addEventListener('open', this._wrapListener(() => isActive() && this._handleWebSocketOpen()));
        webSocket.addEventListener('error', this._wrapListener(errorOrEvent => isActive() && this._handleWebSocketError(errorOrEvent)));
        webSocket.addEventListener('close', this._wrapListener(e => isActive() && this._handleWebSocketClose(e.code, e.reason)));
        webSocket.addEventListener('message', this._wrapListener(e => isActive() && this._handleWebSocketMessage(e.data)));

        this[PRIVATE].connectTimeoutTimer = this.rpc.setTimeout(
            () => isActive() && this._handleConnectionTimeout(connectTimeout),
            connectTimeout,
            connectTimeoutTimerId
        );

        this.emit('webSocketConnecting');
    }

    _handleConnectionTimeout(connectTimeout) {
        this.closeConnection(this.timeoutCloseCode, `Timeout: Opening WebSocket took longer than ${connectTimeout}ms`);
    }

    _handleRpcError(err) {
        this.closeConnection(this.internalErrorCloseCode, 'Internal JSON-RPC error');
    }

    _handleRpcPingSuccess(delay) {
        // slowly decrease the reconnect delay when pings succeed
        this[PRIVATE].reconnectCounter = Math.max(0, this[PRIVATE].reconnectCounter - 1);
    }

    _handleRpcPingFail(consecutiveFails, err) {
        if (consecutiveFails >= this.consecutivePingFailClose) {
            this.closeConnection(this.timeoutCloseCode, 'Timeout: No responses received to ping calls');
        }
    }

    _handleRpcData(data) {
        const {activeWebSocket} = this[PRIVATE];
        assert(activeWebSocket, '_handleRpcData(): Expected an active connection');
        assert(activeWebSocket.readyState === readyState.OPEN, '_handleRpcData(): Expected an open connection');
        activeWebSocket.send(data);
    }

    _handleWebSocketOpen() {
        this._clearConnectTimeoutTimer();
        this._clearReconnectTimer();
        this.rpc.resume();
        const {pingInterval} = this.rpc;
        try {
            this.rpc.pingInterval = 1; // first ping as soon as possible
            this.rpc.resetPingStatistics();
            this.rpc.startPinging();
        }
        finally {
            this.rpc.pingInterval = pingInterval;
        }
        this.emit('webSocketOpen');
    }

    _handleWebSocketError(errorOrEvent) {
        this.emit('webSocketError', errorOrEvent);
    }

    _handleWebSocketClose(code, reason) {
        this._webSocketClosed({code, reason, closedByRemote: true});
    }

    _handleWebSocketMessage(data) {
        if (typeof data === 'string') {
            // sent as an unicode string
            this.rpc.write(data, 'utf8');
        }
        else {
            // sent as binary data (event.data is ArrayBuffer)
            this.rpc.write(Buffer.from(data));
        }
    }

    _clearReconnectTimer() {
        if (this[PRIVATE].reconnectTimer) {
            this.rpc.clearTimeout(this[PRIVATE].reconnectTimer);
        }
        this[PRIVATE].reconnectTimer = null;
    }

    _clearConnectTimeoutTimer() {
        if (this[PRIVATE].connectTimeoutTimer) {
            this.rpc.clearTimeout(this[PRIVATE].connectTimeoutTimer);
        }
        this[PRIVATE].connectTimeoutTimer = null;
    }

    _webSocketClosed({code, reason, closedByRemote}) {
        /* istanbul ignore if */
        if (this[PRIVATE].hasHandledWebSocketClose) {
            return;
        }
        this[PRIVATE].activeWebSocket = null;
        this._clearConnectTimeoutTimer();

        this.rpc.pause();
        this.rpc.stopPinging();

        if (this.started && this.reconnect) {
            const {reconnectCounterMax, reconnectDelayCallback} = this;
            const {reconnectCounter} = this[PRIVATE];
            const reconnectDelay = reconnectDelayCallback(reconnectCounter);
            this[PRIVATE].reconnectCounter = Math.min(reconnectCounter + 1, reconnectCounterMax);
            this._clearReconnectTimer();
            this[PRIVATE].reconnectTimer = this.rpc.setTimeout(() => this._connect(), reconnectDelay, reconnectTimerId);

            this.emit('webSocketClose', {code, reason, closedByRemote, reconnect: true, reconnectDelay});
        }
        else {
            this.stop();
            this.emit('webSocketClose', {code, reason, closedByRemote, reconnect: false});
        }

        this[PRIVATE].hasHandledWebSocketClose = true;
    }
}

module.exports = WebSocketClient;
