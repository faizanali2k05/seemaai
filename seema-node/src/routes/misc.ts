import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { getTenantFilter } from '../middleware/tenant.js';
import { logAudit } from '../middleware/auditLogger.js';
import { z } from 'zod';

const router = Router();

// GET /onboarding/sra-lookup/:sraNumber — Look up SRA number (pass-through)
router.get('/onboarding/sra-lookup/:sraNumber', async (req: Request, res: Response) => {
  try {
    const { sraNumber } = req.params as Record<string, string>;

    // Validate format: 6 digits
    if (!/^\d{6}$/.test(sraNumber)) {
      res.status(400).json({ error: true, message: 'Invalid SRA number format. Must be 6 digits.' });
      return;
    }

    // Check if firm exists with this SRA number
    const firm = await prisma.firm.findUnique({
      where: { sraNumber },
      select: { id: true, name: true, sraNumber: true },
    });

    if (firm) {
      res.json({ found: true, firm });
    } else {
      res.json({ found: false, sraNumber });
    }
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to look up SRA number' });
  }
});

// POST /onboarding/complete — Complete onboarding
router.post('/onboarding/complete', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);

    await prisma.firm.update({
      where: { id: firmId },
      data: {
        onboardingStatus: 'completed',
        onboardingCompletedAt: new Date(),
      },
    });

    await logAudit({
      firmId,
      userId: req.user!.userId,
      action: 'onboarding_completed',
      entityType: 'firm',
      entityId: firmId,
    });

    res.json({ success: true, message: 'Onboarding completed' });
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to complete onboarding' });
  }
});

// POST /validation/sra-number — Validate SRA number format
router.post('/validation/sra-number', async (req: Request, res: Response) => {
  try {
    const { sraNumber } = req.body;

    if (!sraNumber) {
      res.status(400).json({ valid: false, message: 'SRA number is required' });
      return;
    }

    const isValid = /^\d{6}$/.test(sraNumber);
    res.json({ valid: isValid, sraNumber });
  } catch (err) {
    res.status(500).json({ error: true, message: 'Validation failed' });
  }
});

// POST /validation/email — Validate email format
router.post('/validation/email', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ valid: false, message: 'Email is required' });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isValid = emailRegex.test(email);
    res.json({ valid: isValid, email });
  } catch (err) {
    res.status(500).json({ error: true, message: 'Validation failed' });
  }
});

// GET /info — Return firm tier info
router.get('/info', authenticate, async (req: Request, res: Response) => {
  try {
    const { firmId } = getTenantFilter(req);
    const firm = await prisma.firm.findUnique({
      where: { id: firmId },
      select: {
        id: true,
        name: true,
        subscriptionTier: true,
        subscriptionPlan: true,
        subscriptionStatus: true,
        trialEndsAt: true,
      },
    });

    if (!firm) {
      res.status(404).json({ error: true, message: 'Firm not found' });
      return;
    }

    res.json(firm);
  } catch (err) {
    res.status(500).json({ error: true, message: 'Failed to fetch firm info' });
  }
});

export default router;
