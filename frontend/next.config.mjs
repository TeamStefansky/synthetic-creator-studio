/** @type {import('next').NextConfig} */
const isStatic = process.env.NEXT_PUBLIC_STATIC === "1" || process.env.NEXT_PUBLIC_DEMO === "1";

// Static site (GitHub Pages): export a fully static build under the repo's Pages
// base path. Used for both the mock demo (NEXT_PUBLIC_DEMO=1) and a real build
// that talks straight to the live backend (NEXT_PUBLIC_API_BASE=...).
// The app/api proxy route is removed by the Pages workflow before this build.
const staticConfig = {
  output: "export",
  basePath: "/synthetic-creator-studio",
  assetPrefix: "/synthetic-creator-studio/",
  images: { unoptimized: true },
  trailingSlash: true,
};

const serverConfig = {
  // Self-contained server build for small Docker images.
  output: "standalone",
};

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(isStatic ? staticConfig : serverConfig),
};

export default nextConfig;
