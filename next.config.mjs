/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      // The hub lives at /careers/play. Send the bare root there.
      { source: "/", destination: "/careers/play", permanent: false },
    ];
  },
};

export default nextConfig;
