"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isCartFrozen = exports.unfreezeCart = exports.freezeCart = exports.createCartWithProduct = exports.updateCartById = exports.getCartExpanded = exports.createCartFromDraft = void 0;
const payment_sdk_1 = require("../../payment-sdk");
const context_1 = require("../../libs/fastify/context/context");
const logger_1 = require("../../libs/logger");
const custom_types_1 = require("../../custom-types/custom-types");
const apiClient = payment_sdk_1.paymentSDK.ctAPI.client;
/**
 * Creates a new cart in commercetools using the provided cart draft.
 * @param cartDraft - The draft object containing cart details
 * @returns A promise that resolves to the created Cart object.
 */
const createCartFromDraft = async (cartDraft) => {
    const cartResponse = await apiClient
        .carts()
        .post({
        body: cartDraft,
    })
        .execute();
    return cartResponse.body;
};
exports.createCartFromDraft = createCartFromDraft;
/**
 * Retrieves a cart by ID and expands related resources.
 * @param id - The cart ID. If not provided, retrieves it from context.
 * @returns A promise that resolves to the expanded Cart object.
 */
const getCartExpanded = async (id) => {
    const cart = await apiClient
        .carts()
        .withId({ ID: id ?? (0, context_1.getCartIdFromContext)() })
        .get({
        queryArgs: {
            expand: ['lineItems[*].productType', 'discountCodes[*].discountCode.cartDiscounts[*]'],
        },
    })
        .execute();
    return cart.body;
};
exports.getCartExpanded = getCartExpanded;
/**
 * Updates a cart by its ID with the specified update actions.
 * @param cart - The cart object to update.
 * @param actions - Array of update actions to apply.
 * @returns A promise that resolves to the updated Cart object.
 */
const updateCartById = async (cart, actions) => {
    const updatedCart = await apiClient
        .carts()
        .withId({ ID: cart.id })
        .post({
        body: {
            version: cart.version,
            actions,
        },
    })
        .execute();
    return updatedCart.body;
};
exports.updateCartById = updateCartById;
/**
 * Creates a cart with the specified product variant and price
 * @param product - The commercetools product
 * @param variant - The specific variant to add
 * @param price - The price information
 * @param priceId - The commercetools price ID
 * @param subscriptionId - The Stripe subscription ID
 * @returns A cart with the product added
 */
const createCartWithProduct = async (product, variant, price, priceId, subscriptionId, quantity) => {
    try {
        // Create cart draft using the same pattern as createNewCartFromOrder
        const cartDraft = {
            currency: price.currencyCode,
        };
        // Create the cart
        const cartResponse = await apiClient
            .carts()
            .post({
            body: cartDraft,
        })
            .execute();
        let cart = cartResponse.body;
        const lineItemActions = [
            {
                action: 'addLineItem',
                productId: product.id,
                variantId: variant.id,
                quantity: quantity,
                custom: {
                    type: {
                        typeId: 'type',
                        key: custom_types_1.typeLineItem.key,
                    },
                    fields: {
                        [custom_types_1.lineItemStripeSubscriptionIdField]: subscriptionId,
                    },
                },
            },
        ];
        // Update cart with line item using the same pattern as createNewCartFromOrder
        cart = await (0, exports.updateCartById)(cart, lineItemActions);
        // Get the expanded cart to ensure all data is loaded
        cart = await (0, exports.getCartExpanded)(cart.id);
        logger_1.log.info('Cart created with product', {
            cartId: cart.id,
            productId: product.id,
            variantId: variant.id,
            priceId: priceId,
            currency: price.currencyCode,
        });
        return cart;
    }
    catch (error) {
        logger_1.log.error('Error creating cart with product', { error, productId: product.id, variantId: variant.id });
        throw error;
    }
};
exports.createCartWithProduct = createCartWithProduct;
/**
 * Freezes a cart to prevent modifications (products, quantities, discounts, addresses, shipping).
 * @param cart - The cart object to freeze.
 * @returns A promise that resolves to the frozen Cart object.
 */
const freezeCart = async (cart) => {
    const actions = [
        {
            action: 'freezeCart',
        },
    ];
    return await (0, exports.updateCartById)(cart, actions);
};
exports.freezeCart = freezeCart;
/**
 * Unfreezes a cart to allow modifications again.
 * @param cart - The cart object to unfreeze.
 * @returns A promise that resolves to the unfrozen Cart object.
 */
const unfreezeCart = async (cart) => {
    const actions = [
        {
            action: 'unfreezeCart',
        },
    ];
    return await (0, exports.updateCartById)(cart, actions);
};
exports.unfreezeCart = unfreezeCart;
/**
 * Checks if a cart is frozen.
 * @param cart - The cart object to check.
 * @returns True if the cart is frozen, false otherwise.
 */
const isCartFrozen = (cart) => {
    return 'frozen' in cart && cart.frozen === true;
};
exports.isCartFrozen = isCartFrozen;
