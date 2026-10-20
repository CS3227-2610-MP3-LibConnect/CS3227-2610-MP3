import { Router } from 'express';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { requireActiveActor, requireManager } from '../http/auth.js';
import { ApiError, parseRequest } from '../http/errors.js';
import { StorageError } from '../storage/repositories.js';

const userIdSchema = z.string().trim().min(1).max(128).refine((value) => !value.includes('/'), 'User ID cannot contain a slash.');
const statusSchema = z.object({ status: z.enum(['ACTIVE', 'INACTIVE']) }).strict();
const passwordSchema = z.string({ error: 'Password is required.' })
  .max(1024, 'Password must be no more than 1024 characters.')
  .refine((value) => Array.from(value).length >= 8, 'Password must be at least 8 characters.')
  .refine((value) => !/\p{White_Space}/u.test(value), 'Password must not contain whitespace.');
const resetPasswordSchema = z.object({
  password: passwordSchema,
  confirmPassword: z.string({ error: 'Please enter the confirmation password.' })
    .min(1, 'Please enter the confirmation password.')
    .max(1024, 'Confirmation password must be no more than 1024 characters.'),
}).strict().superRefine((input, context) => {
  if (input.password !== input.confirmPassword) {
    context.addIssue({
      code: 'custom',
      path: ['confirmPassword'],
      message: 'Confirmation password must match the password.',
    });
  }
});

function toJson(value) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(toJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toJson(item)]));
  }
  return value;
}

function safeLibrarianAccount(user) {
  return toJson({
    userId: user.userId,
    name: user.name,
    email: user.email,
    employeeId: user.employeeId,
    accountType: user.accountType,
    accountStatus: user.accountStatus,
    isManager: user.isManager === true,
    registrationDateTime: user.registrationDateTime,
  });
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character);
}

function passwordResetAction(userId: string): string {
  return `/api/v1/manager/librarians/${encodeURIComponent(userId)}/password`;
}

function renderPasswordResetForm(userId: string, targetName: string, messages: string[] = []): string {
  const escapedTargetId = escapeHtml(userId);
  const escapedTargetName = escapeHtml(targetName);
  const errors = messages.length
    ? `<div class="notice error" role="alert"><ul>${messages.map((message) => `<li>${escapeHtml(message)}</li>`).join('')}</ul></div>`
    : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Reset librarian password · LibConnect</title></head>
<body><main><h1>Reset password</h1><p>Target librarian: <strong>${escapedTargetName}</strong> (<code>${escapedTargetId}</code>)</p>${errors}
<p>The old password will stop working and the target will need to sign in again.</p>
<form method="post" action="${escapeHtml(passwordResetAction(userId))}" accept-charset="UTF-8">
<label>Password <input name="password" type="password" autocomplete="new-password" required minlength="8" maxlength="1024" pattern="[^\\s]+" title="Password must be at least 8 characters and contain no whitespace."></label>
<label>Confirm password <input name="confirmPassword" type="password" autocomplete="new-password" required maxlength="1024"></label>
<button type="submit">Confirm password reset</button></form></main></body></html>`;
}

function renderPasswordResetSuccess(targetName: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Password reset complete · LibConnect</title></head>
<body><main><h1>Password reset complete</h1><p role="status">The password for <strong>${escapeHtml(targetName)}</strong> was reset. The old password no longer works and the target’s sessions were revoked.</p></main></body></html>`;
}

function formErrorStatus(error: unknown): number {
  if (error instanceof ApiError)
    return error.status;
  if (error instanceof StorageError)
    return error.code === 'NOT_FOUND' ? 404 : error.code === 'FORBIDDEN' ? 403 : error.code === 'CONFLICT' ? 409 : 400;
  return 500;
}

function formErrorMessages(error: unknown): string[] {
  if (error instanceof ApiError && error.fields)
    return Object.values(error.fields);
  if (error instanceof ApiError || error instanceof StorageError)
    return [error.message];
  return ['The password reset could not be completed. Please try again.'];
}

function isHtmlForm(request: any): boolean {
  return request.is('application/x-www-form-urlencoded') && request.accepts('html') === 'html';
}

export function createManagerRouter(accounts, users) {
  const router = Router();
  const activeActor = requireActiveActor(users);

  router.get('/librarians', activeActor, requireManager, async (_request, response) => {
    const librarians = await accounts.listLibrarians(_request.actor);
    response.json({ librarians: librarians.map(safeLibrarianAccount) });
  });

  router.patch('/librarians/:userId/status', activeActor, requireManager, async (request, response) => {
    const userId = parseRequest(userIdSchema, request.params.userId);
    const { status } = parseRequest(statusSchema, request.body);
    const librarian = await accounts.updateLibrarianStatus(userId, status, request.actor);
    response.json({ librarian: safeLibrarianAccount(librarian) });
  });

  router.get('/librarians/:userId/password', activeActor, requireManager, async (request, response) => {
    const userId = parseRequest(userIdSchema, request.params.userId);
    if (userId === request.actor.userId)
      throw new ApiError(403, 'FORBIDDEN', 'Managers must use self-service password management for their own account.');
    const target = await users.getById(userId);
    if (target.accountType !== 'LIBRARIAN')
      throw new ApiError(403, 'FORBIDDEN', 'The target is not a librarian account.');
    response.type('html').send(renderPasswordResetForm(userId, target.name));
  });

  router.post('/librarians/:userId/password', activeActor, requireManager, async (request, response) => {
    const htmlForm = isHtmlForm(request);
    const userId = parseRequest(userIdSchema, request.params.userId);
    const input = parseRequest(resetPasswordSchema, request.body);
    if (userId === request.actor.userId) {
      throw new ApiError(403, 'FORBIDDEN', 'Managers must use self-service password management for their own account.');
    }
    const librarian = await accounts.resetLibrarianPassword(userId, input.password, input.confirmPassword, request.actor);
    if (htmlForm)
      return response.type('html').send(renderPasswordResetSuccess(librarian.name));
    response.json({ librarian: safeLibrarianAccount(librarian) });
  }, (error, request, response, next) => {
    if (!isHtmlForm(request))
      return next(error);
    const userId = typeof request.params.userId === 'string' ? request.params.userId : 'target';
    return response.status(formErrorStatus(error)).type('html').send(renderPasswordResetForm(userId, userId, formErrorMessages(error)));
  });

  return router;
}
