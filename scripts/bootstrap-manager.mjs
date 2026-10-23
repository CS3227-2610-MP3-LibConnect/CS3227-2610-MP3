import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';

import argon2 from 'argon2';
import { getApps } from 'firebase-admin/app';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';

const expectedProjectId = 'demo-libconnect';

const managerInputSchema = z
  .object({
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
    employeeId: z
      .string({ error: 'Employee ID is required.' })
      .trim()
      .min(1, 'Employee ID is required.')
      .max(128, 'Employee ID must be 128 characters or fewer.'),
    password: z
      .string({ error: 'Password is required.' })
      .max(1024, 'Password must be no more than 1024 characters.')
      .refine((value) => Array.from(value).length >= 8, 'Password must be at least 8 characters.')
      .refine((value) => !/\p{White_Space}/u.test(value), 'Password must not contain whitespace.'),
    confirmPassword: z
      .string({ error: 'Please enter the confirmation password.' })
      .min(1, 'Please enter the confirmation password.')
      .max(1024, 'Confirmation password must be no more than 1024 characters.'),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.password !== input.confirmPassword) {
      context.addIssue({
        code: 'custom',
        path: ['confirmPassword'],
        message: 'Confirmation password must match the password.',
      });
    }
  });

export function assertLocalBootstrapEnvironment(environment = process.env) {
  if (!environment.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      'FIRESTORE_EMULATOR_HOST must be set; refusing to create a manager outside the Firestore Emulator.',
    );
  }
  if (environment.NODE_ENV === 'production') {
    throw new Error('Manager bootstrap is disabled when NODE_ENV=production.');
  }
  if (environment.FIREBASE_PROJECT_ID !== expectedProjectId) {
    throw new Error(
      `FIREBASE_PROJECT_ID must be ${expectedProjectId} for local manager bootstrap.`,
    );
  }
}

export function validateManagerInput(input) {
  const result = managerInputSchema.safeParse(input);
  if (!result.success) {
    return {
      ok: false,
      message: result.error.issues[0]?.message ?? 'Manager details are invalid.',
    };
  }
  return { ok: true, value: result.data };
}

export function buildManagerRecord(input, passwordHash, options = {}) {
  const now = options.now ?? Timestamp.now();
  return {
    userId: options.userId ?? randomUUID(),
    name: input.name,
    email: input.email,
    emailCanonical: input.email.toLowerCase(),
    passwordHash,
    registrationDateTime: now,
    accountType: 'LIBRARIAN',
    accountStatus: 'ACTIVE',
    authVersion: 0,
    employeeId: input.employeeId,
    employeeIdCanonical: input.employeeId.toLowerCase(),
    isManager: true,
  };
}

function readSecret(prompt) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return Promise.reject(new Error('Password entry requires an interactive terminal.'));
  }

  process.stdout.write(prompt);
  return new Promise((resolve, reject) => {
    let value = '';
    const previousRawMode = process.stdin.isRaw ?? false;
    const cleanup = () => {
      process.stdin.off('data', onData);
      process.stdin.setRawMode(previousRawMode);
      process.stdin.pause();
    };
    const onData = (chunk) => {
      for (const character of String(chunk)) {
        if (character === '\u0003') {
          cleanup();
          process.stdout.write('\n');
          reject(new Error('Input cancelled.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          cleanup();
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (character === '\u007f' || character === '\b') {
          value = value.slice(0, -1);
          continue;
        }
        if (character >= ' ') value += character;
      }
    };

    try {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.on('data', onData);
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}

async function promptManagerInput() {
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  let visible;
  try {
    visible = {
      name: await readline.question('Full name: '),
      email: await readline.question('Email address: '),
      employeeId: await readline.question('Employee ID: '),
    };
  } finally {
    readline.close();
  }
  return {
    ...visible,
    password: await readSecret('Password: '),
    confirmPassword: await readSecret('Confirm password: '),
  };
}

function printUsage() {
  console.info('Usage: npm run bootstrap:manager');
  console.info('Creates one active manager account in the demo-libconnect Firestore Emulator.');
}

async function main() {
  if (process.argv.includes('--help')) {
    printUsage();
    return;
  }

  assertLocalBootstrapEnvironment();
  const input = validateManagerInput(await promptManagerInput());
  if (!input.ok) throw new Error(input.message);

  try {
    const [{ db }, { UserRepository }] = await Promise.all([
      import('../dist/apps/api/src/storage/firebase.js'),
      import('../dist/apps/api/src/storage/repositories.js'),
    ]);
    const passwordHash = await argon2.hash(input.value.password, { type: argon2.argon2id });
    const manager = buildManagerRecord(input.value, passwordHash);
    await new UserRepository(db).create(manager);
    console.info(
      `Created local manager account for ${manager.email} (employee ID ${manager.employeeId}).`,
    );
  } finally {
    await Promise.all(getApps().map((app) => app.delete()));
  }
}

const isMain =
  process.argv[1] &&
  pathToFileURL(fileURLToPath(import.meta.url)).href === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((error) => {
    console.error(
      `Manager bootstrap failed: ${error instanceof Error ? error.message : 'Unknown error.'}`,
    );
    process.exitCode = 1;
  });
}
