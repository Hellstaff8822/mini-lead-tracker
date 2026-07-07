import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { isRateLimited } from '../src/utils/rateLimiter';

describe('Rate Limiter', () => {
	beforeEach(async () => {
		await env.mini_lead_tracker_db.prepare('DELETE FROM rate_limits WHERE ip = ?').bind('192.168.1.1').run();
	});

	it('Дозволяє 3 запити і блокує подальші', async () => {
		const ip = '192.168.1.1';

		expect(await isRateLimited(env.mini_lead_tracker_db, ip)).toBe(false);
		expect(await isRateLimited(env.mini_lead_tracker_db, ip)).toBe(false);
		expect(await isRateLimited(env.mini_lead_tracker_db, ip)).toBe(false);

		expect(await isRateLimited(env.mini_lead_tracker_db, ip)).toBe(true);
	});
});
