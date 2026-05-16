import Stripe from 'stripe';

// ---------------------------------------------------------------------------
// Stripe client (lazy)
//
// We deliberately do NOT instantiate Stripe at module load — if
// STRIPE_SECRET_KEY is missing the SDK throws synchronously, which would
// crash the entire API on startup. Instead, we wrap an empty object in a
// Proxy that lazy-initialises on first property access. The error surfaces
// only when a billing endpoint is actually called, which is what we want
// in environments where Stripe isn't configured yet (dev, CI).
// ---------------------------------------------------------------------------
let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      'STRIPE_SECRET_KEY is not configured. Set it in seema-node/.env to enable billing endpoints.',
    );
  }
  _stripe = new Stripe(key, { apiVersion: '2025-02-24.acacia' });
  return _stripe;
}

const stripe = new Proxy({} as Stripe, {
  get(_target, prop: string | symbol) {
    const target = getStripe() as unknown as Record<string | symbol, unknown>;
    const value = target[prop];
    return typeof value === 'function' ? (value as Function).bind(target) : value;
  },
}) as Stripe;

// ---------------------------------------------------------------------------
// Price map — maps tier + billing cycle to Stripe Price IDs via env vars
// ---------------------------------------------------------------------------
export const PRICE_MAP: Record<string, Record<string, string>> = {
  starter: {
    monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY!,
    annual: process.env.STRIPE_PRICE_STARTER_ANNUAL!,
  },
  essentials: {
    monthly: process.env.STRIPE_PRICE_ESSENTIALS_MONTHLY!,
    annual: process.env.STRIPE_PRICE_ESSENTIALS_ANNUAL!,
  },
  professional: {
    monthly: process.env.STRIPE_PRICE_PROFESSIONAL_MONTHLY!,
    annual: process.env.STRIPE_PRICE_PROFESSIONAL_ANNUAL!,
  },
};

// ---------------------------------------------------------------------------
// Tier limits
// ---------------------------------------------------------------------------
export const TIER_LIMITS: Record<string, { maxUsers: number }> = {
  starter: { maxUsers: 3 },
  essentials: { maxUsers: 10 },
  professional: { maxUsers: -1 }, // unlimited
};

// ---------------------------------------------------------------------------
// Feature matrix — what each tier unlocks
// ---------------------------------------------------------------------------
export const FEATURE_MATRIX: Record<string, Record<string, boolean>> = {
  starter: {
    maxUsers: true,
    compliance: true,
    aml: false,
    clio: false,
    aiAnalysis: false,
    breachRegister: true,
    clientAccounts: false,
    supervision: false,
    sraReturn: false,
    documentVault: false,
    emailAutomation: false,
    customPolicies: false,
  },
  essentials: {
    maxUsers: true,
    compliance: true,
    aml: true,
    clio: false,
    aiAnalysis: true,
    breachRegister: true,
    clientAccounts: true,
    supervision: true,
    sraReturn: false,
    documentVault: true,
    emailAutomation: false,
    customPolicies: false,
  },
  professional: {
    maxUsers: true,
    compliance: true,
    aml: true,
    clio: true,
    aiAnalysis: true,
    breachRegister: true,
    clientAccounts: true,
    supervision: true,
    sraReturn: true,
    documentVault: true,
    emailAutomation: true,
    customPolicies: true,
  },
};

// ---------------------------------------------------------------------------
// BillingService — thin wrapper around the Stripe SDK
// ---------------------------------------------------------------------------
export class BillingService {
  private stripe: Stripe;

  constructor(stripeInstance: Stripe) {
    this.stripe = stripeInstance;
  }

  /** Retrieve a subscription by its Stripe ID */
  async getSubscription(stripeSubscriptionId: string): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.retrieve(stripeSubscriptionId);
  }

  /** Create a new Stripe customer */
  async createCustomer(email: string, firmName: string): Promise<Stripe.Customer> {
    return this.stripe.customers.create({
      email,
      name: firmName,
      metadata: { source: 'seema' },
    });
  }

  /** Create a subscription, optionally with a trial period */
  async createSubscription(
    customerId: string,
    priceId: string,
    trialDays?: number,
  ): Promise<Stripe.Subscription> {
    const params: Stripe.SubscriptionCreateParams = {
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
    };

    if (trialDays && trialDays > 0) {
      params.trial_period_days = trialDays;
    }

    return this.stripe.subscriptions.create(params);
  }

  /** Upgrade (or downgrade) a subscription with proration */
  async upgradeSubscription(
    subscriptionId: string,
    newPriceId: string,
  ): Promise<Stripe.Subscription> {
    const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
    const currentItem = subscription.items.data[0];

    return this.stripe.subscriptions.update(subscriptionId, {
      items: [
        {
          id: currentItem.id,
          price: newPriceId,
        },
      ],
      proration_behavior: 'create_prorations',
    });
  }

  /** Cancel a subscription at the end of the current billing period */
  async cancelSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
  }

  /** List invoices for a customer */
  async getInvoices(customerId: string, limit = 24): Promise<Stripe.ApiList<Stripe.Invoice>> {
    return this.stripe.invoices.list({
      customer: customerId,
      limit,
    });
  }

  /** Create a SetupIntent for collecting card details */
  async createSetupIntent(customerId: string): Promise<Stripe.SetupIntent> {
    return this.stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
    });
  }

  /** List payment methods attached to a customer */
  async getPaymentMethods(customerId: string): Promise<Stripe.ApiList<Stripe.PaymentMethod>> {
    return this.stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
    });
  }

  /** Set the default payment method on the customer */
  async setDefaultPaymentMethod(
    customerId: string,
    paymentMethodId: string,
  ): Promise<Stripe.Customer> {
    return this.stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });
  }

  /** Detach a payment method */
  async deletePaymentMethod(paymentMethodId: string): Promise<Stripe.PaymentMethod> {
    return this.stripe.paymentMethods.detach(paymentMethodId);
  }
}

// ---------------------------------------------------------------------------
// Helper — check whether a tier has a given feature
// ---------------------------------------------------------------------------
export function checkFeature(tier: string, feature: string): boolean {
  const tierFeatures = FEATURE_MATRIX[tier];
  if (!tierFeatures) return false;
  return !!tierFeatures[feature];
}

// Default instance for convenience
export const billingService = new BillingService(stripe);
export { stripe };
