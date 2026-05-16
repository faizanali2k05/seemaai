import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import express from 'express';
import type Stripe from 'stripe';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { getTenantFilter } from '../middleware/tenant.js';
import { logAudit } from '../middleware/auditLogger.js';
import {
  billingService,
  stripe,
  PRICE_MAP,
  FEATURE_MATRIX,
  TIER_LIMITS,
  checkFeature,
} from '../services/billing.js';
import logger from '../utils/logger.js';
import { runWithBypass } from '../lib/tenantContext.js';

const router = Router();

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------
const subscribeSchema = z.object({
  tier: z.enum(['starter', 'essentials', 'professional']),
  plan: z.enum(['monthly', 'annual']),
});

const upgradeSchema = z.object({
  tier: z.enum(['starter', 'essentials', 'professional']),
  plan: z.enum(['monthly', 'annual']),
});

const defaultPmSchema = z.object({
  paymentMethodId: z.string().min(1),
});

// ---------------------------------------------------------------------------
// 1. GET /subscription — current subscription status
// ---------------------------------------------------------------------------
router.get('/subscription', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { firmId } = getTenantFilter(req);

    const firm = await prisma.firm.findUnique({ where: { id: firmId } });
    if (!firm) {
      res.status(404).json({ error: true, message: 'Firm not found' });
      return;
    }

    let stripeSubscription = null;
    if (firm.stripeSubscriptionId) {
      try {
        stripeSubscription = await billingService.getSubscription(firm.stripeSubscriptionId);
      } catch {
        logger.warn('Failed to fetch Stripe subscription', {
          subscriptionId: firm.stripeSubscriptionId,
          firmId,
        });
      }
    }

    res.json({
      subscriptionTier: firm.subscriptionTier,
      subscriptionPlan: firm.subscriptionPlan,
      subscriptionStatus: firm.subscriptionStatus,
      stripeSubscriptionId: firm.stripeSubscriptionId,
      stripeCustomerId: firm.stripeCustomerId,
      tierLimits: TIER_LIMITS[firm.subscriptionTier || 'starter'],
      stripe: stripeSubscription
        ? {
            status: stripeSubscription.status,
            currentPeriodEnd: stripeSubscription.current_period_end,
            cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
          }
        : null,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// 2. POST /subscribe — create a new subscription
// ---------------------------------------------------------------------------
router.post('/subscribe', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { firmId } = getTenantFilter(req);
    const { tier, plan } = subscribeSchema.parse(req.body);

    const priceId = PRICE_MAP[tier]?.[plan];
    if (!priceId) {
      res.status(400).json({ error: true, message: 'Invalid tier/plan combination' });
      return;
    }

    const firm = await prisma.firm.findUnique({ where: { id: firmId } });
    if (!firm) {
      res.status(404).json({ error: true, message: 'Firm not found' });
      return;
    }

    // Create Stripe customer if one doesn't exist yet
    let customerId = firm.stripeCustomerId;
    if (!customerId) {
      const customer = await billingService.createCustomer(
        req.user!.email,
        firm.name,
      );
      customerId = customer.id;
    }

    // Create subscription (14-day trial for new subscribers)
    const subscription = await billingService.createSubscription(
      customerId,
      priceId,
      14,
    );

    // Persist IDs on the firm record
    await prisma.firm.update({
      where: { id: firmId },
      data: {
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        subscriptionTier: tier,
        subscriptionPlan: plan,
        subscriptionStatus: subscription.status,
      },
    });

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'subscription_created',
      entityType: 'billing',
      entityId: subscription.id,
      metadata: { tier, plan },
    });

    res.status(201).json({
      subscriptionId: subscription.id,
      status: subscription.status,
      clientSecret:
        (subscription.latest_invoice as any)?.payment_intent?.client_secret ?? null,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// 3. POST /upgrade — change plan with proration
// ---------------------------------------------------------------------------
router.post('/upgrade', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { firmId } = getTenantFilter(req);
    const { tier, plan } = upgradeSchema.parse(req.body);

    const priceId = PRICE_MAP[tier]?.[plan];
    if (!priceId) {
      res.status(400).json({ error: true, message: 'Invalid tier/plan combination' });
      return;
    }

    const firm = await prisma.firm.findUnique({ where: { id: firmId } });
    if (!firm?.stripeSubscriptionId) {
      res.status(400).json({ error: true, message: 'No active subscription to upgrade' });
      return;
    }

    const updated = await billingService.upgradeSubscription(
      firm.stripeSubscriptionId,
      priceId,
    );

    await prisma.firm.update({
      where: { id: firmId },
      data: {
        subscriptionTier: tier,
        subscriptionPlan: plan,
        subscriptionStatus: updated.status,
      },
    });

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'subscription_upgraded',
      entityType: 'billing',
      entityId: firm.stripeSubscriptionId,
      metadata: { tier, plan },
    });

    res.json({ status: updated.status, tier, plan });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// 4. POST /cancel — cancel at period end
// ---------------------------------------------------------------------------
router.post('/cancel', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { firmId } = getTenantFilter(req);

    const firm = await prisma.firm.findUnique({ where: { id: firmId } });
    if (!firm?.stripeSubscriptionId) {
      res.status(400).json({ error: true, message: 'No active subscription to cancel' });
      return;
    }

    const cancelled = await billingService.cancelSubscription(firm.stripeSubscriptionId);

    await prisma.firm.update({
      where: { id: firmId },
      data: { subscriptionStatus: 'canceling' },
    });

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'subscription_cancelled',
      entityType: 'billing',
      entityId: firm.stripeSubscriptionId,
    });

    res.json({
      status: 'canceling',
      cancelAtPeriodEnd: cancelled.cancel_at_period_end,
      currentPeriodEnd: cancelled.current_period_end,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// 5. GET /history — invoice history
// ---------------------------------------------------------------------------
router.get('/history', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { firmId } = getTenantFilter(req);

    const firm = await prisma.firm.findUnique({ where: { id: firmId } });
    if (!firm?.stripeCustomerId) {
      res.json([]);
      return;
    }

    const invoices = await billingService.getInvoices(firm.stripeCustomerId);

    res.json(
      invoices.data.map((inv) => ({
        id: inv.id,
        number: inv.number,
        status: inv.status,
        amountDue: inv.amount_due,
        amountPaid: inv.amount_paid,
        currency: inv.currency,
        created: inv.created,
        periodStart: inv.period_start,
        periodEnd: inv.period_end,
        invoicePdf: inv.invoice_pdf,
        hostedInvoiceUrl: inv.hosted_invoice_url,
      })),
    );
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// 6. GET /publishable-key — Stripe publishable key for the frontend
// ---------------------------------------------------------------------------
router.get('/publishable-key', authenticate, (_req: Request, res: Response) => {
  res.json({ publishableKey: process.env.STRIPE_PUBLISHABLE_KEY });
});

// ---------------------------------------------------------------------------
// 7. POST /setup-intent — create SetupIntent for card collection
// ---------------------------------------------------------------------------
router.post('/setup-intent', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { firmId } = getTenantFilter(req);

    const firm = await prisma.firm.findUnique({ where: { id: firmId } });
    if (!firm?.stripeCustomerId) {
      res.status(400).json({ error: true, message: 'No Stripe customer on file' });
      return;
    }

    const intent = await billingService.createSetupIntent(firm.stripeCustomerId);
    res.json({ clientSecret: intent.client_secret });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// 8. GET /payment-methods — list saved payment methods
// ---------------------------------------------------------------------------
router.get('/payment-methods', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { firmId } = getTenantFilter(req);

    const firm = await prisma.firm.findUnique({ where: { id: firmId } });
    if (!firm?.stripeCustomerId) {
      res.json([]);
      return;
    }

    const methods = await billingService.getPaymentMethods(firm.stripeCustomerId);

    res.json(
      methods.data.map((pm) => ({
        id: pm.id,
        brand: pm.card?.brand,
        last4: pm.card?.last4,
        expMonth: pm.card?.exp_month,
        expYear: pm.card?.exp_year,
      })),
    );
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// 9. POST /payment-methods/default — set default payment method
// ---------------------------------------------------------------------------
router.post('/payment-methods/default', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { firmId } = getTenantFilter(req);
    const { paymentMethodId } = defaultPmSchema.parse(req.body);

    const firm = await prisma.firm.findUnique({ where: { id: firmId } });
    if (!firm?.stripeCustomerId) {
      res.status(400).json({ error: true, message: 'No Stripe customer on file' });
      return;
    }

    await billingService.setDefaultPaymentMethod(firm.stripeCustomerId, paymentMethodId);

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'default_payment_method_set',
      entityType: 'billing',
      entityId: paymentMethodId,
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// 10. DELETE /payment-methods/:pmId — detach a payment method
// ---------------------------------------------------------------------------
router.delete('/payment-methods/:pmId', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { firmId } = getTenantFilter(req);

    await billingService.deletePaymentMethod((req.params.pmId as string));

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'payment_method_deleted',
      entityType: 'billing',
      entityId: (req.params.pmId as string),
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// 11. GET /features — feature matrix for all tiers
// ---------------------------------------------------------------------------
router.get('/features', authenticate, (_req: Request, res: Response) => {
  res.json({
    tiers: FEATURE_MATRIX,
    limits: TIER_LIMITS,
  });
});

// ---------------------------------------------------------------------------
// 12. POST /webhooks/stripe — Stripe webhook (NO auth — uses signature)
// ---------------------------------------------------------------------------
export const stripeWebhookRouter = Router();

stripeWebhookRouter.post(
  '/webhooks/stripe',
  express.raw({ type: 'application/json' }),
  async (req: Request, res: Response) => {
    const sig = req.headers['stripe-signature'] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      logger.error('STRIPE_WEBHOOK_SECRET is not configured');
      res.status(500).json({ error: true, message: 'Webhook secret not configured' });
      return;
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      logger.warn('Stripe webhook signature verification failed', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      res.status(400).json({ error: true, message: 'Invalid signature' });
      return;
    }

    try {
      // Stripe webhooks identify the firm by stripeCustomerId, not by
      // an authenticated user. We have no firm context yet, so wrap the
      // entire dispatcher in bypass — the firm.updateMany calls below
      // need to write across the firms table without an auth-driven
      // tenant context. Audit reason captures the event type.
      await runWithBypass(`stripe webhook: ${event.type} (cross-firm by design)`, async () => {
      switch (event.type) {
        // ---- Subscription lifecycle ----
        case 'customer.subscription.created':
        case 'customer.subscription.updated': {
          const subscription = event.data.object as Stripe.Subscription;
          const customerId =
            typeof subscription.customer === 'string'
              ? subscription.customer
              : subscription.customer.id;

          await prisma.firm.updateMany({
            where: { stripeCustomerId: customerId },
            data: {
              stripeSubscriptionId: subscription.id,
              subscriptionStatus: subscription.cancel_at_period_end
                ? 'canceling'
                : subscription.status,
            },
          });

          logger.info('Subscription webhook processed', {
            type: event.type,
            subscriptionId: subscription.id,
            status: subscription.status,
          });
          break;
        }

        case 'customer.subscription.deleted': {
          const subscription = event.data.object as Stripe.Subscription;
          const customerId =
            typeof subscription.customer === 'string'
              ? subscription.customer
              : subscription.customer.id;

          await prisma.firm.updateMany({
            where: { stripeCustomerId: customerId },
            data: {
              subscriptionStatus: 'canceled',
              subscriptionTier: 'starter',
              subscriptionPlan: 'free',
              stripeSubscriptionId: null,
            },
          });

          logger.info('Subscription deleted via webhook', {
            subscriptionId: subscription.id,
          });
          break;
        }

        // ---- Invoice events ----
        case 'invoice.payment_succeeded': {
          const invoice = event.data.object as Stripe.Invoice;
          const customerId =
            typeof invoice.customer === 'string'
              ? invoice.customer
              : invoice.customer?.id;

          if (customerId) {
            await prisma.firm.updateMany({
              where: { stripeCustomerId: customerId },
              data: { subscriptionStatus: 'active' },
            });
          }

          logger.info('Invoice payment succeeded', { invoiceId: invoice.id });
          break;
        }

        case 'invoice.payment_failed': {
          const invoice = event.data.object as Stripe.Invoice;
          const customerId =
            typeof invoice.customer === 'string'
              ? invoice.customer
              : invoice.customer?.id;

          if (customerId) {
            await prisma.firm.updateMany({
              where: { stripeCustomerId: customerId },
              data: { subscriptionStatus: 'past_due' },
            });
          }

          logger.warn('Invoice payment failed', { invoiceId: invoice.id });
          break;
        }

        default:
          logger.debug('Unhandled Stripe event type', { type: event.type });
      }
      });

      res.json({ received: true });
    } catch (err) {
      logger.error('Error processing Stripe webhook', {
        type: event.type,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      res.status(500).json({ error: true, message: 'Webhook processing failed' });
    }
  },
);

export default router;
