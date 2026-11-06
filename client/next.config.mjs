/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // `next dev` and `next build` share `.next`, and running the build while the
  // dev server is up kills it with `EPERM ... .next\trace`, leaving the dev
  // server serving a half-written tree (see client/CLAUDE.md). Setting
  // NEXT_DIST_DIR builds into a separate directory instead, so a production
  // build can be verified without stopping anyone's dev server:
  //   NEXT_DIST_DIR=.next-verify npm run build
  // Unset — which is how CI and the VPS run it — nothing changes.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // ⚠️ The image optimizer is OFF — a security setting, not a style one
  // (2026-10-16). Nothing in the app uses `next/image`, yet `next start` still
  // answers `/_next/image` for anyone on the internet, and on the Next 14 line
  // that endpoint carries advisories with no 14.x fix: remote code execution
  // when an AVIF file is optimized (GHSA-2xp9-vwfh-vxw4, critical), a denial of
  // service (GHSA-h64f-5h5j-jqjh) and a cache that can fill the disk
  // (GHSA-3x4c-7xq6-9pq8). With `unoptimized` the server answers the route
  // with a 404 before it reads a byte (next-server.js#handleNextImageRequest).
  // Keep it until Next is past those advisories (15.5.24+), and then only drop
  // it if an image is ever meant to go through the optimizer. Pinned by
  // src/lib/imageOptimizerOff.test.ts, for this app and admin/.
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
