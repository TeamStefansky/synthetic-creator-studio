/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Self-contained server build for small Docker images.
  output: "standalone",
  // Note: /api/* is handled by the runtime proxy route (app/api/[...path]/route.ts),
  // which forwards to BACKEND_URL. This keeps the image host-agnostic (no rebuild
  // needed to point at a different backend).
};
export default nextConfig;
