"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestContextPlugin = exports.getMerchantReturnUrlFromContext = exports.getProcessorUrlFromContext = exports.getCheckoutTransactionItemIdFromContext = exports.getPaymentInterfaceFromContext = exports.getAllowedPaymentMethodsFromContext = exports.getCartIdFromContext = exports.getCtSessionIdFromContext = exports.updateRequestContext = exports.setRequestContext = exports.getRequestContext = void 0;
const request_context_1 = require("@fastify/request-context");
const crypto_1 = require("crypto");
const fastify_plugin_1 = __importDefault(require("fastify-plugin"));
const getRequestContext = () => {
    return request_context_1.requestContext.get('request') ?? {};
};
exports.getRequestContext = getRequestContext;
const setRequestContext = (ctx) => {
    request_context_1.requestContext.set('request', ctx);
};
exports.setRequestContext = setRequestContext;
const updateRequestContext = (ctx) => {
    const currentContext = (0, exports.getRequestContext)();
    (0, exports.setRequestContext)({
        ...currentContext,
        ...ctx,
    });
};
exports.updateRequestContext = updateRequestContext;
const getCtSessionIdFromContext = () => {
    const authentication = (0, exports.getRequestContext)().authentication;
    return authentication?.getCredentials();
};
exports.getCtSessionIdFromContext = getCtSessionIdFromContext;
const getCartIdFromContext = () => {
    const authentication = (0, exports.getRequestContext)().authentication;
    return authentication?.getPrincipal().cartId;
};
exports.getCartIdFromContext = getCartIdFromContext;
const getAllowedPaymentMethodsFromContext = () => {
    const authentication = (0, exports.getRequestContext)().authentication;
    return authentication?.getPrincipal().allowedPaymentMethods;
};
exports.getAllowedPaymentMethodsFromContext = getAllowedPaymentMethodsFromContext;
const getPaymentInterfaceFromContext = () => {
    const authentication = (0, exports.getRequestContext)().authentication;
    return authentication?.getPrincipal().paymentInterface;
};
exports.getPaymentInterfaceFromContext = getPaymentInterfaceFromContext;
const getCheckoutTransactionItemIdFromContext = () => {
    const authentication = (0, exports.getRequestContext)().authentication;
    return authentication?.getPrincipal().checkoutTransactionItemId;
};
exports.getCheckoutTransactionItemIdFromContext = getCheckoutTransactionItemIdFromContext;
const getProcessorUrlFromContext = () => {
    const authentication = (0, exports.getRequestContext)().authentication;
    return authentication?.getPrincipal().processorUrl;
};
exports.getProcessorUrlFromContext = getProcessorUrlFromContext;
const getMerchantReturnUrlFromContext = () => {
    const authentication = (0, exports.getRequestContext)().authentication;
    return authentication?.getPrincipal().merchantReturnUrl;
};
exports.getMerchantReturnUrlFromContext = getMerchantReturnUrlFromContext;
exports.requestContextPlugin = (0, fastify_plugin_1.default)(async (fastify) => {
    // Enhance the request object with a correlationId property
    fastify.decorateRequest('correlationId', '');
    // Propagate the correlationId from the request header to the request object
    fastify.addHook('onRequest', (req, reply, done) => {
        req.correlationId = req.headers['x-correlation-id'] ? req.headers['x-correlation-id'] : undefined;
        done();
    });
    // Register the request context
    await fastify.register(request_context_1.fastifyRequestContext, {
        defaultStoreValues: (req) => ({
            request: {
                path: req.url,
                pathTemplate: req.routeOptions.url,
                pathParams: req.params,
                query: req.query,
                correlationId: req.correlationId || (0, crypto_1.randomUUID)().toString(),
                requestId: req.id,
            },
        }),
        hook: 'onRequest',
    });
});
