/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // ⚠️ The image optimizer is OFF — a security setting (2026-10-16). This app
  // uses no `next/image`, and `/_next/image` on Next 14 carries advisories with
  // no 14.x fix (GHSA-2xp9-vwfh-vxw4, critical; GHSA-h64f-5h5j-jqjh;
  // GHSA-3x4c-7xq6-9pq8). With `unoptimized` the route answers 404. Same
  // setting and reasons as client/next.config.mjs; pinned by the client's
  // src/lib/imageOptimizerOff.test.ts.
  images: { unoptimized: true },
  // Self-hosted font files never change under the same path (the folder name
  // carries the version), so browsers may keep them for a year.
  async headers() {
    return [
      {
        source: '/fonts/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
};

export default nextConfig;
