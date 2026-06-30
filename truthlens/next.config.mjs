/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // react-force-graph pulls in some browser-only deps; keep it client-only.
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false };
    return config;
  },
};

export default nextConfig;
