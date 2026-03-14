"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupFastify = void 0;
const autoload_1 = __importDefault(require("@fastify/autoload"));
const cors_1 = __importDefault(require("@fastify/cors"));
const formbody_1 = __importDefault(require("@fastify/formbody"));
const fastify_1 = __importDefault(require("fastify"));
const node_crypto_1 = require("node:crypto");
const path_1 = require("path");
const config_1 = require("../config/config");
const context_1 = require("../libs/fastify/context/context");
const error_handler_1 = require("../libs/fastify/error-handler");
const rawBody = Promise.resolve().then(() => __importStar(require('fastify-raw-body')));
/**
 * Setup Fastify server instance
 * @returns
 */
const setupFastify = async () => {
    // Create fastify server instance
    const server = (0, fastify_1.default)({
        logger: {
            level: config_1.config.loggerLevel,
        },
        genReqId: () => (0, node_crypto_1.randomUUID)().toString(),
        requestIdLogLabel: 'requestId',
        requestIdHeader: 'x-request-id',
    });
    // Config raw body for webhooks routes
    await server.register(rawBody, {
        field: 'rawBody', // change the default request.rawBody property name
        global: false, // add the rawBody to every request. **Default true**
        encoding: false, // set it to false to set rawBody as a Buffer **Default utf8**
        runFirst: true, // get the body before any preParsing hook change/uncompress it. **Default false**
        routes: [
            '/stripe/webhooks/us',
            '/stripe/webhooks/ca',
            '/stripe/webhooks/eu',
        ], // array of routes, **`global`** will be ignored, wildcard routes not supported
    });
    // Setup error handler
    server.setErrorHandler(error_handler_1.errorHandler);
    // Enable CORS
    await server.register(cors_1.default, {
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID', 'X-Request-ID', 'X-Session-ID'],
        origin: '*',
    });
    // Add content type parser for the content type application/x-www-form-urlencoded
    await server.register(formbody_1.default);
    // Register context plugin
    await server.register(context_1.requestContextPlugin);
    await server.register(autoload_1.default, {
        dir: (0, path_1.join)(__dirname, 'plugins'),
    });
    return server;
};
exports.setupFastify = setupFastify;
