'use strict';
const sinon = require('sinon');
const {EventEmitter} = require('events');

const readyState = require('../../lib/readyState');
const Wait = require('./Wait');

const WS_MOCK_STATE = Symbol();

class WebSocketMock {
    constructor() {
        const wsMockState = this[WS_MOCK_STATE] = {
            mockEvents: new EventEmitter(),
            waitForSend: new Wait(),
            open: () => {
                this.readyState = readyState.OPEN;
                wsMockState.mockEvents.emit('open');
            },
            close: (code, reason) => {
                this.readyState = readyState.CLOSED;
                wsMockState.mockEvents.emit('close', {
                    type: 'close',
                    wasClean: true,
                    code,
                    reason,
                });
            },
        };
        wsMockState.mockEvents.on('error', () => {}); // do not crash for errors during unit tests
        this.close = sinon.spy();
        this.send = sinon.spy(() => wsMockState.waitForSend.advance());
        this.addEventListener = sinon.spy((name, func) => {
            wsMockState.mockEvents.on(name, func);
        });
        this.binaryType = 'DEFAULT';
        this.readyState = 0;
        Object.seal(this);
    }
}

const webSocketClientMock = () => {
    return sinon.spy(() => new WebSocketMock());
};

module.exports = {webSocketClientMock, WS_MOCK_STATE};
