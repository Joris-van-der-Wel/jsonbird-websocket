# JSONBird-WebSocket
[![Build Status](https://travis-ci.org/Joris-van-der-Wel/jsonbird-websocket.svg?branch=master)](https://travis-ci.org/Joris-van-der-Wel/jsonbird-websocket) [![Coverage Status](https://coveralls.io/repos/github/Joris-van-der-Wel/jsonbird-websocket/badge.svg?branch=master)](https://coveralls.io/github/Joris-van-der-Wel/jsonbird-websocket?branch=master) [![Greenkeeper badge](https://badges.greenkeeper.io/Joris-van-der-Wel/jsonbird-websocket.svg)](https://greenkeeper.io/)

JSONBird-WebSocket makes it easy to establish a JSON-RPC 2.0 client connection over WebSocket so that you can send and receive Remote Procedure Calls. It works in node.js and web browsers. If the connection closes or is unresponsive, an automatic reconnection will occur after a delay. This delay will slowly increase to avoid spamming the server.

This library uses the [JSONBird](https://www.npmjs.com/package/jsonbird) module, which is a more generic JSON-RPC 2.0 library, which can be used to create any kind of client or server over different transports.

Almost all behaviour is configurable, examples include:
* Passing different options to the [`ws`](https://www.npmjs.com/package/ws) module, such as TLS options and HTTP headers
* Stopping automatic reconnects based on the close code received from the server
* Specifying a timeout per RPC call
* Specifying a connection timeout
* Specifying a different reconnect delay strategy (the default implementation includes exponential backoff and jitter)
* Custom ping interval, method name, timeout and after how many failed pings the connection will be closed and reopened
* Custom outgoing close codes for timeouts and internal errors
* Performing RPC method calls from client to server, server to client, or bidirectional

However the default options should be good enough in most situations.

And some events are available that can be used to hook up logging or provide additional behaviour:
* Connecting, opening and closing of the WebSocket connection
* JSON-RPC 2.0 protocol errors
* Ping failure & success

Support for [HTML WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket) in web browsers is provided thanks to the [`isomorphic-ws`](https://www.npmjs.com/package/isomorphic-ws) module. You can use [browserify](https://www.npmjs.com/package/browserify) or [webpack](https://www.npmjs.com/package/webpack) to generate a javascript bundle containing this library and the rest of your own code.

### Installation
```
npm install --save jsonbird-websocket ws
```

The `ws` package does not have to be installed if you are only going to use this library for web browsers.


## Pings
This library sends out ping messages as JSON-RPC method calls (NOT WebSocket pings), the other end is expected to reply to this method call as soon as possible (however the return value is ignored). The default name of this method is `"jsonbird.ping"`.

This is an example of the message which will be sent out over the WebSocket connection periodically:
```json
{"jsonrpc":"2.0","id":"10350 HJRolp3jG","method":"jsonbird.ping","params":[]}
```

The server is then expected to reply with:
```json
{"jsonrpc":"2.0","id":"10350 HJRolp3jG","result":true}
```

These ping messages are used to ensure that the connection is healthy. If the server does not reply to pings the connection will eventually be closed (and then a new connection will be made).

## Examples

```javascript
const {WebSocketClient} = require('jsonbird-websocket');

async function example() {
  const rpc = new WebSocketClient({
    url: `ws://127.0.0.1:1234/`,
  });
  rpc.defaultTimeout = 5000;
  rpc.on('webSocketError', ({error}) => console.error('Connection failed', error));
  rpc.on('webSocketClose', ({code, reason}) => {
    console.log('Connection has been closed', code, reason);
    if (code === 1008) {
      // stop reconnecting when we receive this specific
      // close code from the server
      rpc.stop();
    }
  });

  // no connection will be made until .start()
  rpc.start();

  // Send an JSON-RPC 2.0 method call to the server:
  const result = await rpc.call('foo', 123, 456);
  console.log('result', result);

  // Start listening for method calls sent from the server to our client:
  rpc.method('sum', async (a, b) => a + b);
};

example().catch(console.error);
```

# API Documentation
<a name="WebSocketClient"></a>

## WebSocketClient
**Kind**: global class  

* [WebSocketClient](#WebSocketClient)
    * [new WebSocketClient([opts])](#new_WebSocketClient_new)
    * [.url](#WebSocketClient+url)
    * [.url](#WebSocketClient+url) ⇒ <code>string</code>
    * [.reconnect](#WebSocketClient+reconnect)
    * [.reconnect](#WebSocketClient+reconnect) ⇒ <code>boolean</code>
    * [.consecutivePingFailClose](#WebSocketClient+consecutivePingFailClose)
    * [.consecutivePingFailClose](#WebSocketClient+consecutivePingFailClose) ⇒ <code>number</code>
    * [.connectTimeout](#WebSocketClient+connectTimeout)
    * [.connectTimeout](#WebSocketClient+connectTimeout) ⇒ <code>number</code>
    * [.timeoutCloseCode](#WebSocketClient+timeoutCloseCode)
    * [.timeoutCloseCode](#WebSocketClient+timeoutCloseCode) ⇒ <code>number</code>
    * [.internalErrorCloseCode](#WebSocketClient+internalErrorCloseCode)
    * [.internalErrorCloseCode](#WebSocketClient+internalErrorCloseCode) ⇒ <code>number</code>
    * [.createConnectionCallback](#WebSocketClient+createConnectionCallback)
    * [.createConnectionCallback](#WebSocketClient+createConnectionCallback) ⇒ <code>function</code>
    * [.reconnectDelayCallback](#WebSocketClient+reconnectDelayCallback)
    * [.reconnectDelayCallback](#WebSocketClient+reconnectDelayCallback) ⇒ <code>function</code>
    * [.reconnectCounterMax](#WebSocketClient+reconnectCounterMax)
    * [.reconnectCounterMax](#WebSocketClient+reconnectCounterMax) ⇒ <code>number</code>
    * [.receiveErrorStack](#WebSocketClient+receiveErrorStack) ⇒ <code>boolean</code>
    * [.receiveErrorStack](#WebSocketClient+receiveErrorStack)
    * [.sendErrorStack](#WebSocketClient+sendErrorStack) ⇒ <code>boolean</code>
    * [.sendErrorStack](#WebSocketClient+sendErrorStack)
    * [.defaultTimeout](#WebSocketClient+defaultTimeout) ⇒ <code>number</code>
    * [.defaultTimeout](#WebSocketClient+defaultTimeout)
    * [.pingInterval](#WebSocketClient+pingInterval) ⇒ <code>number</code>
    * [.pingInterval](#WebSocketClient+pingInterval)
    * [.pingTimeout](#WebSocketClient+pingTimeout) ⇒ <code>number</code>
    * [.pingTimeout](#WebSocketClient+pingTimeout)
    * [.started](#WebSocketClient+started) ⇒ <code>boolean</code>
    * [.hasActiveConnection](#WebSocketClient+hasActiveConnection) ⇒ <code>boolean</code>
    * [.method(name, func)](#WebSocketClient+method)
    * [.methods(objectOrMap)](#WebSocketClient+methods)
    * [.notification(name, func)](#WebSocketClient+notification)
    * [.notifications(objectOrMap)](#WebSocketClient+notifications)
    * [.call(nameOrOptions, ...args)](#WebSocketClient+call) ⇒ <code>Promise</code>
    * [.bindCall(nameOrOptions)](#WebSocketClient+bindCall) ⇒ <code>function</code>
    * [.notify(nameOrOptions, ...args)](#WebSocketClient+notify) ⇒ <code>Promise</code>
    * [.bindNotify(nameOrOptions)](#WebSocketClient+bindNotify) ⇒ <code>function</code>
    * [.start()](#WebSocketClient+start)
    * [.stop(code, reason)](#WebSocketClient+stop)
    * [.closeConnection(code, reason)](#WebSocketClient+closeConnection) ⇒ <code>boolean</code>
    * ["error" (error)](#WebSocketClient+event_error)
    * ["protocolError" (error)](#WebSocketClient+event_protocolError)
    * ["pingSuccess" (delay)](#WebSocketClient+event_pingSuccess)
    * ["pingFail" (consecutiveFails, error)](#WebSocketClient+event_pingFail)
    * ["webSocketConnecting"](#WebSocketClient+event_webSocketConnecting)
    * ["webSocketOpen"](#WebSocketClient+event_webSocketOpen)
    * ["webSocketError" (error)](#WebSocketClient+event_webSocketError)
    * ["webSocketClose"](#WebSocketClient+event_webSocketClose)
    * ["webSocketClose" (info)](#WebSocketClient+event_webSocketClose)

<a name="new_WebSocketClient_new"></a>

### new WebSocketClient([opts])

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| [opts] | <code>object</code> |  | The effect of these options are documented at the getter/setter with the same name |
| opts.url | <code>string</code> |  |  |
| [opts.createConnectionCallback] | <code>function</code> | <code>({WebSocket, url}) &#x3D;&gt; new (require(&#x27;isomorphic-ws&#x27;))(url)</code> |  |
| [opts.reconnect] | <code>boolean</code> | <code>true</code> |  |
| [opts.reconnectDelayCallback] | <code>function</code> | <code>x &#x3D;&gt; 2**x * 100 * (Math.random() + 0.5)</code> |  |
| [opts.reconnectCounterMax] | <code>number</code> | <code>8</code> |  |
| [opts.connectTimeout] | <code>number</code> | <code>10000</code> |  |
| [opts.consecutivePingFailClose] | <code>number</code> | <code>4</code> |  |
| [opts.timeoutCloseCode] | <code>number</code> | <code>4100</code> |  |
| [opts.internalErrorCloseCode] | <code>number</code> | <code>4101</code> |  |
| [opts.jsonbird] | <code>object</code> |  | Options passed to the [JSONBird constructor](https://www.npmjs.com/package/jsonbird#new_JSONBird_new) |
| [opts.jsonbird.receiveErrorStack] | <code>boolean</code> | <code>false</code> |  |
| [opts.jsonbird.sendErrorStack] | <code>boolean</code> | <code>false</code> |  |
| [opts.jsonbird.firstRequestId] | <code>number</code> | <code>0</code> | The first request id to use |
| [opts.jsonbird.sessionId] | <code>string</code> | <code>&quot;randomString()&quot;</code> |  |
| [opts.jsonbird.endOfJSONWhitespace=] | <code>string</code> |  |  |
| [opts.jsonbird.endOnFinish] | <code>boolean</code> | <code>true</code> |  |
| [opts.jsonbird.finishOnEnd] | <code>boolean</code> | <code>true</code> |  |
| [opts.jsonbird.pingReceive] | <code>boolean</code> | <code>true</code> |  |
| [opts.jsonbird.pingMethod] | <code>string</code> | <code>&quot;&#x27;jsonbird.ping&#x27;&quot;</code> |  |
| [opts.jsonbird.pingInterval] | <code>number</code> | <code>2000</code> |  |
| [opts.jsonbird.pingTimeout] | <code>number</code> | <code>1000</code> |  |
| [opts.jsonbird.pingNow] | <code>number</code> | <code>Date.now</code> | Timer function used to figure out ping delays |
| [opts.jsonbird.setTimeout] | <code>function</code> | <code>global.setTimeout</code> |  |
| [opts.jsonbird.clearTimeout] | <code>function</code> | <code>global.clearTimeout</code> |  |

<a name="WebSocketClient+url"></a>

### webSocketClient.url
The URL to which to connect; this should be the URL to which the WebSocket server will respond.

**Kind**: instance property of [<code>WebSocketClient</code>](#WebSocketClient)  

| Param | Type |
| --- | --- |
| value | <code>string</code> | 

<a name="WebSocketClient+url"></a>

### webSocketClient.url ⇒ <code>string</code>
The URL to which to connect; this should be the URL to which the WebSocket server will respond.

**Kind**: instance property of [<code>WebSocketClient</code>](#WebSocketClient)  
<a name="WebSocketClient+reconnect"></a>

### webSocketClient.reconnect
If true, a new connection will be made (after a delay) if the connection closes for any reason (error, timeouts, explicit close)

**Kind**: instance property of [<code>WebSocketClient</code>](#WebSocketClient)  

| Param | Type |
| --- | --- |
| value | <code>boolean</code> | 

<a name="WebSocketClient+reconnect"></a>

### webSocketClient.reconnect ⇒ <code>boolean</code>
If `true`, a new connection will be made (after a delay) if the connection closes for any reason (error, timeouts, explicit close)

**Kind**: instance property of [<code>WebSocketClient</code>](#WebSocketClient)  
<a name="WebSocketClient+consecutivePingFailClose"></a>

### webSocketClient.consecutivePingFailClose
If this amount of pings fail consecutively, the connection will be automatically closed. If `reconnect` is `true` a new connection
will be established.

**Kind**: instance property of [<code>WebSocketClient</code>](#WebSocketClient)  

| Param | Type |
| --- | --- |
| value | <code>number</code> | 

<a name="WebSocketClient+consecutivePingFailClose"></a>

### webSocketClient.consecutivePingFailClose ⇒ <code>number</code>
If this amount of pings fail consecutively, the connection will be automatically closed. If `reconnect` is `true` a new connection
will be established.

**Kind**: instance property of [<code>WebSocketClient</code>](#WebSocketClient)  
<a name="WebSocketClient+connectTimeout"></a>

### webSocketClient.connectTimeout
Abort the connection if it takes longer than this many milliseconds to complete the connection attempt.
This is the maximum amount of time that we will wait for the WebSocket `readyState` to transition from `CONNECTING` to `OPEN`

**Kind**: instance property of [<code>WebSocketClient</code>](#WebSocketClient)  

| Param | Type | Description |
| --- | --- | --- |
| value | <code>number</code> | milliseconds |

<a name="WebSocketClient+connectTimeout"></a>

### webSocketClient.connectTimeout ⇒ <code>number</code>
Abort the connection if it takes longer than this many milliseconds to complete the connection attempt.
This is the maximum amount of time that we will wait for the WebSocket `readyState` to transition from `CONNECTING` to `OPEN`

**Kind**: instance property of [<code>WebSocketClient</code>](#WebSocketClient)  
**Returns**: <code>number</code> - milliseconds  
<a name="WebSocketClient+timeoutCloseCode"></a>

### webSocketClient.timeoutCloseCode
The close code to send to the server when the connection is going to be closed because of a timeout

**Kind**: instance property of [<code>WebSocketClient</code>](#WebSocketClient)  

| Param | Type | Description |
| --- | --- | --- |
| value | <code>number</code> | `1000` or in the range `3000` and `4999` inclusive |

<a name="WebSocketClient+timeoutCloseCode"></a>

### webSocketClient.timeoutCloseCode ⇒ <code>number</code>
The close code to send to the server when the connection is going to be closed because of a timeout

**Kind**: instance property of [<code>WebSocketClient</code>](#WebSocketClient)  
**Returns**: <code>number</code> - `1000` or integer in the range `3000` and `4999` inclusive  
<a name="WebSocketClient+internalErrorCloseCode"></a>

### webSocketClient.internalErrorCloseCode
The close code to send to the server when the connection is going to be closed because an `error` event was raised
by the node.js stream api or jsonbird.

**Kind**: instance property of [<code>WebSocketClient</code>](#WebSocketClient)  

| Param | Type | Description |
| --- | --- | --- |
| value | <code>number</code> | `1000` or in the range `3000` and `4999` inclusive |

<a name="WebSocketClient+internalErrorCloseCode"></a>

### webSocketClient.internalErrorCloseCode ⇒ <code>number</code>
The close code to send to the server when the connection is going to be closed because an `error` event was raised
by the node.js stream api or jsonbird.

**Kind**: instance property of [<code>WebSocketClient</code>](#WebSocketClient)  
**Returns**: <code>number</code> - `1000` or in the range `3000` and `4999` inclusive  
<a name="WebSocketClient+createConnectionCallback"></a>

### webSocketClient.createConnectionCallback
A callback which is called whenever this library wants to establish a new WebSocket connection.
The callback is called with a single argument, an object containing the following properties:

* "url" - The same value as `this.url`
* "WebSocket" - The WebSocket class provided by the NPM package "isomorphic-ws"... If this library
  is used with browserify/webpack this will be equal to `window.WebSocket`. Otherwise this value
  will be equal to the NPM "ws" package.

**Kind**: instance property of [<code>WebSocketClient</code>](#WebSocketClient)  

| Param | Type |
| --- | --- |
| value | <code>function</code> | 

<a name="WebSocketClient+createConnectionCallback"></a>

### webSocketClient.createConnectionCallback ⇒ <code>function</code>
A callback which is called whenever this library wants to establish a new WebSocket connection.
The callback is called with a single argument, an object containing the following properties:

* "url" - The same value as `this.url`
* "WebSocket" - The WebSocket class provided by the NPM package "isomorphic-ws"... If this library
  is used with browserify/webpack this will be equal to `window.WebSocket`. Otherwise this value
  will be equal to the NPM "ws" package.

**Kind**: instance property of [<code>WebSocketClient</code>](#WebSocketClient)  
<a name="WebSocketClient+reconnectDelayCallback"></a>

### webSocketClient.reconnectDelayCallback
A callback which is called after a failed connection to determine the delay before the next connection attempt.
The callback is called with a single argument, a number specifying the current `reconnectCounter`. This counter
is increased by `1` whenever a connection attempt fails, and it is slowly decreased while the connection is healthy

The reconnectCounter is always a value between `0` and `this.reconnectCounterMax` inclusive.
The callback must return the reconnect delay as a number in milliseconds.

**Kind**: instance property of [<code>WebSocketClient</code>](#WebSocketClient)  

| Param | Type |
| --- | --- |
| value | <code>function</code> | 

<a name="WebSocketClient+reconnectDelayCallback"></a>

### webSocketClient.reconnectDelayCallback ⇒ <code>function</code>
A callback which is called after a failed connection to determine the delay before the next connection attempt.
The callback is called with a single argument, a number specifying the current `reconnectCounter`. This counter
is increased by `1` whenever a connection attempt fails, and it is slowly decreased while the connection is healthy

The reconnectCounter is always a value between `0` and `this.reconnectCounterMax` inclusive.
The callback must return the reconnect delay as a number in milliseconds.

**Kind**: instance property of [<code>WebSocketClient</code>](#WebSocketClient)  
<a name="WebSocketClient+reconnectCounterMax"></a>

### webSocketClient.reconnectCounterMax
The maximum value for the `reconnectCounter` (see reconnectDelayCallback). This can be used to easily set a maximum reconnect delay.
For example if `reconnectCounterMax` is set to `8`, and `reconnectDelayCallback` is set to the default value, the highest reconnect
delay is: `2**8 * 100 * (Math.random() + 0.5)` = random between 12800 and 38400

**Kind**: instance property of [<code>WebSocketClient</code>](#WebSocketClient)  

| Param | Type |
| --- | --- |
| value | <code>number</code> | 

<a name="WebSocketClient+reconnectCounterMax"></a>

### webSocketClient.reconnectCounterMax ⇒ <code>number</code>
The maximum value for the `reconnectCounter` (see reconnectDelayCallback). This can be used to easily set a maximum reconnect delay.
For example if `reconnectCounterMax` is set to `8`, and `reconnectDelayCallback` is set to the default value, the highest reconnect
delay is: `2**8 * 100 * (Math.random() + 0.5)` = random between 12800 and 38400

**Kind**: instance property of [<code>WebSocketClient</code>](#WebSocketClient)  
<a name="WebSocketClient+receiveErrorStack"></a>

### webSocketClient.receiveErrorStack ⇒ <code>boolean</code>
If true and a remote method throws, attempt to read stack trace information from the JSON-RPC `error.data` property. This stack
trace information is then used to set the `fileName`, `lineNumber`, `columnNumber` and `stack` properties of our local `Error`
object (the Error object that the `.call()` function will reject with).

**Kind**: instance property of [<code>WebSocketClient</code>](#WebSocketClient)  
<a name="WebSocketClient+receiveErrorStack"></a>

### webSocketClient.receiveErrorStack
If true and a remote method throws, attempt to read stack trace information from the JSON-RPC `error.data` property. This stack
trace information is then used to set the `fileName`, `lineNumber`, `columnNumber` and `stack` properties of our local `Error`
object (the Error object that the `.call()` function will reject with).

**Kind**: instance property of [<code>WebSocketClient</code>](#WebSocketClient)  

| Param | Type |
| --- | --- |
| value | <code>boolean</code> | 

<a name="WebSocketClient+sendErrorStack"></a>

### webSocketClient.sendErrorStack ⇒ <code>boolean</code>
If true, the `fileName`, `lineNumber`, `columnNumber` and `stack` of an `Error` thrown during a method is sent to the client
using the JSON-RPC `error.data` property.

**Kind**: instance property of [<code>WebSocketClient</code>](#WebSocketClient)  
<a name="WebSocketClient+sendErrorStack"></a>

### webSocketClient.sendErrorStack
If true, the `fileName`, `lineNumber`, `columnNumber` and `stack` of an `Error` thrown during a method is sent to the client
using the JSON-RPC `error.data` property.

**Kind**: instance property of [<code>WebSocketClient</code>](#WebSocketClient)  

| Param | Type |
| --- | --- |
| value | <code>boolean</code> | 

<a name="WebSocketClient+defaultTimeout"></a>

### webSocketClient.defaultTimeout ⇒ <code>number</code>
The timeout to use for an outgoing method call unless a different timeout was explicitly specified to `call()`.

**Kind**: instance property of [<code>WebSocketClient</code>](#WebSocketClient)  
<a name="WebSocketClient+defaultTimeout"></a>

### webSocketClient.defaultTimeout
The timeout to use for an outgoing method call unless a different timeout was explicitly specified to `call()`.

**Kind**: instance property of [<code>WebSocketClient</code>](#WebSocketClient)  

| Param | Type |
| --- | --- |
| value | <code>number</code> | 

<a name="WebSocketClient+pingInterval"></a>

### webSocketClient.pingInterval ⇒ <code>number</code>
The time (in milliseconds) between each ping if `isSendingPings` is true.
This time is in addition to the time spent waiting for the previous ping to settle.

**Kind**: instance property of [<code>WebSocketClient</code>](#WebSocketClient)  
**Returns**: <code>number</code> - milliseconds  
<a name="WebSocketClient+pingInterval"></a>

### webSocketClient.pingInterval
The time (in milliseconds) between each ping if `isSendingPings` is true.
This time is in addition to the time spent waiting for the previous ping to settle.

**Kind**: instance property of [<code>WebSocketClient</code>](#WebSocketClient)  

| Param | Type | Description |
| --- | --- | --- |
| value | <code>number</code> | milliseconds |

<a name="WebSocketClient+pingTimeout"></a>

### webSocketClient.pingTimeout ⇒ <code>number</code>
The maximum amount of time (in milliseconds) to wait for a ping method call to resolve.

**Kind**: instance property of [<code>WebSocketClient</code>](#WebSocketClient)  
**Returns**: <code>number</code> - milliseconds  
<a name="WebSocketClient+pingTimeout"></a>

### webSocketClient.pingTimeout
The maximum amount of time (in milliseconds) to wait for a ping method call to resolve.

**Kind**: instance property of [<code>WebSocketClient</code>](#WebSocketClient)  

| Param | Type | Description |
| --- | --- | --- |
| value | <code>number</code> | milliseconds |

<a name="WebSocketClient+started"></a>

### webSocketClient.started ⇒ <code>boolean</code>
Returns `true` if this instance has been started. Which means that we are either setting up a connection, connected or waiting for a
reconnect.

**Kind**: instance property of [<code>WebSocketClient</code>](#WebSocketClient)  
<a name="WebSocketClient+hasActiveConnection"></a>

### webSocketClient.hasActiveConnection ⇒ <code>boolean</code>
Returns `true` if there is an active WebSocket connection, in which case all RPC calls will be flushed out immediately and at which
point we might receive RPC calls directed to us.
If this property returns `false`, all outgoing RPC calls will be queued until we have a connection again

**Kind**: instance property of [<code>WebSocketClient</code>](#WebSocketClient)  
<a name="WebSocketClient+method"></a>

### webSocketClient.method(name, func)
Registers a new method with the given name.

If the same method name is registered multiple times, earlier definitions will be overridden

**Kind**: instance method of [<code>WebSocketClient</code>](#WebSocketClient)  

| Param | Type | Description |
| --- | --- | --- |
| name | <code>string</code> | The method name |
| func | <code>function</code> |  |

<a name="WebSocketClient+methods"></a>

### webSocketClient.methods(objectOrMap)
Registers multiple methods using an object or Map.

Each key->value pair is registered as a method.
Values that are not a function are ignored.
The `this` object during a method call is set to the `objectOrMap` (unless a Map was used)

If the same method name is registered multiple times, earlier definitions will be overridden

**Kind**: instance method of [<code>WebSocketClient</code>](#WebSocketClient)  

| Param | Type |
| --- | --- |
| objectOrMap | <code>Object</code> \| <code>Map</code> | 

<a name="WebSocketClient+notification"></a>

### webSocketClient.notification(name, func)
Registers a notification with the given name.

A notification is a method for which the return value or thrown Error is ignored. A response object is never sent.

If the same method name is registered multiple times, all functions handlers will be called (in the same order as they were
registered)

**Kind**: instance method of [<code>WebSocketClient</code>](#WebSocketClient)  

| Param | Type | Description |
| --- | --- | --- |
| name | <code>string</code> | The method name |
| func | <code>function</code> |  |

<a name="WebSocketClient+notifications"></a>

### webSocketClient.notifications(objectOrMap)
Registers multiple notifications using an object or Map.

A notification is a method for which the return value or thrown Error is ignored. A response object is never sent.

If the same method name is registered multiple times, all functions handlers will be called (in the same order as they were
registered)

Each key->value pair is registered as a notification.
Values that are not a "function" are ignored.
The `this` object during a method call is set to the `objectOrMap` (unless a Map was used)

If the same method name is registered multiple times, earlier definitions will be overridden

**Kind**: instance method of [<code>WebSocketClient</code>](#WebSocketClient)  

| Param | Type |
| --- | --- |
| objectOrMap | <code>Object</code> \| <code>Map</code> | 

<a name="WebSocketClient+call"></a>

### webSocketClient.call(nameOrOptions, ...args) ⇒ <code>Promise</code>
Call a method on the remote instance, by sending a JSON-RPC request object to our write stream.

If no write stream has been set, the method call will be buffered until a write stream is set (setWriteStream).
Note: if a read stream is never set, any call() will also never resolve.

**Kind**: instance method of [<code>WebSocketClient</code>](#WebSocketClient)  
**Returns**: <code>Promise</code> - A Promise which will resole with the return value of the remote method  

| Param | Type | Description |
| --- | --- | --- |
| nameOrOptions | <code>string</code> \| <code>Object</code> | The method name or an options object |
| nameOrOptions.name | <code>string</code> | The method name |
| nameOrOptions.timeout | <code>number</code> | A maximum time (in milliseconds) to wait for a response. The returned promise will reject after this time. |
| ...args | <code>\*</code> |  |

<a name="WebSocketClient+bindCall"></a>

### webSocketClient.bindCall(nameOrOptions) ⇒ <code>function</code>
Returns a new function which calls the given method name by binding the function to this RPC instance and the given method name (or
options object).

For example:

```javascript
const subtract = rpc.bindCall('subtract');
subtract(10, 3).then(result => console.log(result)) // 7
```

**Kind**: instance method of [<code>WebSocketClient</code>](#WebSocketClient)  

| Param | Type | Description |
| --- | --- | --- |
| nameOrOptions | <code>string</code> \| <code>Object</code> | The method name or an options object |
| nameOrOptions.name | <code>string</code> | The method name |
| nameOrOptions.timeout | <code>number</code> | A maximum time (in milliseconds) to wait for a response. The returned promise will reject                 after this time. |

<a name="WebSocketClient+notify"></a>

### webSocketClient.notify(nameOrOptions, ...args) ⇒ <code>Promise</code>
Execute a notification on the remote instance, by sending a JSON-RPC request object to our write stream.

If no write stream has been set, the method call will be buffered until a write stream is set (setWriteStream).

This function resolves as soon as the request object has been buffered, but does not wait for the remote instance to have
actually received the request object.

**Kind**: instance method of [<code>WebSocketClient</code>](#WebSocketClient)  

| Param | Type | Description |
| --- | --- | --- |
| nameOrOptions | <code>string</code> \| <code>Object</code> | The method name or an options object |
| nameOrOptions.name | <code>string</code> | The method name |
| ...args | <code>\*</code> |  |

<a name="WebSocketClient+bindNotify"></a>

### webSocketClient.bindNotify(nameOrOptions) ⇒ <code>function</code>
Returns a new function which sends a notification with the given method name by binding the function to this RPC instance and the
given method name (or options object).

For example:

```javascript
const userDeleted = rpc.bindNotify('userDeleted');
userDeleted(123)
```

**Kind**: instance method of [<code>WebSocketClient</code>](#WebSocketClient)  

| Param | Type | Description |
| --- | --- | --- |
| nameOrOptions | <code>string</code> \| <code>Object</code> | The method name or an options object |
| nameOrOptions.name | <code>string</code> | The method name |
| nameOrOptions.timeout | <code>number</code> | A maximum time (in milliseconds) to wait for a response. The returned promise will reject                 after this time. |

<a name="WebSocketClient+start"></a>

### webSocketClient.start()
Establish the WebSocket connection, and automatically reconnect after an network error or timeout.

**Kind**: instance method of [<code>WebSocketClient</code>](#WebSocketClient)  
<a name="WebSocketClient+stop"></a>

### webSocketClient.stop(code, reason)
Close the active WebSocket connection, and stop reconnecting.
If there is no active connection the `code` and `reason` params are ignored.

**Kind**: instance method of [<code>WebSocketClient</code>](#WebSocketClient)  

| Param | Type | Default | Description |
| --- | --- | --- | --- |
| code | <code>number</code> |  | Must be equal to 1000 or in the range 3000 to 4999 inclusive |
| reason | <code>string</code> | <code>&quot;Normal Closure&quot;</code> | Must be 123 bytes or less (utf8) |

<a name="WebSocketClient+closeConnection"></a>

### webSocketClient.closeConnection(code, reason) ⇒ <code>boolean</code>
Close the active WebSocket connection and reconnect if reconnects are enabled.
If there is no active connection the `code` and `reason` params are ignored.

**Kind**: instance method of [<code>WebSocketClient</code>](#WebSocketClient)  

| Param | Type | Description |
| --- | --- | --- |
| code | <code>number</code> | Must be equal to 1000 or in the range 3000 to 4999 inclusive |
| reason | <code>string</code> | Must be 123 bytes or less (utf8) |

<a name="WebSocketClient+event_error"></a>

### "error" (error)
This event is fired if an uncaught error occurred

Most errors end up at the caller of our functions or at the remote peer, instead of this event.
Note that if you do not listen for this event on node.js, your process might exit.

**Kind**: event emitted by [<code>WebSocketClient</code>](#WebSocketClient)  

| Param | Type |
| --- | --- |
| error | <code>Error</code> | 

<a name="WebSocketClient+event_protocolError"></a>

### "protocolError" (error)
This event is fired if our peer sent us something that we were unable to parse.

These kind of errors do not end up at the 'error' event

**Kind**: event emitted by [<code>WebSocketClient</code>](#WebSocketClient)  

| Param | Type |
| --- | --- |
| error | <code>Error</code> | 

<a name="WebSocketClient+event_pingSuccess"></a>

### "pingSuccess" (delay)
The most recent ping sent to our peer succeeded

**Kind**: event emitted by [<code>WebSocketClient</code>](#WebSocketClient)  

| Param | Type | Description |
| --- | --- | --- |
| delay | <code>number</code> | How long the ping took to resolve (in milliseconds) |

<a name="WebSocketClient+event_pingFail"></a>

### "pingFail" (consecutiveFails, error)
The most recent ping sent to our peer timed out or resulted in an error

**Kind**: event emitted by [<code>WebSocketClient</code>](#WebSocketClient)  

| Param | Type | Description |
| --- | --- | --- |
| consecutiveFails | <code>number</code> | The amount of consecutive pings that failed |
| error | <code>Error</code> |  |

<a name="WebSocketClient+event_webSocketConnecting"></a>

### "webSocketConnecting"
The WebSocket connection is being established but is not yet open.

**Kind**: event emitted by [<code>WebSocketClient</code>](#WebSocketClient)  
<a name="WebSocketClient+event_webSocketOpen"></a>

### "webSocketOpen"
The WebSocket connection is now open and all pending RPC calls will be flushed to the server

**Kind**: event emitted by [<code>WebSocketClient</code>](#WebSocketClient)  
<a name="WebSocketClient+event_webSocketError"></a>

### "webSocketError" (error)
The WebSocket API raised an error.

**Kind**: event emitted by [<code>WebSocketClient</code>](#WebSocketClient)  

| Param | Type | Description |
| --- | --- | --- |
| error | <code>window.Event</code> \| <code>ws.ErrorEvent</code> | When running in node.js this contains an ErrorEvent from the "ws" library, interesting        properties include `message` (string) and `error` (Error)        However when run in a browser, this will contain a plain `Event` without any useful error information. |

<a name="WebSocketClient+event_webSocketClose"></a>

### "webSocketClose"
The WebSocket connection has been (half) closed by either side.

**Kind**: event emitted by [<code>WebSocketClient</code>](#WebSocketClient)  

| Type |
| --- |
| <code>Object</code> | 

<a name="WebSocketClient+event_webSocketClose"></a>

### "webSocketClose" (info)
This event is fired if the WebSocket connection has been closed.
A new connection might be established after this event if the `reconnect` option is enabled.

**Kind**: event emitted by [<code>WebSocketClient</code>](#WebSocketClient)  

| Param | Type |
| --- | --- |
| info | <code>Object</code> | 

**Example**  
```js
rpc = new WebSocketClient(...);
rpc.on('webSocketClose', ({code, reason}) => {
  if (reason === closeCodes.POLICY_VIOLATION) {
    rpc.stop(); // stop reconnecting
  }
});
```
