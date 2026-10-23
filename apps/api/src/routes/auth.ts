import { Router } from 'express';
import { z } from 'zod';
import { requireActiveActor } from '../http/auth.js';
import { ApiError, parseRequest } from '../http/errors.js';
import { StorageError } from '../storage/repositories.js';

export const sessionCookieName = '__session';

const registrationCommon = {
  name: z
    .string({ error: 'Full name is required.' })
    .trim()
    .min(1, 'Full name is required.')
    .max(120, 'Full name must be 120 characters or fewer.'),
  email: z
    .string({ error: 'Email address is required.' })
    .trim()
    .email('Enter a valid email address.')
    .max(320, 'Email address must be 320 characters or fewer.'),
  password: z
    .string({ error: 'Password is required.' })
    .max(1024, 'Password must be no more than 1024 characters.')
    .refine((value) => Array.from(value).length >= 8, 'Password must be at least 8 characters.')
    .refine((value) => !/\p{White_Space}/u.test(value), 'Password must not contain whitespace.'),
  confirmPassword: z
    .string({ error: 'Please enter the confirmation password.' })
    .min(1, 'Please enter the confirmation password.')
    .max(1024, 'Confirmation password must be no more than 1024 characters.'),
};

const registrationSchema = z
  .discriminatedUnion(
    'accountType',
    [
      z.object({ ...registrationCommon, accountType: z.literal('MEMBER') }).strict(),
      z
        .object({
          ...registrationCommon,
          accountType: z.literal('LIBRARIAN'),
          employeeId: z
            .string({ error: 'Employee ID is required.' })
            .trim()
            .min(1, 'Employee ID is required.')
            .max(128, 'Employee ID must be 128 characters or fewer.'),
        })
        .strict(),
    ],
    { error: 'Select Member or Librarian as the account type.' },
  )
  .superRefine((input, context) => {
    if (input.password !== input.confirmPassword) {
      context.addIssue({
        code: 'custom',
        path: ['confirmPassword'],
        message: 'Confirmation password must match the password.',
      });
    }
  });

const loginSchema = z
  .object({
    accountType: z.enum(['MEMBER', 'LIBRARIAN']),
    email: z.string().trim().email().max(320),
    password: z.string().min(1).max(1024),
  })
  .strict();

function accountSummary(user: any) {
  return {
    userId: user.userId,
    name: user.name,
    email: user.email,
    accountType: user.accountType,
    accountStatus: user.accountStatus,
    ...(user.memberId ? { memberId: user.memberId } : {}),
    ...(user.employeeId ? { employeeId: user.employeeId } : {}),
    ...(user.accountType === 'LIBRARIAN' ? { isManager: user.isManager === true } : {}),
  };
}

function regenerateSession(request: any): Promise<void> {
  return new Promise((resolve, reject) => {
    request.session.regenerate((error: Error | null) => (error ? reject(error) : resolve()));
  });
}

function saveSession(request: any): Promise<void> {
  return new Promise((resolve, reject) => {
    request.session.save((error: Error | null) => (error ? reject(error) : resolve()));
  });
}

function destroySession(request: any): Promise<void> {
  return new Promise((resolve, reject) => {
    request.session.destroy((error: Error | null) => (error ? reject(error) : resolve()));
  });
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character] ?? character,
  );
}

function renderRegistrationFailure(body: any, messages: string[], clientOrigin: string): string {
  const submittedType = body && typeof body === 'object' ? body.accountType : undefined;
  const isMember = submittedType === 'MEMBER';
  const isLibrarian = submittedType === 'LIBRARIAN';
  const value = (key: string, applies: boolean) =>
    applies && typeof body?.[key] === 'string' ? escapeHtml(body[key]) : '';
  const registrationAction = escapeHtml(`${clientOrigin}/api/v1/auth/register`);
  const stylesheet = escapeHtml(`${clientOrigin}/auth-static.css`);
  const errorList = messages.map((message) => `<li>${escapeHtml(message)}</li>`).join('');
  const memberName = value('name', isMember);
  const memberEmail = value('email', isMember);
  const librarianName = value('name', isLibrarian);
  const librarianEmail = value('email', isLibrarian);
  const employeeId = value('employeeId', isLibrarian);

  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Registration needs attention · LibConnect</title><link rel="stylesheet" href="${stylesheet}"></head>
<body><main><p class="brand">▰ LibConnect</p><h1>Unable to create account</h1><div class="notice error" role="alert"><ul>${errorList}</ul></div>
<p class="muted">Correct the details below and submit the form again. Password fields have been cleared.</p>
<section><h2>Member account</h2><form method="post" action="${registrationAction}" accept-charset="UTF-8"><input type="hidden" name="accountType" value="MEMBER">
<label class="field">Full name<input name="name" autocomplete="name" required maxlength="120" value="${memberName}"></label>
<label class="field">Email address<input name="email" type="email" autocomplete="email" required maxlength="320" value="${memberEmail}"></label>
<label class="field">Password<input name="password" type="password" autocomplete="new-password" required minlength="8" maxlength="1024" pattern="[^\\s]+" title="Password must not contain whitespace."></label>
<label class="field">Confirm password<input name="confirmPassword" type="password" autocomplete="new-password" required maxlength="1024"></label><button type="submit">Create member account</button></form></section>
<section><h2>Librarian account</h2><p class="muted">A manager must activate a librarian account before sign-in.</p><form method="post" action="${registrationAction}" accept-charset="UTF-8"><input type="hidden" name="accountType" value="LIBRARIAN">
<label class="field">Full name<input name="name" autocomplete="name" required maxlength="120" value="${librarianName}"></label>
<label class="field">Email address<input name="email" type="email" autocomplete="email" required maxlength="320" value="${librarianEmail}"></label>
<label class="field">Employee ID<input name="employeeId" required maxlength="128" value="${employeeId}"></label>
<label class="field">Password<input name="password" type="password" autocomplete="new-password" required minlength="8" maxlength="1024" pattern="[^\\s]+" title="Password must not contain whitespace."></label>
<label class="field">Confirm password<input name="confirmPassword" type="password" autocomplete="new-password" required maxlength="1024"></label><button type="submit">Apply for librarian account</button></form></section>
<p class="muted"><a href="${escapeHtml(`${clientOrigin}/register.html`)}">Open the registration page</a></p></main></body></html>`;
}

function validationMessages(error: ApiError): string[] {
  const messages = Object.values(error.fields ?? {}).filter(
    (value): value is string => typeof value === 'string',
  );
  return messages.length ? messages : [error.message];
}

export function createAuthRouter(
  accounts: any,
  users: any,
  cookieOptions: Record<string, unknown>,
  clientOrigin: string,
) {
  const router = Router();
  const requireActor = requireActiveActor(users);
  router.use((_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });

  const isHtmlForm = (request: any) =>
    request.is('application/x-www-form-urlencoded') && request.accepts('html') === 'html';
  const redirectForm = (response: any, location: string) =>
    response.redirect(303, `${clientOrigin}${location}`);

  router.post('/register', async (request, response) => {
    const htmlForm = isHtmlForm(request);
    let input;
    try {
      input = parseRequest(registrationSchema, request.body);
      const { confirmPassword: _confirmPassword, ...accountInput } = input;
      const user = await accounts.register(accountInput);
      if (htmlForm) {
        return redirectForm(response, '/login.html');
      }
      return response.status(201).json({ user: accountSummary(user) });
    } catch (error) {
      if (error instanceof StorageError && error.code === 'CONFLICT') {
        if (htmlForm) {
          return response
            .status(409)
            .type('html')
            .send(
              renderRegistrationFailure(
                request.body,
                ['Email address or employee ID is already in use.'],
                clientOrigin,
              ),
            );
        }
        throw new ApiError(409, 'CONFLICT', 'Email address or employee ID is already in use.');
      }
      if (htmlForm && error instanceof ApiError) {
        const status = error.code === 'VALIDATION_ERROR' ? error.status : 500;
        const messages =
          error.code === 'VALIDATION_ERROR'
            ? validationMessages(error)
            : ['Registration could not be completed. Please try again.'];
        return response
          .status(status)
          .type('html')
          .send(renderRegistrationFailure(request.body, messages, clientOrigin));
      }
      if (htmlForm) {
        return response
          .status(500)
          .type('html')
          .send(
            renderRegistrationFailure(
              request.body,
              ['Registration could not be completed. Please try again.'],
              clientOrigin,
            ),
          );
      }
      throw error;
    }
  });

  router.post('/login', async (request, response) => {
    const htmlForm = isHtmlForm(request);
    let input;
    let user;
    try {
      input = parseRequest(loginSchema, request.body);
      user = await accounts.authenticate({
        email: input.email,
        password: input.password,
        expectedType: input.accountType,
      });
    } catch (error) {
      if (error instanceof StorageError && error.code === 'ACCOUNT_DISABLED') {
        if (htmlForm) return redirectForm(response, '/login-disabled.html');
        throw new ApiError(401, 'ACCOUNT_DISABLED', 'This account is disabled.');
      }
      if (error instanceof StorageError && error.code === 'LIBRARIAN_INACTIVE') {
        if (htmlForm) return redirectForm(response, '/login-librarian-inactive.html');
        throw new ApiError(
          401,
          'LIBRARIAN_INACTIVE',
          'Your librarian account is not active yet. Please contact a library manager to activate it, then sign in again.',
        );
      }
      if (error instanceof StorageError && error.code === 'FORBIDDEN') {
        if (htmlForm) return redirectForm(response, '/login-invalid.html');
        throw new ApiError(401, 'UNAUTHENTICATED', 'Email or password is incorrect.');
      }
      if (htmlForm && error instanceof ApiError && error.code === 'VALIDATION_ERROR') {
        return redirectForm(response, '/login-invalid.html');
      }
      throw error;
    }

    await regenerateSession(request);
    request.session.userId = user.userId;
    request.session.accountType = user.accountType;
    request.session.authVersion = user.authVersion ?? 0;
    await saveSession(request);
    if (htmlForm) return redirectForm(response, '/');
    return response.json({ user: accountSummary(user) });
  });

  router.post('/logout', requireActor, async (request, response) => {
    await destroySession(request);
    response.clearCookie(sessionCookieName, cookieOptions);
    response.status(204).end();
  });

  router.get('/session', async (request, response) => {
    const userId = request.session?.userId;
    if (typeof userId !== 'string' || !userId) {
      return response.json({ authenticated: false });
    }

    try {
      const user = await users.getById(userId);
      if (
        user.accountStatus !== 'ACTIVE' ||
        request.session.accountType !== user.accountType ||
        (request.session.authVersion ?? 0) !== (user.authVersion ?? 0)
      ) {
        await destroySession(request);
        response.clearCookie(sessionCookieName, cookieOptions);
        return response.json({ authenticated: false });
      }
      return response.json({ authenticated: true, user: accountSummary(user) });
    } catch (error) {
      if (error instanceof StorageError && error.code === 'NOT_FOUND') {
        await destroySession(request);
        response.clearCookie(sessionCookieName, cookieOptions);
        return response.json({ authenticated: false });
      }
      throw error;
    }
  });

  return router;
}
