import { SELF, env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';

describe('Auth test', () => {
	beforeEach(async () => {
		await env.mini_lead_tracker_db.prepare('DELETE FROM rate_limits WHERE ip = ?').bind('127.0.0.1').run();
		await env.mini_lead_tracker_db.prepare('DELETE FROM leads').run();
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

	it('POST 3 leads and block the 4th', async () => {
		const makeRequest = () =>
			SELF.fetch('http://localhost:8787/leads', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					name: '',
					email: 'smth',
				}),
			});
		const res1 = await makeRequest();
		const res2 = await makeRequest();
		const res3 = await makeRequest();
		expect(res1.status).toBe(400);
		expect(res2.status).toBe(400);
		expect(res3.status).toBe(400);
		const res4 = await makeRequest();
		expect(res4.status).toBe(429);
	});
});
