import { defineConfig } from 'astro/config';

// This setting describes the eventual public URL; it does not connect DNS.
// See README.md for the temporary GitHub URL configuration before domain setup.
export default defineConfig({
  site: 'https://3dlaw.dev',
  output: 'static',
  base: '/',
  trailingSlash: 'always',
});
