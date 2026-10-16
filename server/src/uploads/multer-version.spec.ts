import { readFileSync } from 'fs';
import { dirname } from 'path';

// ⚠️ SECURITY PIN — 2026-10-16.
//
// `POST /uploads/image` is public (the registration flow uploads documents
// before any account exists, upload.controller.ts), so the multipart parser
// under it — multer, inside @nestjs/platform-express — faces the internet
// unauthenticated. Nest 10's platform-express pins multer 2.0.2, which carries
// eight denial-of-service advisories fixed in 2.3.0 (GHSA-wc9g-mqfw-jrwm,
// GHSA-535w-7cp7-47q4, GHSA-72gw-mp4g-v24j, GHSA-5528-5vmv-3xc2, …) and one
// more fixed in 2.4.0. The `overrides` entry in package.json lifts it.
//
// Red here means the override was lost and npm installed the version Nest
// asked for. Resolve multer from platform-express's own directory: that is the
// copy the route actually runs, whatever is hoisted beside it.
const multerVersionUsedByNest = (): string => {
  const nest = dirname(
    require.resolve('@nestjs/platform-express/package.json'),
  );
  const manifest = require.resolve('multer/package.json', { paths: [nest] });
  return JSON.parse(readFileSync(manifest, 'utf8')).version;
};

describe('the multipart parser under the public upload route', () => {
  it('is multer 2.4.0 or later, not the 2.0.2 that Nest 10 pins', () => {
    const [major, minor] = multerVersionUsedByNest().split('.').map(Number);
    expect(major > 2 || (major === 2 && minor >= 4)).toBe(true);
  });
});
