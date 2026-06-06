FROM node:18-alpine

WORKDIR /app

# NEXT_PUBLIC_* env vars are inlined into the JS bundle at build time.
# Pass --build-arg NEXT_PUBLIC_API_URL=https://api.your-domain.com/api at
# build time to override; defaults to nginx-on-localhost for local dev.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source
COPY . .

# Build the Next.js app (NEXT_PUBLIC_API_URL is now baked into the bundle)
RUN npm run build

# Copy static files into the standalone output
RUN cp -r .next/static .next/standalone/.next/static
RUN if [ -d public ]; then cp -r public .next/standalone/public; fi

# Expose port
EXPOSE 3000

# Run the standalone server
CMD ["node", ".next/standalone/server.js"]
