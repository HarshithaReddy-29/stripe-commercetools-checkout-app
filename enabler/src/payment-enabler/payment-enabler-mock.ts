import {
  CocoStoredPaymentMethod,
  DropinType, EnablerOptions,
  PaymentComponentBuilder,
  PaymentDropinBuilder,
  PaymentEnabler, PaymentResult,
  PaymentExpressBuilder,
  StoredComponentBuilder,
} from "./payment-enabler";
import { DropinEmbeddedBuilder } from "../dropin/dropin-embedded";
import {
  Appearance,
  LayoutObject,
  loadStripe,
  Stripe,
  StripeElements,
  StripePaymentElementOptions,
  TermsOption
} from "@stripe/stripe-js";
//import { StripePaymentElement } from "@stripe/stripe-js";
import { SampleExpressBuilder } from "../express/sample";
import { FakeSdk } from "../fake-sdk.ts";
import { createSession } from "../utils/session-client.ts";
import { CardBuilder } from "../components/payment-methods/card/card";
import { InvoiceBuilder } from "../components/payment-methods/invoice/invoice";
import { PurchaseOrderBuilder } from "../components/payment-methods/purchase-order/purchase-order";
import { CustomTestMethodBuilder } from "../components/payment-methods/custom-test-method/custom-test-method";
import { StoredCardBuilder } from "../stored/stored-payment-methods/card";
import { ConfigElementResponseSchemaDTO, ConfigResponseSchemaDTO, CustomerResponseSchemaDTO } from "../dtos/mock-payment.dto.ts";
import { parseJSON } from "../utils/index.ts";

declare global {
  interface ImportMeta {
    // @ts-ignore
    env: any;
  }
}
export type StoredPaymentMethodsConfig = {
  isEnabled: boolean;
  storedPaymentMethods: CocoStoredPaymentMethod[];
};

export type BaseOptions = {
  elements?: any;
  paymentElement?: any;
  sdk: any;
  processorUrl: string;
  countryCode?: string;
  currencyCode?: string;
  sessionId: string;
  environment: string;
  publishableKeyUS: string;
  publishableKeyCA: string;
  publishableKeyEU: string;
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

interface ElementsOptions {
  type: string;
  options: Record<string, any>;
  onComplete: (result: PaymentResult) => void;
  onError: (error?: any) => void;
  layout: LayoutObject;
  appearance: Appearance;
  fields: {
    billingDetails: {
      address: string;
    };
  };
  terms?: TermsOption;
  business?: { name: string }
}
async function fetchStripeKeys(processorUrl: string) {
  const response = await fetch(`${processorUrl}/operations/stripe-publishable-keys`);

  if (!response.ok) {
    throw new Error("Failed to fetch Stripe publishable keys");
  }

  return response.json();
}

export class MockPaymentEnabler implements PaymentEnabler {
  setupData: Promise<{ baseOptions: BaseOptions }>;
  setupDataExpress: Promise<{ baseOptions: BaseOptions }>;
  private storePaymentDetails = false;

  constructor(options: EnablerOptions) {
    this.setupData = MockPaymentEnabler._Setup(
      options,
      this.getStorePaymentDetails,
      this.setStorePaymentDetails,
    );
    this.setupDataExpress = MockPaymentEnabler._SetupExpress(
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
    console.log("PaymentEnabler INIT");
    console.log("options.sessionId from frontend:", options.sessionId);
    console.log("options.processorUrl:", options.processorUrl);

    const paymentMethodType = "payment";

    // 1) Start with sessionId passed from UI
    let sessionId = options.sessionId;
    console.log("sessionId BEFORE createSession:", sessionId);
    if (!sessionId || sessionId == "undefined") {
      sessionId = await createSession({
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
      });
      console.log("NEW sessionId CREATED:", sessionId);
    }

    // 2) Call config once with that sessionId
    console.log("Session used for processor calls:", sessionId);
    let configResponse = await fetch(options.processorUrl + "/operations/config", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Session-Id": sessionId,
      },
    });

    // 3) If session is invalid/inactive, create a NEW session and retry ONCE
    if (!configResponse.ok) {
      const bodyText = await configResponse.text();
      const looksLikeSessionError =
        configResponse.status === 401 ||
        configResponse.status === 400 ||
        bodyText.includes("Session is not active") ||
        bodyText.includes("invalid_token");

      if (looksLikeSessionError) {
        sessionId = await createSession({
          projectKey: options.projectKey,
          authUrl: options.authUrl,
          sessionUrl: options.sessionUrl,
          clientId: options.clientId,
          clientSecret: options.clientSecret,
          cartId: options.cartId,
          processorUrl: options.processorUrl,
          allowedPaymentMethods: ["card", "invoice", "purchaseorder", "dropin", "applepay", "googlepay"],
        });

        configResponse = await fetch(options.processorUrl + "/operations/config", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "X-Session-Id": sessionId,
          },
        });
      }
    }

    if (!configResponse.ok) {
      const errText = await configResponse.text();
      throw new Error(
        `Config call failed: ${configResponse.status} ${configResponse.statusText}. Body: ${errText}`,
      );
    }

    const configJson = await configResponse.json();

    const headers = {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Session-Id": sessionId,
      },
    };

    // fetch config-element/payment using VALID session
    const configElementResp = await fetch(
      `${options.processorUrl}/config-element/${paymentMethodType}`,
      headers
    );
    if (!configElementResp.ok) {
      const t = await configElementResp.text();
      throw new Error(`config-element failed: ${configElementResp.status}. Body: ${t}`);
    }
    const cartInfoResponse = await configElementResp.json();

    // fetch customer/session using VALID session
    const customer = await MockPaymentEnabler.getCustomerOptions(options, sessionId);

    // build Stripe SDK (choose key strategy)
    const stripeSDK = await MockPaymentEnabler.getStripeSDK(configJson);

    const elements = MockPaymentEnabler.getElements(stripeSDK, cartInfoResponse, customer);
    if (!elements) throw new Error("Stripe Elements init failed (elements is null).");

    const elementsOptions = MockPaymentEnabler.getElementsOptions(options, cartInfoResponse);

    // 5) Use THE SAME sessionId for stored-payment-methods
    let storedPaymentMethodsList: CocoStoredPaymentMethod[] = [];
    if (configJson.storedPaymentMethodsConfig?.isEnabled === true) {
      const response = await fetch(options.processorUrl + "/stored-payment-methods", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Session-Id": sessionId,
        },
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(
          `Stored PM call failed: ${response.status} ${response.statusText}. Body: ${errText}`,
        );
      }

      const storedPaymentMethods: { storedPaymentMethods: CocoStoredPaymentMethod[] } =
        await response.json();

      storedPaymentMethodsList = storedPaymentMethods.storedPaymentMethods;
    }

    const sdkOptions = { environment: "test" };
    const stripeKeys = await fetchStripeKeys(options.processorUrl);
    return Promise.resolve({
      baseOptions: {
        sdk: stripeSDK,
        processorUrl: options.processorUrl,

        // use refreshed sessionId
        sessionId,

        environment: sdkOptions.environment,

        // region detection
        countryCode: options.locale?.split("-")[1] ?? "US",

        currencyCode:
          options.locale?.startsWith("en-CA") ? "CAD"
            : options.locale?.startsWith("en-US") ? "USD"
              : "EUR",

        // region specific Stripe keys
        publishableKeyUS: stripeKeys.publishableKeyUS,
        publishableKeyCA: stripeKeys.publishableKeyCA,
        publishableKeyEU: stripeKeys.publishableKeyEU,


        onComplete: options.onComplete || (() => { }),
        onError: options.onError || (() => { }),
        paymentElement: elements.create(
          "payment",
          elementsOptions as StripePaymentElementOptions
        ),
        elements,

        stripeCustomerId: customer?.stripeCustomerId ?? "",

        paymentMethodConfig: {
          applepay: { isEnabled: true },
          googlepay: { isEnabled: true },
        },

        storedPaymentMethodsConfig: {
          isEnabled: configJson.storedPaymentMethodsConfig?.isEnabled,
          storedPaymentMethods: storedPaymentMethodsList,
        },

        setStorePaymentDetails,
        getStorePaymentDetails,
      },
    });
  };

  private static _SetupExpress = async (
    options: EnablerOptions,
    getStorePaymentDetails: () => boolean,
    setStorePaymentDetails: (enabled: boolean) => void,
  ): Promise<{ baseOptions: BaseOptions }> => {
    console.log("Express payment!")
    console.log("Options : ", options)
    console.log("PaymentEnabler INIT");
    console.log("options.sessionId from frontend:", options.sessionId);
    console.log("options.processorUrl:", options.processorUrl);

    // const paymentMethodType = "payment";

    // 1) Start with sessionId passed from UI
    let sessionId = options.sessionId;
    // console.log("sessionId BEFORE createSession:", sessionId);
    // if (!sessionId || sessionId == "undefined") {
    //   sessionId = await createSession({
    //     projectKey: options.projectKey,
    //     authUrl: options.authUrl,
    //     sessionUrl: options.sessionUrl,
    //     clientId: options.clientId,
    //     clientSecret: options.clientSecret,
    //     cartId: options.cartId,
    //     processorUrl: options.processorUrl,
    //     allowedPaymentMethods: [
    //       "card",
    //       "invoice",
    //       "purchaseorder",
    //       "dropin",
    //       "applepay",
    //       "googlepay",
    //     ],
    //   });
    //   console.log("NEW sessionId CREATED:", sessionId);
    // }

    // 2) Call config once with that sessionId
    console.log("Session used for processor calls:", sessionId);
    let configResponse = await fetch(options.processorUrl + "/operations/config", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Session-Id": sessionId,
      },
    });

    // 3) If session is invalid/inactive, create a NEW session and retry ONCE
    if (!configResponse.ok) {
      const bodyText = await configResponse.text();
      const looksLikeSessionError =
        configResponse.status === 401 ||
        configResponse.status === 400 ||
        bodyText.includes("Session is not active") ||
        bodyText.includes("invalid_token");

      if (looksLikeSessionError) {
        sessionId = await createSession({
          projectKey: options.projectKey,
          authUrl: options.authUrl,
          sessionUrl: options.sessionUrl,
          clientId: options.clientId,
          clientSecret: options.clientSecret,
          cartId: options.cartId,
          processorUrl: options.processorUrl,
          allowedPaymentMethods: ["card", "invoice", "purchaseorder", "dropin", "applepay", "googlepay"],
        });

        configResponse = await fetch(options.processorUrl + "/operations/config", {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "X-Session-Id": sessionId,
          },
        });
      }
    }

    if (!configResponse.ok) {
      const errText = await configResponse.text();
      throw new Error(
        `Config call failed: ${configResponse.status} ${configResponse.statusText}. Body: ${errText}`,
      );
    }

    const configJson = await configResponse.json();

    // const headers = {
    //   method: "GET",
    //   headers: {
    //     "Content-Type": "application/json",
    //     "X-Session-Id": sessionId,
    //   },
    // };

    // fetch config-element/payment using VALID session
    // const configElementResp = await fetch(
    //   `${options.processorUrl}/config-element/${paymentMethodType}`,
    //   headers
    // );
    // if (!configElementResp.ok) {
    //   const t = await configElementResp.text();
    //   throw new Error(`config-element failed: ${configElementResp.status}. Body: ${t}`);
    // }
    // const cartInfoResponse = await configElementResp.json();

    // // fetch customer/session using VALID session
    // const customer = await MockPaymentEnabler.getCustomerOptions(options, sessionId);

    // // build Stripe SDK (choose key strategy)
    // const stripeSDK = await MockPaymentEnabler.getStripeSDK(configJson);

    // const elements = MockPaymentEnabler.getElements(stripeSDK, cartInfoResponse, customer);
    // if (!elements) throw new Error("Stripe Elements init failed (elements is null).");

    // const elementsOptions = MockPaymentEnabler.getElementsOptions(options, cartInfoResponse);

    // 5) Use THE SAME sessionId for stored-payment-methods
    let storedPaymentMethodsList: CocoStoredPaymentMethod[] = [];
    if (configJson.storedPaymentMethodsConfig?.isEnabled === true) {
      const response = await fetch(options.processorUrl + "/stored-payment-methods", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Session-Id": sessionId,
        },
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(
          `Stored PM call failed: ${response.status} ${response.statusText}. Body: ${errText}`,
        );
      }

      const storedPaymentMethods: { storedPaymentMethods: CocoStoredPaymentMethod[] } =
        await response.json();

      storedPaymentMethodsList = storedPaymentMethods.storedPaymentMethods;
    }

    const sdkOptions = { environment: "test" };
    const stripeKeys = await fetchStripeKeys(options.processorUrl);
    return Promise.resolve({
      baseOptions: {
        sdk: new FakeSdk(sdkOptions),
        processorUrl: options.processorUrl,

        // use refreshed sessionId
        sessionId,

        environment: sdkOptions.environment,

        // region detection
        countryCode: options.locale?.split("-")[1] ?? "US",

        currencyCode:
          options.locale?.startsWith("en-CA") ? "CAD"
            : options.locale?.startsWith("en-US") ? "USD"
              : "EUR",

        // region specific Stripe keys
        publishableKeyUS: stripeKeys.publishableKeyUS,
        publishableKeyCA: stripeKeys.publishableKeyCA,
        publishableKeyEU: stripeKeys.publishableKeyEU,

        onComplete: options.onComplete || (() => { }),
        onError: options.onError || (() => { }),

        // paymentElement: elements.create(
        //   "payment",
        //   elementsOptions as StripePaymentElementOptions
        // ),
        // elements,

        // stripeCustomerId: customer?.stripeCustomerId ?? "",

        paymentMethodConfig: {
          applepay: { isEnabled: true },
          googlepay: { isEnabled: true },
        },

        storedPaymentMethodsConfig: {
          isEnabled: configJson.storedPaymentMethodsConfig?.isEnabled,
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
      setupData.baseOptions.storedPaymentMethodsConfig?.storedPaymentMethods
        .map(({ token, ...storedPaymentMethod }) => storedPaymentMethod)
        .filter((method) => allowedMethodTypes.includes(method.type));

    return { storedPaymentMethods };
  }

  async isStoredPaymentMethodsEnabled(): Promise<boolean> {
    const setupData = await this.setupData;
    return setupData.baseOptions.storedPaymentMethodsConfig?.isEnabled;
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

    if (!setupData.baseOptions.storedPaymentMethodsConfig?.isEnabled) {
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
    // const { baseOptions } = await this.setupData;
    const { baseOptions } = await this.setupDataExpress;

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

  private static async getStripeSDK(configEnvResponse: ConfigResponseSchemaDTO): Promise<Stripe | null> {
    try {
      const sdk = await loadStripe(configEnvResponse.publishableKey);
      if (!sdk) throw new Error("Failed to load Stripe SDK.");
      return sdk;
    } catch (error) {
      console.error("Error loading Stripe SDK:", error);
      throw error; // or handle based on your requirements
    }
  }

  private static getElements(
    stripeSDK: Stripe | null,
    cartInfoResponse: ConfigElementResponseSchemaDTO,
    customer: CustomerResponseSchemaDTO
  ): StripeElements | null {
    if (!stripeSDK) return null;
    try {
      return stripeSDK.elements?.({
        mode: 'payment',
        amount: cartInfoResponse.cartInfo.amount,
        currency: cartInfoResponse.cartInfo.currency.toLowerCase(),
        ...(customer && {
          customerOptions: {
            customer: customer.stripeCustomerId,
            ephemeralKey: customer.ephemeralKey,
          },
          setupFutureUsage: cartInfoResponse.setupFutureUsage,
          customerSessionClientSecret: customer.sessionId,
        }),
        appearance: parseJSON(cartInfoResponse.appearance),
        capture_method: cartInfoResponse.captureMethod,
      });
    } catch (error) {
      console.error("Error initializing elements:", error);
      return null;
    }
  }


  private static getFetchHeader(sessionId: string) {
    return {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Session-Id": sessionId,
      },
    }
  }

  private static getElementsOptions(
    options: EnablerOptions,
    config: ConfigElementResponseSchemaDTO
  ): ElementsOptions {
    const { appearance, layout, collectBillingAddress } = config;
    return {
      type: 'payment',
      options: {},
      onComplete: options.onComplete,
      onError: options.onError,
      layout: this.getLayoutObject(layout),
      appearance: parseJSON(appearance),
      terms: {
        applePay: "always",
        googlePay: "always",
        card: "always",
      },
      business: {
        name: 'FUJIFILM North America'
      },
      ...(collectBillingAddress !== 'auto' && {
        fields: {
          billingDetails: {
            address: collectBillingAddress,
          }
        }
      }),
    }
  }

  private static async getCustomerOptions(
    options: EnablerOptions,
    sessionId: string
  ): Promise<CustomerResponseSchemaDTO | undefined> {

    const headers = MockPaymentEnabler.getFetchHeader(sessionId);

    const apiUrl = new URL(`${options.processorUrl}/customer/session`);
    const response = await fetch(apiUrl.toString(), headers);

    if (response.status === 204) {
      console.log("No Stripe customer session");
      return undefined;
    }
    const data: CustomerResponseSchemaDTO = await response.json();
    return data;
  }

  private static getLayoutObject(layout: string): LayoutObject {
    if (layout) {
      const parsedObject = parseJSON<LayoutObject>(layout);
      const isValid = this.validateLayoutObject(parsedObject);
      if (isValid) {
        return parsedObject;
      }
    }

    return {
      type: 'tabs',
      defaultCollapsed: false,
    };
  }

  private static validateLayoutObject(layout: LayoutObject): boolean {
    if (!layout) return false;
    const validLayouts = ['tabs', 'accordion', 'auto'];
    return validLayouts.includes(layout.type);
  }
}
