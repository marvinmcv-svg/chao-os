import { defineConfig, type Plugin } from 'vitest/config'
import path from 'node:path'

/**
 * Vite plugin: rewrite `next/server` and `next/headers` to their actual
 * `.js` files. Next.js 14.2.x doesn't have a package.json#exports field
 * for these subpaths, so Vite's resolver can't find them when other
 * packages (notably next-auth) import them.
 */
function nextjsSubpathFix(): Plugin {
  return {
    name: 'nextjs-subpath-fix',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === 'next/server') {
        return path.resolve(__dirname, 'node_modules/next/server.js')
      }
      if (source === 'next/headers') {
        return path.resolve(__dirname, 'node_modules/next/headers.js')
      }
      return null
    },
  }
}

export default defineConfig({
  plugins: [nextjsSubpathFix()],
  test: {
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/helpers/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Pre-bundle next-auth so Vite can apply our resolveId plugin to its
    // import of `next/server`.
    server: {
      deps: {
        inline: ['next-auth', '@auth/core', '@auth/prisma-adapter'],
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['lib/**', 'app/api/**'],
      exclude: ['**/*.d.ts', '**/types/**', '**/*.config.*'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
  optimizeDeps: {
    include: ['next-auth', '@auth/core', '@auth/prisma-adapter'],
  },
})
