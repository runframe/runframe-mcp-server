import { z } from 'zod';

const SERVICE_KEY_PATTERN = /^svc_[ABCDEFGHJKLMNPQRSTVWXYZ][ABCDEFGHJKLMNPQRSTVWXYZ23456789]{9}$/;

export function normalizeServiceKey(serviceKey: string): string {
  const trimmed = serviceKey.trim();
  if (/^svc_/i.test(trimmed)) {
    return `svc_${trimmed.slice(4).toUpperCase()}`;
  }
  return trimmed;
}

export function isValidServiceKey(serviceKey: string): boolean {
  return SERVICE_KEY_PATTERN.test(serviceKey);
}

export const ServiceKeySchema = z.string()
  .min(1)
  .transform(normalizeServiceKey)
  .refine(isValidServiceKey, {
    message: 'Use a public service key like svc_K7M4Q9TZ2H',
  });
