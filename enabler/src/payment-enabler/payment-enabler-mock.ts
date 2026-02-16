import {
  PaymentEnabler,
  //PaymentComponentBuilder,
  PaymentDropinBuilder,
  StoredComponentBuilder,
  PaymentExpressBuilder,
  DropinType,
  PaymentResult,
  StoredPaymentMethod,
  CocoStoredPaymentMethod
} from './payment-enabler';
import type {
  Stripe,
  StripeElements,
  StripePaymentElement,
} from '@stripe/stripe-js';
import { FakeSdk } from "../fake-sdk";
import { SampleExpressBuilder } from '../express/sample';
export type StoredPaymentMethodsConfig = {
  isEnabled: boolean;
  storedPaymentMethods: CocoStoredPaymentMethod[];
};
export type BaseOptions = {
  /** Stripe SDK OR Fake SDK (depending on flow) */
  sdk: Stripe | FakeSdk;

  /** ONLY for embedded / payment element flow */
  elements?: StripeElements;
  paymentElement?: StripePaymentElement;

  processorUrl: string;
  countryCode?: string;
  currencyCode?: string;
  sessionId: string;
  environment: string;
  paymentMethodConfig?: { [key: string]: string };
  locale?: string;

  onComplete: (result: PaymentResult) => void;
  onError: (error: any, context?: { paymentReference?: string }) => void;

  storedPaymentMethodsConfig: StoredPaymentMethodsConfig;
  getStorePaymentDetails: () => boolean;
  setStorePaymentDetails: (enabled: boolean) => void;
  setSessionId?: (sessionId: string) => void;
};
export class MockPaymentEnabler implements PaymentEnabler {
  setupData: { baseOptions: any; } | PromiseLike<{ baseOptions: any; }>;
  getAvailableMethods(): Promise<string[]> {
    throw new Error('Method not implemented.');
  }

  /*async createComponentBuilder(
    _type: string
  ): Promise<PaymentComponentBuilder> {
    return {} as PaymentComponentBuilder;
  }*/

  async createDropinBuilder(
    _type: DropinType
  ): Promise<PaymentDropinBuilder> {
    return {} as PaymentDropinBuilder;
  }

  async createStoredPaymentMethodBuilder(
    _type: string
  ): Promise<StoredComponentBuilder> {
    return {} as StoredComponentBuilder;
  }

async createExpressBuilder(type: string): Promise<PaymentExpressBuilder> {
  const { baseOptions } = await this.setupData;

  const supportedMethods: Record<string, new (opts: any) => PaymentExpressBuilder> = {
    sample: SampleExpressBuilder, // <-- your express builder class
  };

  if (!supportedMethods[type]) {
    throw new Error(
      `Express checkout type not supported: ${type}. Supported: ${Object.keys(supportedMethods).join(', ')}`
    );
  }

  return new supportedMethods[type](baseOptions);
}

  async isStoredPaymentMethodsEnabled(): Promise<boolean> {
    return false;
  }

  async getStoredPaymentMethods(_: {
    allowedMethodTypes: string[];
  }): Promise<{ storedPaymentMethods?: StoredPaymentMethod[] }> {
    return {};
  }

  setStorePaymentDetails(_enabled: boolean): void {
    // no-op for mock
  }
}
