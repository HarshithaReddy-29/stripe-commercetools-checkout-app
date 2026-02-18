import { CardBuilder } from "../components/payment-methods/card/card";
import { InvoiceBuilder } from "../components/payment-methods/invoice/invoice";
import { PurchaseOrderBuilder } from "../components/payment-methods/purchase-order/purchase-order";
import { FakeSdk } from "../fake-sdk";
import { createSession } from "../utils/session-client";

import {
  CocoStoredPaymentMethod,
  DropinType,
  EnablerOptions,
  PaymentComponentBuilder,
  PaymentDropinBuilder,
  PaymentEnabler,
  PaymentExpressBuilder,
  PaymentResult,
  StoredComponentBuilder,
} from "./payment-enabler";
import { DropinEmbeddedBuilder } from "../dropin/dropin-embedded";
import { CustomTestMethodBuilder } from "../components/payment-methods/custom-test-method/custom-test-method";
import { StoredCardBuilder } from "../stored/stored-payment-methods/card";
import { SampleExpressBuilder } from "../express/sample";


export type StoredPaymentMethodsConfig = {
  isEnabled: boolean;
  storedPaymentMethods: CocoStoredPaymentMethod[];
};

export type BaseOptions = {
  sdk: FakeSdk;
  processorUrl: string;
  countryCode?: string;
  currencyCode?: string;
  sessionId: string;
  environment: string;
  paymentMethodConfig?: {
    [key: string]: {
      isEnabled: boolean;
    };
  };
  locale?: string;
  onComplete: (result: PaymentResult) => void;
  onError: (error: any, context?: { paymentReference?: string }) => void;
  storedPaymentMethodsConfig: StoredPaymentMethodsConfig;
  getStorePaymentDetails: () => boolean;
  setStorePaymentDetails: (enabled: boolean) => void;
  setSessionId?: (sessionId: string) => void;
};

export class MockPaymentEnabler implements PaymentEnabler {
  setupData: Promise<{ baseOptions: BaseOptions }>;
  private storePaymentDetails = false;

  constructor(options: EnablerOptions) {
    this.setupData = MockPaymentEnabler._Setup(
      options,
      this.getStorePaymentDetails,
      this.setStorePaymentDetails,
    );
  }
  getAvailableMethods(): Promise<string[]> {
    throw new Error("Method not implemented.");
  }

  private static _Setup = async (
    options: EnablerOptions,
    getStorePaymentDetails: () => boolean,
    setStorePaymentDetails: (enabled: boolean) => void,
  ): Promise<{ baseOptions: BaseOptions }> => {
    // Fetch SDK config from processor
    const sessionId =
      options.sessionId ??
      (await createSession({
        projectKey: options.projectKey,
        authUrl: options.authUrl,
        sessionUrl: options.sessionUrl,
        clientId: options.clientId,
        clientSecret: options.clientSecret,
        cartId: options.cartId,
        processorUrl: options.processorUrl,
        allowedPaymentMethods: [
          "card",
          "invoice",
          "purchaseorder",
          "dropin",
          "applepay",
          "googlepay",
        ],
      }));
    const configResponse = await fetch(
      options.processorUrl + "/operations/config",
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Session-Id": sessionId,
        },
      }
    );

    const configText = await configResponse.text();

    if (!configResponse.ok) {
      throw new Error(
        `GET /operations/config failed (${configResponse.status}) ${configText.slice(0, 300)}`
      );
    }

    let configJson: any;
    try {
      configJson = JSON.parse(configText);
    } catch {
      throw new Error(`GET /operations/config returned NON-JSON: ${configText.slice(0, 300)}`);
    }


    let storedPaymentMethodsList: CocoStoredPaymentMethod[] = [];
    if (configJson.storedPaymentMethodsConfig.isEnabled === true) {
      const response = await fetch(
        options.processorUrl + "/stored-payment-methods",
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "X-Session-Id": sessionId,
          },
        },
      );

      const storedPaymentMethods: {
        storedPaymentMethods: CocoStoredPaymentMethod[];
      } = await response.json();

      storedPaymentMethodsList = storedPaymentMethods.storedPaymentMethods;
    }

    const sdkOptions = {
      // environment: configJson.environment,
      environment: "test",
    };

    return Promise.resolve({
      baseOptions: {
        sdk: new FakeSdk(sdkOptions),
        processorUrl: options.processorUrl,
        sessionId: sessionId,
        environment: sdkOptions.environment,
        countryCode: options.locale?.split('-')[1] ?? 'US',
        currencyCode: 'USD',

        onComplete: options.onComplete || (() => { }),
        onError: options.onError || (() => { }),

        paymentMethodConfig: {
          applepay: { isEnabled: true },
          googlepay: { isEnabled: true },
        },

        storedPaymentMethodsConfig: {
          isEnabled: configJson.storedPaymentMethodsConfig.isEnabled,
          storedPaymentMethods: storedPaymentMethodsList,
        },
        setStorePaymentDetails,
        getStorePaymentDetails,
      },
    });
  };

  async getStoredPaymentMethods({ allowedMethodTypes }) {
    const setupData = await this.setupData;

    const storedPaymentMethods =
      setupData.baseOptions.storedPaymentMethodsConfig.storedPaymentMethods
        .map(({ token, ...storedPaymentMethod }) => storedPaymentMethod)
        .filter((method) => allowedMethodTypes.includes(method.type));

    return { storedPaymentMethods };
  }

  async isStoredPaymentMethodsEnabled(): Promise<boolean> {
    const setupData = await this.setupData;
    return setupData.baseOptions.storedPaymentMethodsConfig.isEnabled;
  }

  setStorePaymentDetails = (enabled: boolean): void => {
    this.storePaymentDetails = enabled;
  };

  getStorePaymentDetails = (): boolean => {
    return this.storePaymentDetails;
  };

  async createComponentBuilder(
    type: string,
  ): Promise<PaymentComponentBuilder | never> {
    const { baseOptions } = await this.setupData;

    const supportedMethods = {
      card: CardBuilder,
      invoice: InvoiceBuilder,
      purchaseorder: PurchaseOrderBuilder,
      customtestmethod: CustomTestMethodBuilder,
    };

    if (!Object.keys(supportedMethods).includes(type)) {
      throw new Error(
        `Component type not supported: ${type}. Supported types: ${Object.keys(
          supportedMethods,
        ).join(", ")}`,
      );
    }

    return new supportedMethods[type](baseOptions);
  }

  async createStoredPaymentMethodBuilder(
    type: string,
  ): Promise<StoredComponentBuilder | never> {
    const setupData = await this.setupData;

    if (!setupData.baseOptions.storedPaymentMethodsConfig.isEnabled) {
      throw new Error(
        "Stored payment methods is not enabled and thus cannot be used to build a new component",
      );
    }

    const supportedMethods = {
      card: StoredCardBuilder,
    };

    if (!Object.keys(supportedMethods).includes(type)) {
      throw new Error(
        `Component type not supported: ${type}. Supported types: ${Object.keys(supportedMethods).join(", ")}`,
      );
    }

    return new supportedMethods[type](setupData.baseOptions);
  }

  async createDropinBuilder(
    type: DropinType,
  ): Promise<PaymentDropinBuilder | never> {
    const { baseOptions } = await this.setupData;

    const supportedMethods = {
      embedded: DropinEmbeddedBuilder,
      // hpp: DropinHppBuilder,
    };

    if (!Object.keys(supportedMethods).includes(type)) {
      throw new Error(
        `Component type not supported: ${type}. Supported types: ${Object.keys(
          supportedMethods,
        ).join(", ")}`,
      );
    }

    return new supportedMethods[type](baseOptions);
  }

  async createExpressBuilder(type: string): Promise<PaymentExpressBuilder | never> {
    const { baseOptions } = await this.setupData;

    const supportedMethods = {
      applepay: SampleExpressBuilder,
      googlepay: SampleExpressBuilder,
    };

    if (!Object.keys(supportedMethods).includes(type)) {
      throw new Error(
        `Express checkout type not supported: ${type}. Supported types: ${Object.keys(
          supportedMethods
        ).join(", ")}`
      );
    }

    return new supportedMethods[type](baseOptions);
  }
}
