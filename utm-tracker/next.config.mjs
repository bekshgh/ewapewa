/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // next/image is not used: turn the /_next/image optimizer off so it is not exposed.
  images: { unoptimized: true },
  // The report guide reads its prompt and report_kit.py from disk at request time.
  outputFileTracingIncludes: {
    "/reports/guide": ["./src/lib/reports/guide/*.{txt,py}"],
    "/reports/guide/kit": ["./src/lib/reports/guide/*.{txt,py}"],
  },
};
export default nextConfig;
