/**
 * Request Logger Middleware
 *
 * Assigns a unique request ID to every incoming request and logs
 * the request/response cycle with Winston. The request ID is also
 * attached to error responses for tracing.
 */

const { v4: uuidv4 } = require('uuid');
const morgan = require('morgan');
const logger = require('../utils/logger');

/**
 * Attach a unique request ID to every request.
 * Downstream code can access it via req.requestId.
 */
function attachRequestId(req, res, next) {
    req.requestId = req.headers['x-request-id'] || uuidv4();
    res.set('X-Request-ID', req.requestId);
    next();
}

/**
 * Morgan HTTP logger that pipes output through Winston.
 */
const httpLogger = morgan(
    (tokens, req, res) => {
        return JSON.stringify({
            requestId: req.requestId,
            method: tokens.method(req, res),
            url: tokens.url(req, res),
            status: tokens.status(req, res),
            responseTimeMs: tokens['response-time'](req, res),
            contentLength: tokens.res(req, res, 'content-length'),
            userAgent: tokens['user-agent'](req, res),
            ip: req.ip,
            userId: req.user?.userId || 'anonymous',
        });
    },
    {
        stream: {
            write(message) {
                try {
                    const data = JSON.parse(message);
                    const level = parseInt(data.status) >= 400 ? 'warn' : 'info';
                    logger[level]('HTTP Request', data);
                } catch {
                    logger.info(message.trim());
                }
            },
        },
    }
);

module.exports = { attachRequestId, httpLogger };
