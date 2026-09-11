import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['@strands-agents/sdk', '@aws-sdk/client-bedrock-runtime'],
};

export default nextConfig;
