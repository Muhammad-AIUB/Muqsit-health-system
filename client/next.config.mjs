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
};

export default nextConfig;
