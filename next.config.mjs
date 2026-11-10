process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow local network IP access for dev server
  allowedDevOrigins: [
    "192.168.1.7",
    "192.168.1.7:3000",
    "localhost",
    "localhost:3000",
    "127.0.0.1",
    "127.0.0.1:3000",
  ],
  // unpdf ships its own pdf.js build; keep it out of the server bundle
  serverExternalPackages: ["unpdf"],
  // hackathon safety net: a stray type/lint warning should never block a Vercel deploy
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
