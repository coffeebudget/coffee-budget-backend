#!/bin/bash

# Coffee Budget Workspace Setup Script

echo "🚀 Setting up Coffee Budget development workspace..."

# Check if we're in the backend directory
if [ ! -f "package.json" ] || ! grep -q "nestjs" package.json; then
    echo "❌ Please run this script from the coffee-budget-backend directory"
    exit 1
fi

# Check if frontend directory exists
FRONTEND_DIR="../coffee-budget-frontend"
if [ ! -d "$FRONTEND_DIR" ]; then
    echo "⚠️  Frontend directory not found at $FRONTEND_DIR"
    echo "Please ensure the frontend is located at: $FRONTEND_DIR"
    echo "Or update the path in coffee-budget.code-workspace"
    exit 1
fi

echo "✅ Backend directory: $(pwd)"
echo "✅ Frontend directory: $FRONTEND_DIR"

# Install backend dependencies
echo "📦 Installing backend dependencies..."
npm install

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
cd "$FRONTEND_DIR"
npm install
cd - > /dev/null

# Create .env.development if it doesn't exist
if [ ! -f ".env.development" ]; then
    if [ -f ".env.example" ]; then
        echo "📝 Creating .env.development from .env.example..."
        cp .env.example .env.development
        echo "⚠️  Please update .env.development with your database credentials"
    else
        echo "⚠️  No .env.example found. Please create .env.development manually"
    fi
fi

echo ""
echo "🎉 Workspace setup complete!"
echo ""
echo "Next steps:"
echo "1. Update .env.development with your database credentials"
echo "2. Open coffee-budget.code-workspace in VS Code"
echo "3. Start the backend: npm run start:dev"
echo "4. Start the frontend: cd $FRONTEND_DIR && npm run dev"
echo ""
echo "Happy coding! ☕" 