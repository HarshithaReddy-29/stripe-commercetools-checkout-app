"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleRequest = handleRequest;
exports.createLaunchpadPurchaseOrderNumberCustomType = createLaunchpadPurchaseOrderNumberCustomType;
exports.retrieveWebhookEndpoint = retrieveWebhookEndpoint;
exports.updateWebhookEndpoint = updateWebhookEndpoint;
exports.createOrUpdateCustomerCustomType = createOrUpdateCustomerCustomType;
exports.createLineItemCustomType = createLineItemCustomType;
exports.removeLineItemCustomType = removeLineItemCustomType;
exports.removeCustomerCustomType = removeCustomerCustomType;
exports.createProductTypeSubscription = createProductTypeSubscription;
exports.removeProductTypeSubscription = removeProductTypeSubscription;
const custom_types_1 = require("../custom-types/custom-types");
const logger_1 = require("../libs/logger");
const stripe_client_1 = require("../clients/stripe.client");
const customTypeHelper_1 = require("../services/commerce-tools/customTypeHelper");
const productTypeClient_1 = require("../services/commerce-tools/productTypeClient");
const customTypeClient_1 = require("../services/commerce-tools/customTypeClient");
async function handleRequest({ loggerId, startMessage, throwError = true, fn, }) {
    try {
        logger_1.log.info(`${loggerId} ${startMessage}`);
        fn();
    }
    catch (error) {
        logger_1.log.error(loggerId, error);
        if (throwError) {
            throw error;
        }
    }
}
async function createLaunchpadPurchaseOrderNumberCustomType() {
    const getRes = await (0, customTypeClient_1.getTypeByKey)(custom_types_1.launchpadPurchaseOrderCustomType.key);
    if (getRes) {
        logger_1.log.info('Launchpad purchase order number custom type already exists. Skipping creation.');
    }
}
async function retrieveWebhookEndpoint(weId) {
    logger_1.log.info(`[RETRIEVE_WEBHOOK_ENDPOINT] Starting the process for retrieving webhook endpoint[${weId}].`);
    try {
        return await (0, stripe_client_1.stripeApi)().webhookEndpoints.retrieve(weId);
    }
    catch (error) {
        logger_1.log.error('[RETRIEVE_WEBHOOK_ENDPOINT]', error);
    }
}
async function updateWebhookEndpoint(weId, weAppUrl) {
    logger_1.log.info(`[UPDATE_WEBHOOK_ENDPOINT] Starting the process for updating webhook endpoint[${weId}] with url[${weAppUrl}].`);
    try {
        await (0, stripe_client_1.stripeApi)().webhookEndpoints.update(weId, {
            enabled_events: [
                'charge.succeeded',
                'charge.updated',
                'payment_intent.succeeded',
                'charge.refunded',
                'payment_intent.canceled',
                'payment_intent.payment_failed',
                'payment_intent.requires_action',
            ],
            url: weAppUrl,
        });
    }
    catch (error) {
        logger_1.log.error('[UPDATE_WEBHOOK_ENDPOINT]', error);
    }
}
async function createOrUpdateCustomerCustomType() {
    await handleRequest({
        loggerId: '[CREATE_CUSTOMER_CUSTOM_TYPE]',
        startMessage: 'Starting the process for creating "Customer" Custom Type.',
        fn: async () => await (0, customTypeHelper_1.addOrUpdateCustomType)(custom_types_1.stripeCustomerIdCustomType),
    });
}
async function createLineItemCustomType() {
    await handleRequest({
        loggerId: '[CREATE_LINE_ITEM_CUSTOM_TYPE]',
        startMessage: 'Starting the process for creating "Line Item" Custom Type.',
        fn: async () => await (0, customTypeHelper_1.addOrUpdateCustomType)(custom_types_1.typeLineItem),
    });
}
async function removeLineItemCustomType() {
    await handleRequest({
        loggerId: '[REMOVE_LINE_ITEM_CUSTOM_TYPE]',
        startMessage: 'Starting the process for removing "Line Item" Custom Type.',
        fn: async () => await (0, customTypeHelper_1.deleteOrUpdateCustomType)(custom_types_1.typeLineItem),
    });
}
async function removeCustomerCustomType() {
    await handleRequest({
        loggerId: '[REMOVE_CUSTOMER_CUSTOM_TYPE]',
        startMessage: 'Starting the process for removing "Customer" Custom Type.',
        fn: async () => {
            await (0, customTypeHelper_1.deleteOrUpdateCustomType)(custom_types_1.stripeCustomerIdCustomType);
        },
    });
}
async function createProductTypeSubscription() {
    await handleRequest({
        loggerId: '[CREATE_PRODUCT_TYPE_SUBSCRIPTION]',
        startMessage: 'Starting the process for creating Product Type "Subscription".',
        fn: async () => {
            const productType = await (0, productTypeClient_1.getProductTypeByKey)(custom_types_1.productTypeSubscription.key);
            if (productType) {
                logger_1.log.info('Product type subscription already exists. Skipping creation.');
            }
            else {
                const newProductType = await (0, productTypeClient_1.createProductType)(custom_types_1.productTypeSubscription);
                logger_1.log.info(`Product Type "${newProductType.key}" created successfully.`);
            }
        },
    });
}
async function removeProductTypeSubscription() {
    await handleRequest({
        loggerId: '[REMOVE_PRODUCT_TYPE_SUBSCRIPTION]',
        startMessage: 'Starting the process for removing Product Type "Subscription".',
        fn: async () => {
            const productTypeKey = custom_types_1.productTypeSubscription.key;
            const productType = await (0, productTypeClient_1.getProductTypeByKey)(productTypeKey);
            if (!productType) {
                logger_1.log.info(`Product Type "${productTypeKey}" is already deleted. Skipping deletion.`);
                return;
            }
            const products = await (0, productTypeClient_1.getProductsByProductTypeId)(productType?.id);
            if (products.length) {
                logger_1.log.warn(`Product Type "${productTypeKey}" is in use. Skipping deletion.`);
            }
            else {
                await (0, productTypeClient_1.deleteProductType)({ key: productTypeKey, version: productType.version });
                logger_1.log.info(`Product Type "${productTypeKey}" deleted successfully.`);
            }
        },
    });
}
