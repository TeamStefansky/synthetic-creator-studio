/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Story/card images are hotlinked from arbitrary publisher domains via a plain
  // <img>; we deliberately do NOT use next/image (no proxying/caching of source
  // images per the rights rules), so no remotePatterns config is needed.
};

export default nextConfig;
