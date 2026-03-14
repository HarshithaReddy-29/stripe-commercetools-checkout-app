import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { paymentSDK } from '../../payment-sdk';
import { operationsRoute } from '../../routes/operation.route';
import { app } from '../app';
 
async function operationPlugin(server: FastifyInstance) {
  await server.register(operationsRoute, {
    prefix: '/operations',
    paymentService: app.services.paymentService,
    jwtAuthHook: paymentSDK.jwtAuthHookFn,
    oauth2AuthHook: paymentSDK.oauth2AuthHookFn,
    sessionHeaderAuthHook: paymentSDK.sessionHeaderAuthHookFn,
    authorizationHook: paymentSDK.authorityAuthorizationHookFn,
  });
}
 
export default fp(operationPlugin);