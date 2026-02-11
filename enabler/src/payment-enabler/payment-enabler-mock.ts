import {
  PaymentEnabler,
  PaymentComponentBuilder,
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
  getAvailableMethods(): Promise<string[]> {
    throw new Error('Method not implemented.');
  }

  async createComponentBuilder(
    _type: string
  ): Promise<PaymentComponentBuilder> {
    return {} as PaymentComponentBuilder;
  }

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

  async createExpressBuilder(
    _type: string
  ): Promise<PaymentExpressBuilder> {
    return {} as PaymentExpressBuilder;
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
