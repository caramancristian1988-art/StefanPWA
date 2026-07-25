/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  reactCompiler: true,
  // playwright-core loads browsers.json + other data files at runtime via a
  // dynamic path Vercel's file tracer doesn't statically detect, so without
  // this the deployed function is missing them and Chromium fails to launch.
  outputFileTracingIncludes: {
    "/api/invoice/public/[token]/pdf": [
      "node_modules/playwright-core/**",
      "node_modules/@sparticuz/chromium/**",
    ],
  },
};

export default nextConfig;
