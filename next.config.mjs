/** @type {import('next').NextConfig} */
const nextConfig = {
  // Compile workspace TypeScript packages that ship `.ts` entrypoints.
  transpilePackages: ["@dingmoney/deposit-core", "@dingmoney/backgammon-engine"],
};

export default nextConfig;
