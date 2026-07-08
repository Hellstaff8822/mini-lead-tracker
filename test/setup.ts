import { env, applyD1Migrations } from 'cloudflare:test';
import { beforeAll } from 'vitest';

declare global {
	const __MIGRATIONS__: any[];
}

beforeAll(async () => {
	await applyD1Migrations(env.mini_lead_tracker_db, __MIGRATIONS__);
});
