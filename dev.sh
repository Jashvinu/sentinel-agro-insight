#!/bin/bash

# Development script for Sentinel Agro Insight
# This script runs both the Node.js server and Vite development server

echo "🚀 Starting Sentinel Agro Insight Development Environment"

# Function to cleanup background processes
cleanup() {
    echo "🛑 Shutting down development servers..."
    kill $SERVER_PID $CLIENT_PID 2>/dev/null
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Start the Node.js server in the background
echo "📡 Starting Node.js server on port 3001..."
npm run server &
SERVER_PID=$!

# Wait a moment for the server to start
sleep 2

# Start the Vite development server
echo "🌐 Starting Vite development server on port 5173..."
npm run dev &
CLIENT_PID=$!

echo "✅ Development environment started!"
echo "📊 Server: http://localhost:3001"
echo "🌍 Client: http://localhost:5173"
echo "🔍 Health Check: http://localhost:3001/api/health"
echo ""
echo "Press Ctrl+C to stop all servers"

# Wait for both processes
wait 