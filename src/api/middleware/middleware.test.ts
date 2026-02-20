import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

// ================================================================
// Mocks — vi.hoisted ensures these are available when vi.mock runs
// ================================================================

const {
  mockGetUser,
  mockSingle,
  mockEq,
  mockSelect,
  mockFrom,
  mockCreateUserClient,
  mockExtractToken,
} = vi.hoisted(() => {
  const mockGetUser = vi.fn();
  const mockSingle = vi.fn();
  const mockEq = vi.fn(() => ({ single: mockSingle }));
  const mockSelect = vi.fn(() => ({ eq: mockEq }));
  const mockFrom = vi.fn(() => ({ select: mockSelect }));
  const mockCreateUserClient = vi.fn().mockReturnValue({ mock: 'userClient' });
  const mockExtractToken = vi.fn();
  return { mockGetUser, mockSingle, mockEq, mockSelect, mockFrom, mockCreateUserClient, mockExtractToken };
});

vi.mock('../../shared/utils/supabase.js', () => ({
  serviceClient: {
    auth: { getUser: mockGetUser },
    from: mockFrom,
  },
  createUserClient: mockCreateUserClient,
  extractToken: mockExtractToken,
}));

import { requireAuth, requireAdmin, type AuthenticatedRequest } from './auth.js';
import { validateBody } from './validate.js';

// ================================================================
// Helpers
// ================================================================

function mockReq(overrides: Record<string, unknown> = {}): Partial<Request> {
  return { headers: {}, body: {}, params: {}, query: {}, ...overrides };
}

function mockRes(): Partial<Response> & { statusCode: number; jsonData: unknown } {
  const res: Record<string, unknown> = { statusCode: 200, jsonData: null };
  res.status = vi.fn((code: number) => { res.statusCode = code; return res; });
  res.json = vi.fn((data: unknown) => { res.jsonData = data; return res; });
  return res as Partial<Response> & { statusCode: number; jsonData: unknown };
}

const fakeUser = { id: 'user-123', email: 'test@example.com' };

// ================================================================
// requireAuth
// ================================================================

describe('requireAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ------ Missing / invalid token ------

  it('returns 401 when no authorization header', async () => {
    mockExtractToken.mockReturnValue(null);
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    await requireAuth(req as Request, res as unknown as Response, next);

    expect(res.statusCode).toBe(401);
    expect(res.jsonData).toEqual({ error: 'Missing authorization token' });
  });

  it('returns 401 when authorization header does not start with Bearer', async () => {
    mockExtractToken.mockReturnValue(null);
    const req = mockReq({ headers: { authorization: 'Basic abc123' } });
    const res = mockRes();
    const next = vi.fn();

    await requireAuth(req as Request, res as unknown as Response, next);

    expect(res.statusCode).toBe(401);
    expect(res.jsonData).toEqual({ error: 'Missing authorization token' });
  });

  it('returns 401 when token is empty after Bearer', async () => {
    mockExtractToken.mockReturnValue(null);
    const req = mockReq({ headers: { authorization: 'Bearer ' } });
    const res = mockRes();
    const next = vi.fn();

    await requireAuth(req as Request, res as unknown as Response, next);

    expect(res.statusCode).toBe(401);
    expect(res.jsonData).toEqual({ error: 'Missing authorization token' });
  });

  it('handles undefined authorization header', async () => {
    mockExtractToken.mockReturnValue(null);
    const req = mockReq({ headers: {} });
    const res = mockRes();
    const next = vi.fn();

    await requireAuth(req as Request, res as unknown as Response, next);

    expect(res.statusCode).toBe(401);
    expect(res.jsonData).toEqual({ error: 'Missing authorization token' });
  });

  // ------ Token extraction delegation ------

  it('calls extractToken with the authorization header value', async () => {
    mockExtractToken.mockReturnValue('my-token');
    mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
    const req = mockReq({ headers: { authorization: 'Bearer my-token' } });
    const res = mockRes();
    const next = vi.fn();

    await requireAuth(req as Request, res as unknown as Response, next);

    expect(mockExtractToken).toHaveBeenCalledWith('Bearer my-token');
  });

  // ------ getUser failures ------

  it('returns 401 when getUser returns error', async () => {
    mockExtractToken.mockReturnValue('bad-token');
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: new Error('Token expired'),
    });
    const req = mockReq({ headers: { authorization: 'Bearer bad-token' } });
    const res = mockRes();
    const next = vi.fn();

    await requireAuth(req as Request, res as unknown as Response, next);

    expect(res.statusCode).toBe(401);
    expect(res.jsonData).toEqual({ error: 'Invalid token' });
  });

  it('returns 401 when getUser returns null user', async () => {
    mockExtractToken.mockReturnValue('orphan-token');
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });
    const req = mockReq({ headers: { authorization: 'Bearer orphan-token' } });
    const res = mockRes();
    const next = vi.fn();

    await requireAuth(req as Request, res as unknown as Response, next);

    expect(res.statusCode).toBe(401);
    expect(res.jsonData).toEqual({ error: 'Invalid token' });
  });

  it('returns 401 when getUser returns no user and no error', async () => {
    mockExtractToken.mockReturnValue('empty-token');
    mockGetUser.mockResolvedValue({
      data: { user: undefined },
      error: undefined,
    });
    const req = mockReq({ headers: { authorization: 'Bearer empty-token' } });
    const res = mockRes();
    const next = vi.fn();

    await requireAuth(req as Request, res as unknown as Response, next);

    expect(res.statusCode).toBe(401);
    expect(res.jsonData).toEqual({ error: 'Invalid token' });
  });

  it('returns 401 when getUser throws an exception', async () => {
    mockExtractToken.mockReturnValue('crash-token');
    mockGetUser.mockRejectedValue(new Error('Network error'));
    const req = mockReq({ headers: { authorization: 'Bearer crash-token' } });
    const res = mockRes();
    const next = vi.fn();

    await requireAuth(req as Request, res as unknown as Response, next);

    expect(res.statusCode).toBe(401);
    expect(res.jsonData).toEqual({ error: 'Invalid token' });
  });

  // ------ Success path ------

  it('calls serviceClient.auth.getUser with extracted token', async () => {
    mockExtractToken.mockReturnValue('valid-token');
    mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
    const req = mockReq({ headers: { authorization: 'Bearer valid-token' } });
    const res = mockRes();
    const next = vi.fn();

    await requireAuth(req as Request, res as unknown as Response, next);

    expect(mockGetUser).toHaveBeenCalledWith('valid-token');
  });

  it('attaches user to request on success', async () => {
    mockExtractToken.mockReturnValue('valid-token');
    mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
    const req = mockReq({ headers: { authorization: 'Bearer valid-token' } });
    const res = mockRes();
    const next = vi.fn();

    await requireAuth(req as Request, res as unknown as Response, next);

    expect((req as AuthenticatedRequest).user).toBe(fakeUser);
  });

  it('attaches userClient to request on success (calls createUserClient)', async () => {
    mockExtractToken.mockReturnValue('valid-token');
    mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
    const req = mockReq({ headers: { authorization: 'Bearer valid-token' } });
    const res = mockRes();
    const next = vi.fn();

    await requireAuth(req as Request, res as unknown as Response, next);

    expect(mockCreateUserClient).toHaveBeenCalledWith('valid-token');
    expect((req as AuthenticatedRequest).userClient).toEqual({ mock: 'userClient' });
  });

  it('calls next() on success', async () => {
    mockExtractToken.mockReturnValue('valid-token');
    mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
    const req = mockReq({ headers: { authorization: 'Bearer valid-token' } });
    const res = mockRes();
    const next = vi.fn();

    await requireAuth(req as Request, res as unknown as Response, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('does NOT call next() on failure (missing token)', async () => {
    mockExtractToken.mockReturnValue(null);
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    await requireAuth(req as Request, res as unknown as Response, next);

    expect(next).not.toHaveBeenCalled();
  });

  it('does NOT call next() on failure (invalid token)', async () => {
    mockExtractToken.mockReturnValue('bad-token');
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: new Error('bad'),
    });
    const req = mockReq({ headers: { authorization: 'Bearer bad-token' } });
    const res = mockRes();
    const next = vi.fn();

    await requireAuth(req as Request, res as unknown as Response, next);

    expect(next).not.toHaveBeenCalled();
  });

  it('does NOT call next() on failure (exception thrown)', async () => {
    mockExtractToken.mockReturnValue('crash-token');
    mockGetUser.mockRejectedValue(new Error('Network failure'));
    const req = mockReq({ headers: { authorization: 'Bearer crash-token' } });
    const res = mockRes();
    const next = vi.fn();

    await requireAuth(req as Request, res as unknown as Response, next);

    expect(next).not.toHaveBeenCalled();
  });

  it('works with valid Bearer token format', async () => {
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.sig';
    mockExtractToken.mockReturnValue(token);
    mockGetUser.mockResolvedValue({ data: { user: fakeUser }, error: null });
    const req = mockReq({ headers: { authorization: `Bearer ${token}` } });
    const res = mockRes();
    const next = vi.fn();

    await requireAuth(req as Request, res as unknown as Response, next);

    expect(next).toHaveBeenCalled();
    expect((req as AuthenticatedRequest).user).toBe(fakeUser);
  });
});

// ================================================================
// requireAdmin
// ================================================================

describe('requireAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when no user on request', async () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    await requireAdmin(req as Request, res as unknown as Response, next);

    expect(res.statusCode).toBe(401);
    expect(res.jsonData).toEqual({ error: 'Not authenticated' });
  });

  it('queries aio_profiles for is_admin', async () => {
    const req = mockReq() as AuthenticatedRequest;
    req.user = fakeUser as AuthenticatedRequest['user'];
    mockSingle.mockResolvedValue({ data: { is_admin: true }, error: null });
    const res = mockRes();
    const next = vi.fn();

    await requireAdmin(req as Request, res as unknown as Response, next);

    expect(mockFrom).toHaveBeenCalledWith('aio_profiles');
    expect(mockSelect).toHaveBeenCalledWith('is_admin');
  });

  it('uses user.id for the query', async () => {
    const req = mockReq() as AuthenticatedRequest;
    req.user = fakeUser as AuthenticatedRequest['user'];
    mockSingle.mockResolvedValue({ data: { is_admin: true }, error: null });
    const res = mockRes();
    const next = vi.fn();

    await requireAdmin(req as Request, res as unknown as Response, next);

    expect(mockEq).toHaveBeenCalledWith('id', 'user-123');
  });

  it('returns 403 when profile not found (null)', async () => {
    const req = mockReq() as AuthenticatedRequest;
    req.user = fakeUser as AuthenticatedRequest['user'];
    mockSingle.mockResolvedValue({ data: null, error: null });
    const res = mockRes();
    const next = vi.fn();

    await requireAdmin(req as Request, res as unknown as Response, next);

    expect(res.statusCode).toBe(403);
    expect(res.jsonData).toEqual({ error: 'Admin access required' });
  });

  it('returns 403 when is_admin is false', async () => {
    const req = mockReq() as AuthenticatedRequest;
    req.user = fakeUser as AuthenticatedRequest['user'];
    mockSingle.mockResolvedValue({ data: { is_admin: false }, error: null });
    const res = mockRes();
    const next = vi.fn();

    await requireAdmin(req as Request, res as unknown as Response, next);

    expect(res.statusCode).toBe(403);
    expect(res.jsonData).toEqual({ error: 'Admin access required' });
  });

  it('returns 403 when is_admin is null', async () => {
    const req = mockReq() as AuthenticatedRequest;
    req.user = fakeUser as AuthenticatedRequest['user'];
    mockSingle.mockResolvedValue({ data: { is_admin: null }, error: null });
    const res = mockRes();
    const next = vi.fn();

    await requireAdmin(req as Request, res as unknown as Response, next);

    expect(res.statusCode).toBe(403);
    expect(res.jsonData).toEqual({ error: 'Admin access required' });
  });

  it('returns 403 when is_admin is undefined', async () => {
    const req = mockReq() as AuthenticatedRequest;
    req.user = fakeUser as AuthenticatedRequest['user'];
    mockSingle.mockResolvedValue({ data: { is_admin: undefined }, error: null });
    const res = mockRes();
    const next = vi.fn();

    await requireAdmin(req as Request, res as unknown as Response, next);

    expect(res.statusCode).toBe(403);
    expect(res.jsonData).toEqual({ error: 'Admin access required' });
  });

  it('calls next() when is_admin is true', async () => {
    const req = mockReq() as AuthenticatedRequest;
    req.user = fakeUser as AuthenticatedRequest['user'];
    mockSingle.mockResolvedValue({ data: { is_admin: true }, error: null });
    const res = mockRes();
    const next = vi.fn();

    await requireAdmin(req as Request, res as unknown as Response, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('returns 403 when Supabase query throws', async () => {
    const req = mockReq() as AuthenticatedRequest;
    req.user = fakeUser as AuthenticatedRequest['user'];
    mockSingle.mockRejectedValue(new Error('DB connection lost'));
    const res = mockRes();
    const next = vi.fn();

    await requireAdmin(req as Request, res as unknown as Response, next);

    expect(res.statusCode).toBe(403);
    expect(res.jsonData).toEqual({ error: 'Admin access required' });
  });

  it('does NOT call next() on failure (not admin)', async () => {
    const req = mockReq() as AuthenticatedRequest;
    req.user = fakeUser as AuthenticatedRequest['user'];
    mockSingle.mockResolvedValue({ data: { is_admin: false }, error: null });
    const res = mockRes();
    const next = vi.fn();

    await requireAdmin(req as Request, res as unknown as Response, next);

    expect(next).not.toHaveBeenCalled();
  });

  it('does NOT call next() on failure (no user)', async () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    await requireAdmin(req as Request, res as unknown as Response, next);

    expect(next).not.toHaveBeenCalled();
  });

  it('does NOT call next() on failure (query throws)', async () => {
    const req = mockReq() as AuthenticatedRequest;
    req.user = fakeUser as AuthenticatedRequest['user'];
    mockSingle.mockRejectedValue(new Error('DB error'));
    const res = mockRes();
    const next = vi.fn();

    await requireAdmin(req as Request, res as unknown as Response, next);

    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when from() chain returns error', async () => {
    const req = mockReq() as AuthenticatedRequest;
    req.user = fakeUser as AuthenticatedRequest['user'];
    mockSingle.mockResolvedValue({ data: null, error: new Error('RLS violation') });
    const res = mockRes();
    const next = vi.fn();

    await requireAdmin(req as Request, res as unknown as Response, next);

    expect(res.statusCode).toBe(403);
    expect(res.jsonData).toEqual({ error: 'Admin access required' });
  });

  it('calls single() for single-row result', async () => {
    const req = mockReq() as AuthenticatedRequest;
    req.user = fakeUser as AuthenticatedRequest['user'];
    mockSingle.mockResolvedValue({ data: { is_admin: true }, error: null });
    const res = mockRes();
    const next = vi.fn();

    await requireAdmin(req as Request, res as unknown as Response, next);

    expect(mockSingle).toHaveBeenCalledOnce();
  });
});

// ================================================================
// validateBody
// ================================================================

describe('validateBody', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a function (middleware factory pattern)', () => {
    const schema = z.object({ name: z.string() });
    const middleware = validateBody(schema);

    expect(typeof middleware).toBe('function');
  });

  it('calls next() when body is valid', () => {
    const schema = z.object({ name: z.string() });
    const middleware = validateBody(schema);
    const req = mockReq({ body: { name: 'Alice' } });
    const res = mockRes();
    const next = vi.fn();

    middleware(req as Request, res as unknown as Response, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('replaces req.body with parsed data', () => {
    const schema = z.object({ name: z.string(), age: z.number().optional() });
    const middleware = validateBody(schema);
    const req = mockReq({ body: { name: 'Alice', extraField: 'ignored' } });
    const res = mockRes();
    const next = vi.fn();

    middleware(req as Request, res as unknown as Response, next);

    // Zod strips unknown keys by default
    expect(req.body).toEqual({ name: 'Alice' });
    expect((req.body as Record<string, unknown>).extraField).toBeUndefined();
  });

  it('returns 400 when body is invalid', () => {
    const schema = z.object({ name: z.string() });
    const middleware = validateBody(schema);
    const req = mockReq({ body: { name: 123 } });
    const res = mockRes();
    const next = vi.fn();

    middleware(req as Request, res as unknown as Response, next);

    expect(res.statusCode).toBe(400);
    expect(res.jsonData).toHaveProperty('error');
    expect(next).not.toHaveBeenCalled();
  });

  it('includes path in error message when path exists', () => {
    const schema = z.object({ user: z.object({ email: z.string().email() }) });
    const middleware = validateBody(schema);
    const req = mockReq({ body: { user: { email: 'not-an-email' } } });
    const res = mockRes();
    const next = vi.fn();

    middleware(req as Request, res as unknown as Response, next);

    expect(res.statusCode).toBe(400);
    const error = (res.jsonData as { error: string }).error;
    expect(error).toContain('user.email:');
  });

  it('omits path prefix when error has no path', () => {
    // A string schema directly on the body has no path
    const schema = z.string();
    const middleware = validateBody(schema);
    const req = mockReq({ body: 12345 });
    const res = mockRes();
    const next = vi.fn();

    middleware(req as Request, res as unknown as Response, next);

    expect(res.statusCode).toBe(400);
    const error = (res.jsonData as { error: string }).error;
    // Should NOT contain a path prefix (no ":" at the start)
    expect(error).not.toMatch(/^\S+:/);
  });

  it('returns first error when multiple errors exist', () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
    });
    const middleware = validateBody(schema);
    const req = mockReq({ body: { name: 123, age: 'not-a-number' } });
    const res = mockRes();
    const next = vi.fn();

    middleware(req as Request, res as unknown as Response, next);

    expect(res.statusCode).toBe(400);
    // Should only contain one error, not multiple
    const error = (res.jsonData as { error: string }).error;
    expect(typeof error).toBe('string');
    expect(error.length).toBeGreaterThan(0);
  });

  it('works with nested object schemas', () => {
    const schema = z.object({
      profile: z.object({
        name: z.string(),
        settings: z.object({
          theme: z.enum(['light', 'dark']),
        }),
      }),
    });
    const middleware = validateBody(schema);
    const req = mockReq({
      body: { profile: { name: 'Alice', settings: { theme: 'dark' } } },
    });
    const res = mockRes();
    const next = vi.fn();

    middleware(req as Request, res as unknown as Response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.body).toEqual({
      profile: { name: 'Alice', settings: { theme: 'dark' } },
    });
  });

  it('works with string schemas', () => {
    const schema = z.string().min(3);
    const middleware = validateBody(schema);

    // Valid
    const req1 = mockReq({ body: 'hello' });
    const res1 = mockRes();
    const next1 = vi.fn();
    middleware(req1 as Request, res1 as unknown as Response, next1);
    expect(next1).toHaveBeenCalled();

    // Invalid (too short)
    const req2 = mockReq({ body: 'ab' });
    const res2 = mockRes();
    const next2 = vi.fn();
    middleware(req2 as Request, res2 as unknown as Response, next2);
    expect(res2.statusCode).toBe(400);
  });

  it('works with number schemas', () => {
    const schema = z.number().min(0).max(100);
    const middleware = validateBody(schema);

    // Valid
    const req1 = mockReq({ body: 50 });
    const res1 = mockRes();
    const next1 = vi.fn();
    middleware(req1 as Request, res1 as unknown as Response, next1);
    expect(next1).toHaveBeenCalled();

    // Invalid (out of range)
    const req2 = mockReq({ body: 200 });
    const res2 = mockRes();
    const next2 = vi.fn();
    middleware(req2 as Request, res2 as unknown as Response, next2);
    expect(res2.statusCode).toBe(400);
  });

  it('does NOT call next() when validation fails', () => {
    const schema = z.object({ required_field: z.string() });
    const middleware = validateBody(schema);
    const req = mockReq({ body: {} });
    const res = mockRes();
    const next = vi.fn();

    middleware(req as Request, res as unknown as Response, next);

    expect(next).not.toHaveBeenCalled();
  });
});
