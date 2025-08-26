FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for building)
RUN npm ci

# Copy source code
COPY . .

# Build the frontend
RUN npm run build

# Remove dev dependencies and node_modules, then reinstall only production dependencies
RUN rm -rf node_modules package-lock.json
RUN npm install --only=production

# Expose port
EXPOSE 3001

# Start the server (only run server, not build again)
CMD ["npm", "run", "server"]
