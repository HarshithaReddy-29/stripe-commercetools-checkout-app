"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_plugin_1 = __importDefault(require("fastify-plugin"));
const payment_sdk_1 = require("../../payment-sdk");
const operation_route_1 = require("../../routes/operation.route");
const app_1 = require("../app");
async function operationPlugin(server) {
    await server.register(operation_route_1.operationsRoute, {
        prefix: '/operations',
        paymentService: app_1.app.services.paymentService,
        jwtAuthHook: payment_sdk_1.paymentSDK.jwtAuthHookFn,
        oauth2AuthHook: payment_sdk_1.paymentSDK.oauth2AuthHookFn,
        sessionHeaderAuthHook: payment_sdk_1.paymentSDK.sessionHeaderAuthHookFn,
        authorizationHook: payment_sdk_1.paymentSDK.authorityAuthorizationHookFn,
    });
}
exports.default = (0, fastify_plugin_1.default)(operationPlugin);
