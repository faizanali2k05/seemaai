import axios, { AxiosInstance, AxiosRequestConfig, Method } from 'axios';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma.js';
import logger from '../utils/logger.js';

const CLIO_API_BASE = process.env.CLIO_API_BASE || 'https://app.clio.com';
const CLIO_API_VERSION = process.env.CLIO_API_VERSION || 'v4';
const CLIO_CLIENT_ID = process.env.CLIO_CLIENT_ID!;
const CLIO_CLIENT_SECRET = process.env.CLIO_CLIENT_SECRET!;
const CLIO_REDIRECT_URI = process.env.CLIO_REDIRECT_URI!;

// ---------------------------------------------------------------------------
// ClioClient — wraps the Clio REST API with automatic token refresh
// ---------------------------------------------------------------------------

export class ClioClient {
  private accessToken: string;
  private refreshToken: string;
  private firmId: string;
  private tokenExpiresAt: Date | null = null;
  private http: AxiosInstance;

  constructor(accessToken: string, refreshToken: string, firmId: string, tokenExpiresAt?: Date | null) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.firmId = firmId;
    this.tokenExpiresAt = tokenExpiresAt ?? null;

    this.http = axios.create({
      baseURL: `${CLIO_API_BASE}/api/${CLIO_API_VERSION}`,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ---- Token management ---------------------------------------------------

  private isTokenExpired(): boolean {
    if (!this.tokenExpiresAt) return true;
    // Refresh 60 seconds before actual expiry to avoid race conditions
    return new Date() >= new Date(this.tokenExpiresAt.getTime() - 60_000);
  }

  private async _ensureValidToken(): Promise<void> {
    if (!this.isTokenExpired()) return;

    logger.info('Clio token expired — refreshing', { firmId: this.firmId });

    try {
      const { data } = await axios.post(`${CLIO_API_BASE}/oauth/token`, {
        grant_type: 'refresh_token',
        client_id: CLIO_CLIENT_ID,
        client_secret: CLIO_CLIENT_SECRET,
        refresh_token: this.refreshToken,
        redirect_uri: CLIO_REDIRECT_URI,
      });

      this.accessToken = data.access_token;
      this.refreshToken = data.refresh_token ?? this.refreshToken;
      this.tokenExpiresAt = new Date(Date.now() + data.expires_in * 1000);

      // Persist refreshed tokens in the Integration record
      await prisma.integration.updateMany({
        where: { firmId: this.firmId, provider: 'clio' },
        data: {
          accessToken: this.accessToken,
          refreshToken: this.refreshToken,
          tokenExpiresAt: this.tokenExpiresAt,
          updatedAt: new Date(),
        },
      });

      logger.info('Clio token refreshed successfully', { firmId: this.firmId });
    } catch (err) {
      logger.error('Failed to refresh Clio token', {
        firmId: this.firmId,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw new Error('Failed to refresh Clio access token');
    }
  }

  // ---- Generic request helper --------------------------------------------

  async _request<T = any>(method: Method, path: string, data?: any): Promise<T> {
    await this._ensureValidToken();

    const config: AxiosRequestConfig = {
      method,
      url: path,
      headers: { Authorization: `Bearer ${this.accessToken}` },
    };

    if (data) {
      if (method.toUpperCase() === 'GET') {
        config.params = data;
      } else {
        config.data = data;
      }
    }

    try {
      const response = await this.http.request<T>(config);
      return response.data;
    } catch (err: any) {
      // On 401, attempt one token refresh and retry
      if (err?.response?.status === 401) {
        logger.warn('Clio API returned 401 — attempting token refresh', { firmId: this.firmId });
        this.tokenExpiresAt = null; // force refresh
        await this._ensureValidToken();
        config.headers = { Authorization: `Bearer ${this.accessToken}` };
        const response = await this.http.request<T>(config);
        return response.data;
      }
      throw err;
    }
  }

  // ---- Clio resource endpoints -------------------------------------------

  async getMatters(cursor?: string): Promise<any> {
    const params: Record<string, string> = { fields: 'id,display_number,description,status,client,practice_area,open_date,close_date' };
    if (cursor) params.cursor = cursor;
    return this._request('GET', '/matters.json', params);
  }

  async getContacts(cursor?: string): Promise<any> {
    const params: Record<string, string> = { fields: 'id,name,first_name,last_name,type,email_addresses,phone_numbers,addresses' };
    if (cursor) params.cursor = cursor;
    return this._request('GET', '/contacts.json', params);
  }

  async getStaff(cursor?: string): Promise<any> {
    const params: Record<string, string> = { fields: 'id,name,first_name,last_name,email,role,enabled' };
    if (cursor) params.cursor = cursor;
    return this._request('GET', '/users.json', params);
  }

  // ---- Pagination helper -------------------------------------------------

  async getAllPages<T>(fetchFn: (cursor?: string) => Promise<any>): Promise<T[]> {
    const allRecords: T[] = [];
    let cursor: string | undefined;

    do {
      const response = await fetchFn(cursor);
      const data: T[] = response.data ?? [];
      allRecords.push(...data);

      // Clio returns paging.next as the cursor URL for the next page
      const nextUrl: string | null = response?.meta?.paging?.next ?? null;
      if (nextUrl) {
        const url = new URL(nextUrl, CLIO_API_BASE);
        cursor = url.searchParams.get('cursor') ?? undefined;
      } else {
        cursor = undefined;
      }
    } while (cursor);

    return allRecords;
  }
}

// ---------------------------------------------------------------------------
// ClioSyncEngine — fetches all data from Clio and upserts into local DB
// ---------------------------------------------------------------------------

export class ClioSyncEngine {
  async sync(firmId: string): Promise<{ recordsSynced: number; errors: string[] }> {
    const syncStart = new Date();
    const errors: string[] = [];
    let recordsSynced = 0;

    // 1. Load Integration record
    const integration = await prisma.integration.findFirst({
      where: { firmId, provider: 'clio', status: 'active' },
    });

    if (!integration) {
      throw new Error(`No active Clio integration found for firm ${firmId}`);
    }

    if (!integration.accessToken || !integration.refreshToken) {
      throw new Error(`Clio integration for firm ${firmId} is missing access or refresh token`);
    }

    const client = new ClioClient(
      integration.accessToken,
      integration.refreshToken,
      firmId,
      integration.tokenExpiresAt ? new Date(integration.tokenExpiresAt) : null,
    );

    // 2. Fetch all pages for each resource
    let matters: any[] = [];
    let contacts: any[] = [];
    let staff: any[] = [];

    try {
      matters = await client.getAllPages((c) => client.getMatters(c));
      logger.info(`Fetched ${matters.length} matters from Clio`, { firmId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      errors.push(`matters: ${msg}`);
      logger.error('Failed to fetch Clio matters', { firmId, error: msg });
    }

    try {
      contacts = await client.getAllPages((c) => client.getContacts(c));
      logger.info(`Fetched ${contacts.length} contacts from Clio`, { firmId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      errors.push(`contacts: ${msg}`);
      logger.error('Failed to fetch Clio contacts', { firmId, error: msg });
    }

    try {
      staff = await client.getAllPages((c) => client.getStaff(c));
      logger.info(`Fetched ${staff.length} staff from Clio`, { firmId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      errors.push(`staff: ${msg}`);
      logger.error('Failed to fetch Clio staff', { firmId, error: msg });
    }

    // 3. Upsert matters
    for (const m of matters) {
      try {
        const externalRef = `clio-matter-${m.id}`;
        const existingMatter = await prisma.matter.findFirst({
          where: { firmId, externalRef },
        });

        if (existingMatter) {
          await prisma.matter.update({
            where: { id: existingMatter.id },
            data: {
              title: m.description || 'Untitled Matter',
              clientName: m.client?.name || 'Unknown',
              matterType: m.practice_area?.name || 'General',
              practiceArea: m.practice_area?.name || 'General',
              status: m.status === 'Open' ? 'open' : 'closed',
            },
          });
        } else {
          await prisma.matter.create({
            data: {
              id: uuidv4(),
              firmId,
              externalRef,
              source: 'clio',
              reference: m.display_number || `CLIO-${m.id}`,
              title: m.description || 'Untitled Matter',
              clientName: m.client?.name || 'Unknown',
              matterType: m.practice_area?.name || 'General',
              practiceArea: m.practice_area?.name || 'General',
              status: m.status === 'Open' ? 'open' : 'closed',
              openDate: m.open_date || new Date().toISOString().split('T')[0],
            },
          });
        }
        recordsSynced++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        errors.push(`matter ${m.id}: ${msg}`);
      }
    }

    // 4. Upsert contacts as client intakes
    for (const c of contacts) {
      try {
        const externalRef = `clio-contact-${c.id}`;
        const primaryEmail = c.email_addresses?.[0]?.address || null;
        const primaryPhone = c.phone_numbers?.[0]?.number || null;
        const contactName = c.name || `${c.first_name || ''} ${c.last_name || ''}`.trim();

        const existingIntake = await prisma.clientIntake.findFirst({
          where: { firmId, externalRef },
        });

        if (existingIntake) {
          await prisma.clientIntake.update({
            where: { id: existingIntake.id },
            data: {
              clientName: contactName,
              clientEmail: primaryEmail,
              clientPhone: primaryPhone,
            },
          });
        } else {
          await prisma.clientIntake.create({
            data: {
              id: uuidv4(),
              firmId,
              externalRef,
              source: 'clio',
              clientName: contactName,
              clientEmail: primaryEmail,
              clientPhone: primaryPhone,
              status: 'approved',
            },
          });
        }
        recordsSynced++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        errors.push(`contact ${c.id}: ${msg}`);
      }
    }

    // 5. Upsert staff
    for (const s of staff) {
      try {
        const externalRef = `clio-user-${s.id}`;
        const staffName = s.name || `${s.first_name || ''} ${s.last_name || ''}`.trim();

        const existingStaff = await prisma.staffMember.findFirst({
          where: { firmId, externalRef },
        });

        if (existingStaff) {
          await prisma.staffMember.update({
            where: { id: existingStaff.id },
            data: {
              name: staffName,
              email: s.email || null,
              role: s.role || 'staff',
              source: 'clio',
            },
          });
        } else {
          await prisma.staffMember.create({
            data: {
              id: uuidv4(),
              firmId,
              externalRef,
              source: 'clio',
              name: staffName,
              email: s.email || null,
              role: s.role || 'staff',
            },
          });
        }
        recordsSynced++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        errors.push(`staff ${s.id}: ${msg}`);
      }
    }

    // 6. Create sync log
    const syncEnd = new Date();
    const durationSeconds = Math.round((syncEnd.getTime() - syncStart.getTime()) / 1000);
    const syncStatus = errors.length === 0 ? 'success' : (recordsSynced > 0 ? 'partial' : 'failed');

    await prisma.integrationSyncLog.create({
      data: {
        firmId,
        integrationId: integration.id,
        syncType: 'full',
        status: syncStatus,
        direction: 'inbound',
        recordsSynced,
        recordsCreated: recordsSynced, // approximation; could track separately
        recordsUpdated: 0,
        recordsSkipped: 0,
        recordsErrored: errors.length,
        startedAt: syncStart,
        completedAt: syncEnd,
        durationSeconds,
        errorMessage: errors.length > 0 ? errors.join('; ') : null,
        errorDetails: errors.length > 0 ? JSON.stringify(errors) : null,
      },
    });

    logger.info('Clio sync completed', { firmId, recordsSynced, errorCount: errors.length, status: syncStatus });

    return { recordsSynced, errors };
  }
}
