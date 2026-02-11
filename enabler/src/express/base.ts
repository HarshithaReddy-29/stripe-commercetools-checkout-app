import { ComponentOptions, PaymentComponent, PaymentMethod } from '../payment-enabler/payment-enabler';
import { BaseOptions } from "../payment-enabler/payment-enabler-mock";
import {Stripe, StripePaymentElement} from "@stripe/stripe-js";
import type { FakeSdk } from '../fake-sdk';



/**
 * Base Web Component
 */
export abstract class BaseComponent implements PaymentComponent {

  protected paymentMethod: PaymentMethod;
  protected processorUrl: BaseOptions['processorUrl'];
  protected sessionId: BaseOptions['sessionId'];
  protected environment: BaseOptions['environment'];
  protected sdk: Stripe | FakeSdk;
  protected stripePaymentElement: StripePaymentElement;

  constructor(paymentMethod: PaymentMethod, baseOptions: BaseOptions, _componentOptions: ComponentOptions) {
    this.paymentMethod = paymentMethod;
    this.sdk = baseOptions.sdk;
    this.processorUrl = baseOptions.processorUrl;
    this.sessionId = baseOptions.sessionId;
    this.environment = baseOptions.environment;
    this.stripePaymentElement = baseOptions.paymentElement;

    /**this.onComplete = baseOptions.configuration.onComplete;
    this.onError = baseOptions.configuration.onError;**/
  }

  abstract submit(): void;

  abstract mount(selector: string): void ;

  showValidation?(): void;
  isValid?(): boolean;
  getState?(): {
    card?: {
      endDigits?: string;
      brand?: string;
      expiryDate? : string;
    }
  };
  isAvailable?(): Promise<boolean>;
}
export class DefaultExpressComponent extends BaseComponent {
  constructor(
    paymentMethod: PaymentMethod,
    baseOptions: BaseOptions,
    componentOptions: ComponentOptions
  ) {
    super(paymentMethod, baseOptions, componentOptions);
  }

  mount(selector: string): void {
    const el = document.querySelector(selector);
    if (!el) throw new Error(`Express mount point not found: ${selector}`);

    // For now: placeholder UI. Later you can mount Stripe Express Checkout element here.
    el.innerHTML = `
      <div style="padding:12px;border:1px dashed #999">
        Express checkout placeholder (Stripe)
      </div>
    `;
  }

  submit(): void {
    // Express flows often auto-submit (ApplePay/GPay). Keep as no-op for now.
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

