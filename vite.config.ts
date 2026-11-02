import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages ではリポジトリ名のサブパスで配信されるため相対パスにする
  base: './',
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
});
