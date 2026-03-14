"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeShippingRate = exports.updateShippingRate = exports.updateShippingAddress = exports.getShippingMethodsFromCart = void 0;
const payment_sdk_1 = require("../../payment-sdk");
const cart_client_1 = require("./cart-client");
const apiClient = payment_sdk_1.paymentSDK.ctAPI.client;
const getShippingMethodsFromCart = async (cart) => {
    const response = await apiClient
        .shippingMethods()
        .matchingCart()
        .get({
        queryArgs: {
            cartId: cart.id,
        },
    })
        .execute();
    return response.body;
};
exports.getShippingMethodsFromCart = getShippingMethodsFromCart;
const updateShippingAddress = async (cart, address) => {
    try {
        const actions = [
            {
                action: 'setShippingAddress',
                address: {
                    country: address.country,
                    state: address.state,
                    city: address.city,
                    streetName: address.streetName,
                    streetNumber: address.streetNumber,
                    postalCode: address.postalCode,
                    additionalStreetInfo: address.additionalStreetInfo,
                    region: address.region,
                },
            },
        ];
        return await (0, cart_client_1.updateCartById)(cart, actions);
    }
    catch (error) {
        console.error(`Error updating shipping address: ${error}`);
        throw error;
    }
};
exports.updateShippingAddress = updateShippingAddress;
const updateShippingRate = async (cart, shippingRateId) => {
    try {
        const actions = [
            {
                action: 'setShippingMethod',
                shippingMethod: {
                    typeId: 'shipping-method',
                    id: shippingRateId,
                },
            },
        ];
        return await (0, cart_client_1.updateCartById)(cart, actions);
    }
    catch (error) {
        console.error(`Error updating shipping rate: ${error}`);
        throw error;
    }
};
exports.updateShippingRate = updateShippingRate;
const removeShippingRate = async (cart) => {
    try {
        const actions = [
            {
                action: 'setShippingMethod',
            },
        ];
        return await (0, cart_client_1.updateCartById)(cart, actions);
    }
    catch (error) {
        console.error(`Error updating shipping rate: ${error}`);
        throw error;
    }
};
exports.removeShippingRate = removeShippingRate;
