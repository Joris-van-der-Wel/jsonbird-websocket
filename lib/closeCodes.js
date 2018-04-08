'use strict';

/**
 * 1000 indicates a normal closure, meaning that the purpose for which the connection was established has
 * been fulfilled.
 * @type {number}
 */
const NORMAL = 1000;

/**
 * 1001 indicates that an endpoint is "going away", such as a server going down or a browser having
 * navigated away from a page.
 * @type {number}
 */
const GOING_AWAY = 1001;

/**
 * 1002 indicates that an endpoint is terminating the connection due to a protocol error.
 * @type {number}
 */
const PROTOCOL_ERROR = 1002;

/**
 * 1003 indicates that an endpoint is terminating the connection because it has received a type of data it cannot accept (e.g., an
 * endpoint that understands only text data MAY send this if it receives a binary message).
 * @type {number}
 */
const UNSUPPORTED_DATA = 1003;

// 1004 is reserved
// 1005 and 1006 may be used as internal status codes, but it must never be sent over the connection

/**
 * 1007 indicates that an endpoint is terminating the connection because it has received data within a message that was not
 * consistent with the type of the message (e.g., non-UTF-8 [RFC3629] data within a text message).
 * @type {number}
 */
const INVALID_PAYLOAD_DATA = 1007;

/**
 * 1008 indicates that an endpoint is terminating the connection because it has received a message that violates its policy.  This
 * is a generic status code that can be returned when there is no other more suitable status code (e.g., 1003 or 1009) or if there
 * is a need to hide specific details about the policy.
 * @type {number}
 */
const POLICY_VIOLATION = 1008;

/**
 * 1009 indicates that an endpoint is terminating the connection because it has received a message that is too big for it to process.
 * @type {number}
 */
const MESSAGE_TOO_BIG = 1009;

/**
 * 1010 indicates that an endpoint (client) is terminating the connection because it has expected the server to negotiate one or
 * more extension, but the server didn't return them in the response message of the WebSocket handshake.  The list of extensions that
 * are needed SHOULD appear in the /reason/ part of the Close frame. Note that this status code is not used by the server, because it
 * can fail the WebSocket handshake instead.
 * @type {number}
 */
const MANDATORY_EXTENSION = 1010;

/**
 * 1011 indicates that a server is terminating the connection because it encountered an unexpected condition that prevented it from
 * fulfilling the request
 * @type {number}
 */
const INTERNAL_ERROR = 1011;

/**
 *
 * @type {number}
 */
const SERVICE_RESTART = 1012;

/**
 *
 * @type {number}
 */
const TRY_AGAIN_LATER = 1013;

// also, 4000-4999 is for private use

module.exports = Object.freeze({
    NORMAL,
    GOING_AWAY,
    PROTOCOL_ERROR,
    UNSUPPORTED_DATA,
    INVALID_PAYLOAD_DATA,
    POLICY_VIOLATION,
    MESSAGE_TOO_BIG,
    MANDATORY_EXTENSION,
    INTERNAL_ERROR,
    SERVICE_RESTART,
    TRY_AGAIN_LATER,
});
