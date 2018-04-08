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
