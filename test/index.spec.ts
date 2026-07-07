import { SELF, env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';

describe('Auth test', () => {
	beforeEach(async () => {
		await env.mini_lead_tracker_db.prepare('DELETE FROM rate_limits WHERE ip = ?').bind('127.0.0.1').run();
	});

	it('Blocking unauthorized access', async () => {
		const response = await SELF.fetch('http://localhost:8787/leads');
		expect(response.status).toBe(401);

		const body = (await response.json()) as { error: string };

		expect(body.error).toBe('Неавторизовано');
	});

	it('Blocking access with invalid token', async () => {
		const response = await SELF.fetch('http://localhost:8787/leads', {
			headers: {
				Authorization: 'Bearer invalid-token',
			},
		});
		expect(response.status).toBe(401);
		const body = (await response.json()) as { error: string };
		expect(body.error).toBe('Неавторизовано');
	});

	it('Public access to /POST', async () => {
		const response = await SELF.fetch('http://localhost:8787/leads', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				name: 'Test user',
				email: 'testUser@gmai.com',
				message: 'this test user',
			}),
		});

		expect(response.status).toBe(201);
	});
});
