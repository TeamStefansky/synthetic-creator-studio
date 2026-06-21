/** @type {import('next').NextConfig} */
const isDemo = process.env.NEXT_PUBLIC_DEMO === "1";

// For the static GitHub Pages demo we export a fully static site under the
// repo's Pages base path. The app/api proxy route is removed by the Pages
// workflow before this build (static export has no server routes).
const demoConfig = {
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
  ...(isDemo ? demoConfig : serverConfig),
};

export default nextConfig;
