"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPostDeployScripts = runPostDeployScripts;
const dotenv = __importStar(require("dotenv"));
dotenv.config();
const actions_1 = require("./actions");
const STRIPE_WEBHOOKS_ROUTE = 'stripe/webhooks';
const CONNECT_SERVICE_URL = 'CONNECT_SERVICE_URL';
const STRIPE_WEBHOOK_ID = 'STRIPE_WEBHOOK_ID';
const msgError = 'Post-deploy failed:';
async function postDeploy(properties) {
    await (0, actions_1.createLaunchpadPurchaseOrderNumberCustomType)();
    const applicationUrl = properties.get(CONNECT_SERVICE_URL);
    const stripeWebhookId = properties.get(STRIPE_WEBHOOK_ID) ?? '';
    if (properties) {
        if (stripeWebhookId === '') {
            process.stderr.write(`${msgError} STRIPE_WEBHOOK_ID var is not assigned. Add the connector URL manually on the Stripe Webhook Dashboard\n`);
        }
        else {
            const we = await (0, actions_1.retrieveWebhookEndpoint)(stripeWebhookId);
            const weAppUrl = `${applicationUrl}${STRIPE_WEBHOOKS_ROUTE}`;
            if (we?.url !== weAppUrl) {
                await (0, actions_1.updateWebhookEndpoint)(stripeWebhookId, weAppUrl);
            }
        }
    }
    await (0, actions_1.createOrUpdateCustomerCustomType)();
}
async function runPostDeployScripts() {
    try {
        const properties = new Map(Object.entries(process.env));
        await postDeploy(properties);
    }
    catch (error) {
        if (error instanceof Error) {
            process.stderr.write(`Post-deploy failed: ${error.message}\n`);
        }
        process.exitCode = 1;
    }
}
runPostDeployScripts();
