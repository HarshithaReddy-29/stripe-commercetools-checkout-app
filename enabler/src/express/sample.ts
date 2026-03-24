import {
  ExpressOptions,
  OnComplete,
  PaymentExpressBuilder,
} from "../payment-enabler/payment-enabler";
import { BaseOptions } from "../payment-enabler/payment-enabler-mock";
import { DefaultExpressComponent } from "./base";
import { loadStripe } from "@stripe/stripe-js";

export class SampleExpressBuilder implements PaymentExpressBuilder {
  private processorUrl: string;
  private sessionId: string;
  private countryCode: string;
  private currencyCode: string;

  private publishableKeyUS: string;
  private publishableKeyCA: string;
  private publishableKeyEU: string;

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

    this.publishableKeyUS = baseOptions.publishableKeyUS;
    this.publishableKeyCA = baseOptions.publishableKeyCA;
    this.publishableKeyEU = baseOptions.publishableKeyEU;

    this.paymentMethodConfig = baseOptions.paymentMethodConfig;
    this.onComplete = baseOptions.onComplete;
  }

  private resolvePublishableKey(): string {
    if (this.countryCode === "us") {
      return this.publishableKeyUS;
    }

    if (this.countryCode === "ca") {
      return this.publishableKeyCA;
    }

    // everything else → EU Stripe account
    return this.publishableKeyEU;
  }

  build(config: ExpressOptions): SampleExpressComponent {
    const express = new SampleExpressComponent({
      expressOptions: config,
      processorUrl: this.processorUrl,
      sessionId: this.sessionId,
      countryCode: this.countryCode,
      currencyCode: this.currencyCode,
      publishableKey: this.resolvePublishableKey(),
      paymentMethodConfig: this.paymentMethodConfig,
      onComplete: config.onComplete || this.onComplete,
    });

    express.init();
    return express;
  }
}

export class SampleExpressComponent extends DefaultExpressComponent {
  constructor(opts: {
    expressOptions: ExpressOptions;
    processorUrl: string;
    publishableKey: string;
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
    });
    this.publishableKey = opts.publishableKey;
    this.expressOptions = opts.expressOptions;
  }

  // Initialize PSP sdk in this method.
  init(): void {
    // The code below is simply an example of how onPayButtonClick can be used and do not necessarily mean it must be used here.
    this.expressOptions
      .onPayButtonClick()
      .then((res) => this.setSessionId(res.sessionId));
  }

  // To be called when mounting the component
  async mount(selector: string): Promise<void> {
    const stripe = await loadStripe(this.publishableKey);

    if (!stripe) {
      console.error("Stripe failed to load");
      return;
    }

    const elements = stripe.elements({
      mode: "payment",
      currency: "usd",
      amount: this.expressOptions?.initialAmount?.centAmount,
      setupFutureUsage: "on_session",
      captureMethod: "manual",
      appearance: {
        theme: "stripe",
        variables: {
          borderRadius: "50px",
        },
        rules: {
          ".Button": {
            borderRadius: "50px",
            border: "2px solid #018463",
          },
          ".Button:hover": {
            border: "2px solid #349D82",
          },
        },
      },
    });

    const expressCheckout = elements.create("expressCheckout", {
      shippingAddressRequired: true,
      billingAddressRequired: true,
      buttonHeight: 50,
      business: {
        name: "FUJIFILM North America",
      },
      buttonTheme: {
        applePay: "white-outline",
        googlePay: "white",
        paypal: "white",
      },
      buttonType: {
        applePay: "buy",
        googlePay: "buy",
        paypal: "pay",
      },
      layout: {
        maxColumns: 3,
      },
      paymentMethods: {
        applePay: "always",
        googlePay: "always",
        paypal: "auto",
      },
    });

    /**
     * SHIPPING ADDRESS CHANGE
     */

    expressCheckout.on("shippingaddresschange", async (event: any) => {
      try {
        const address = {
          country: event.address.country,
          city: event.address.city,
          postalCode: event.address.postal_code,
          state: event.address.state,
          streetName: event.address.line1,
        };

        const shippingMethods = await this.expressOptions.getShippingMethods({
          address,
        });

        const shippingRates = shippingMethods
          .filter((method: any) =>
            method.name?.toLowerCase().includes("delivery")
          )
          .map((method: any) => ({
            id: method.id,
            displayName: method.name || method.id,
            amount: method.amount.centAmount,
            currency: method.amount.currencyCode.toLowerCase()
          }));

        event.resolve({ shippingRates });
      } catch (err) {
        console.error("shippingaddresschange error", err);
        event.reject();
      }
    });

    /**
     * SHIPPING RATE CHANGE
     * (Includes the production total update fix)
     */

    expressCheckout.on("shippingratechange", async (event: any) => {
      try {
        const rate = event.shippingRate;
        /**
         * Update cart shipping method in backend
         */

        await fetch(`${this.processorUrl}/shipping-method`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-session-id": this.sessionId,
          },
          body: JSON.stringify({
            shippingMethodId: rate.id,
          }),
        });

        /**
         * Get updated subtotal
         */

        const subtotal = this.expressOptions.initialAmount;

        const shippingAmount = rate.amount ?? 0;

        const newTotal = subtotal.centAmount + shippingAmount;
        await elements.update({
          amount: newTotal,
        });
        const lineItems = [
          { name: "Subtotal", amount: subtotal.centAmount },
          { name: rate.displayName || "Shipping", amount: shippingAmount },
        ]
        event.resolve({ lineItems });
      } catch (err) {
        console.error("shippingratechange error", err);
        event.reject();
      }
    });

    /**
     * CONFIRM PAYMENT
     */

    expressCheckout.on("confirm", async (event: any) => {
      try {
        const { error: submitError } = await elements.submit();
        if (submitError) {
          console.error("elements.submit failed", submitError);
          (event as any).complete("fail");
          return;
        }
        /**
         * Create PaymentIntent via connector
         */

        const paymentRes = await fetch(`${this.processorUrl}/payments`, {
          method: "GET",
          headers: {
            "x-session-id": this.sessionId,
          },
        });

        const data = await paymentRes.json();

        /**
         * Confirm payment with Stripe
         */

        const { paymentIntent, error } = await stripe.confirmPayment({
          elements,
          clientSecret: data.sClientSecret,
          confirmParams: {
            return_url: window.location.href,
            //setup_future_usage: "on_session",
          },
          redirect: "if_required",
        });

        if (error) {
          console.error("Stripe confirmPayment error", error);
          (event as any).complete("fail");
          return;
        }

        /**
         * Confirm payment in connector
         */

        await fetch(
          `${this.processorUrl}/confirmPayments/${data.paymentReference}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-session-id": this.sessionId,
            },
            body: JSON.stringify({
              paymentIntent: paymentIntent.id,
            }),
          },
        );

        //(event as any).complete("success");

        this.onComplete?.({
          isSuccess: true,
          paymentReference: data.paymentReference,
          method: {
            type: "express",
          },
        });
      } catch (err) {
        console.error("Express confirm handler failed", err);
        //(event as any).complete("fail");
      }
    });
    /**
     * Cancel event (optional)
     */
    expressCheckout.on("cancel", () => {
      console.log("Express checkout cancelled");
    });
    expressCheckout.mount(selector);
  }
}
