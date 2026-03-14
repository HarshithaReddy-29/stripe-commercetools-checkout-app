"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateCustomerById = updateCustomerById;
const payment_sdk_1 = require("../../payment-sdk");
const apiClient = payment_sdk_1.paymentSDK.ctAPI.client;
async function updateCustomerById({ id, version, actions, }) {
    const response = await apiClient.customers().withId({ ID: id }).post({ body: { version, actions } }).execute();
    return response.body;
}
