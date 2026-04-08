import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		globals: true,
		clearMocks: true,
		projects: [
			{
				test: {
					name: 'unit',
					environment: 'node',
					globals: true,
					clearMocks: true,
					include: ['src/**/*.test.ts'],
					exclude: ['test/harness/**'],
				},
			},
			{
				test: {
					name: 'harness',
					environment: 'node',
					globals: true,
					include: ['test/harness/**/*.test.ts'],
				},
			},
		],
	},
});
