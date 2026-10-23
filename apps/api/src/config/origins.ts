export function validateOrigin(name: string, value: string): string {
  try {
    const origin = new URL(value);
    if (origin.origin !== value || !['http:', 'https:'].includes(origin.protocol))
      throw new Error();
    return origin.origin;
  } catch {
    throw new Error(`${name} must be a valid origin URL without a path.`);
  }
}

export function resolveApiOrigin({
  nodeEnv,
  apiOrigin,
  port,
}: {
  nodeEnv?: string;
  apiOrigin?: string;
  port: number;
}): string {
  if (nodeEnv === 'production' && !apiOrigin)
    throw new Error('API_ORIGIN must be configured in production.');
  const resolvedOrigin = validateOrigin('API_ORIGIN', apiOrigin ?? `http://localhost:${port}`);
  if (nodeEnv === 'production' && !resolvedOrigin.startsWith('https://'))
    throw new Error('API_ORIGIN must use HTTPS in production.');
  return resolvedOrigin;
}
