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
import { FakeSdk } from "../fake-sdk";
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
  async getPaymentMethods(values?: { paymentElementType?: string }): Promise<string[]> {
  const type = values?.paymentElementType || 'paymentElement';

  if (type === 'expressCheckout') {
    // This return value is what tells the Merchant Center Express is supported.
    // 'sample' must match the key in your createExpressBuilder's supportedMethods.
    return ['sample']; 
  }

  // Standard payment methods for the 'paymentElement' type
  return ['card', 'invoice', 'purchaseorder', 'customtestmethod'];
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
