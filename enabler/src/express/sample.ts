import {
  ExpressOptions,
  OnComplete,
  PaymentExpressBuilder,
} from "../payment-enabler/payment-enabler";
import { BaseOptions } from "../payment-enabler/payment-enabler-mock";
import { DefaultExpressComponent } from "./base";
import { loadStripe } from "@stripe/stripe-js";
//import config from "../processor/src/config/config.ts";
export class SampleExpressBuilder implements PaymentExpressBuilder {
  private processorUrl: string;
  private sessionId: string;
  private countryCode: string;
  private currencyCode: string;
  private publishableKey: string;
  private paymentMethodConfig?: {
  [key: string]: {
    isEnabled: boolean;
  };
};

  private onComplete: OnComplete;
 
  constructor(baseOptions: BaseOptions) {
    this.processorUrl = baseOptions.processorUrl;
    this.sessionId = baseOptions.sessionId;
    this.countryCode = baseOptions.countryCode;
    this.currencyCode = baseOptions.currencyCode;
    this.publishableKey = baseOptions.publishableKey;
    this.paymentMethodConfig = baseOptions.paymentMethodConfig;
    this.onComplete = baseOptions.onComplete;
  }
 
  build(config: ExpressOptions): SampleExpressComponent {
    const express = new SampleExpressComponent({
      expressOptions: config,
      processorUrl: this.processorUrl,
      sessionId: this.sessionId,
      countryCode: this.countryCode,
      currencyCode: this.currencyCode,
      publishableKey: this.publishableKey,
      paymentMethodConfig: this.paymentMethodConfig,
      onComplete: config.onComplete || this.onComplete,
    });
 
    express.init();
    return express;
  }
}
 
export class SampleExpressComponent extends DefaultExpressComponent {
  constructor(opts: { expressOptions: ExpressOptions
    processorUrl: string;
    publishableKey:string;
paymentMethodConfig?: {
  [key: string]: {
    isEnabled: boolean;
  };
};

    sessionId: string;
    countryCode: string;
    currencyCode: string;
    onComplete: OnComplete;
  }) {
    super({
      expressOptions: opts.expressOptions,
      processorUrl: opts.processorUrl,
      sessionId: opts.sessionId,
      countryCode: opts.countryCode,
      currencyCode: opts.currencyCode,
      publishableKey: opts.publishableKey,
      paymentMethodConfig: opts.paymentMethodConfig,
      onComplete: opts.onComplete,
    })
    this.expressOptions = opts.expressOptions;
  }
 
  // Initialize PSP sdk in this method.
  init(): void {
    // The code below is simply an example of how onPayButtonClick can be used and do not necessarily mean it must be used here.
    this.expressOptions.onPayButtonClick().then(res => this.setSessionId(res.sessionId)) ;
  }
 
  // To be called when mounting the component
async mount(selector: string): Promise<void> {
 
  const stripe = await loadStripe(this.publishableKey);
 
  if (!stripe) {
    console.error("Stripe failed to load");
    return;
  }
 
  const elements = stripe.elements({
    clientSecret: this.sessionId,
  });
 
  const expressCheckout = elements.create("expressCheckout");
 
  expressCheckout.mount(selector);
}
}