# Stage 1: Build the React frontend
FROM node:18-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Set up the Node.js backend and serve the compiled frontend
FROM node:18-alpine
WORKDIR /app

# Install backend dependencies
COPY backend/package*.json ./backend/
RUN npm install --prefix backend

# Copy backend code
COPY backend/ ./backend/

# Copy the built static frontend assets into the backend directory
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Expose port (Hugging Face Spaces expects port 7860)
EXPOSE 7860
ENV PORT=7860
ENV NODE_ENV=production

# Start the Express server
CMD ["node", "backend/server.js"]
