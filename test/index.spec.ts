import { SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';

describe('Auth test', () => {
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

		expect([201, 429]).toContain(response.status);
	});

	it('Test cache concurency', async () => {
		const url = 'http://localhost:8787/leads';
		const body = JSON.stringify({ name: 'Test', email: 'test@test.com' });
		const headers = { 'Content-Type': 'application/json' };

		const requests = Array.from({ length: 6 }, () =>
			SELF.fetch(url, {
				method: 'POST',
				headers,
				body,
			}),
		);
		const responses = await Promise.all(requests);
		const statuses = responses.map((response) => response.status);

		const successCount = statuses.filter((status) => status === 201).length;
		expect(successCount).toBeLessThanOrEqual(3);
		expect(statuses).toContain(429);
		console.log(statuses);
	});
});
