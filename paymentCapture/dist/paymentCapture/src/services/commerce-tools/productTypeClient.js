"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getProductTypeByKey = getProductTypeByKey;
exports.getProductsByProductTypeId = getProductsByProductTypeId;
exports.deleteProductType = deleteProductType;
exports.createProductType = createProductType;
const payment_sdk_1 = require("../../payment-sdk");
const apiClient = payment_sdk_1.paymentSDK.ctAPI.client;
async function getProductTypeByKey(key) {
    const res = await apiClient
        .productTypes()
        .get({ queryArgs: { where: `key="${key}"` } })
        .execute();
    return res.body.results[0] || undefined;
}
async function getProductsByProductTypeId(productTypeId, limit = 1) {
    const res = await apiClient
        .products()
        .get({ queryArgs: { where: `productType(id="${productTypeId}")`, limit } })
        .execute();
    return res.body.results;
}
async function deleteProductType({ key, version }) {
    await apiClient.productTypes().withKey({ key }).delete({ queryArgs: { version } }).execute();
}
async function createProductType(body) {
    const newProductType = await apiClient.productTypes().post({ body }).execute();
    return newProductType.body;
}
