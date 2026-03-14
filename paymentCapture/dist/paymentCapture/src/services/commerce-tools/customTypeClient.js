"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTypeByKey = getTypeByKey;
exports.getTypesByResourceTypeId = getTypesByResourceTypeId;
exports.createCustomType = createCustomType;
exports.updateCustomTypeByKey = updateCustomTypeByKey;
exports.deleteCustomTypeByKey = deleteCustomTypeByKey;
const payment_sdk_1 = require("../../payment-sdk");
const apiClient = payment_sdk_1.paymentSDK.ctAPI.client;
async function getTypeByKey(key) {
    const res = await apiClient
        .types()
        .get({ queryArgs: { where: `key="${key}"` } })
        .execute();
    return res.body.results[0] || undefined;
}
async function getTypesByResourceTypeId(resourceTypeId) {
    const res = await apiClient
        .types()
        .get({
        queryArgs: {
            where: `resourceTypeIds contains any ("${resourceTypeId}")`,
        },
    })
        .execute();
    return res.body.results;
}
async function createCustomType(customType) {
    const res = await apiClient.types().post({ body: customType }).execute();
    return res.body.id;
}
async function updateCustomTypeByKey({ key, version, actions, }) {
    await apiClient.types().withKey({ key }).post({ body: { version, actions } }).execute();
}
async function deleteCustomTypeByKey({ key, version }) {
    await apiClient
        .types()
        .withKey({ key })
        .delete({
        queryArgs: { version },
    })
        .execute();
}
