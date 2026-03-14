"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addOrderPayment = exports.createOrderFromCart = void 0;
const payment_sdk_1 = require("../../payment-sdk");
const apiClient = payment_sdk_1.paymentSDK.ctAPI.client;
const createOrderFromCart = async (cart) => {
    const latestCart = await payment_sdk_1.paymentSDK.ctCartService.getCart({ id: cart.id });
    const res = await apiClient
        .orders()
        .post({
        body: {
            cart: {
                id: cart.id,
                typeId: 'cart',
            },
            shipmentState: 'Pending',
            orderState: 'Open',
            version: latestCart.version,
            paymentState: 'Paid',
        },
    })
        .execute();
    return res.body;
};
exports.createOrderFromCart = createOrderFromCart;
const addOrderPayment = async (order, paymentId) => {
    const response = await apiClient
        .orders()
        .withId({ ID: order.id })
        .post({
        body: {
            version: order.version,
            actions: [
                {
                    action: 'addPayment',
                    payment: {
                        id: paymentId,
                        typeId: 'payment',
                    },
                },
            ],
        },
    })
        .execute();
    return response.body;
};
exports.addOrderPayment = addOrderPayment;
