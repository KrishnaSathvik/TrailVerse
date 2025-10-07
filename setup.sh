#!/bin/bash

echo "🚀 National Parks Explorer - Backend Setup Script"
echo "================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js first."
    exit 1
fi

print_status "Node.js is installed: $(node --version)"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed. Please install npm first."
    exit 1
fi

print_status "npm is installed: $(npm --version)"

# Generate JWT secret
echo ""
print_info "Generating JWT secret..."
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
print_status "JWT secret generated"

# Create server .env file
echo ""
print_info "Setting up server environment variables..."
if [ ! -f "server/.env" ]; then
    cp server/env.example server/.env
    
    # Replace JWT secret
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/your-super-secret-jwt-key-minimum-32-characters-long-change-this-in-production/$JWT_SECRET/" server/.env
    else
        # Linux
        sed -i "s/your-super-secret-jwt-key-minimum-32-characters-long-change-this-in-production/$JWT_SECRET/" server/.env
    fi
    
    print_status "Server .env file created with generated JWT secret"
    print_warning "Please edit server/.env and add your MongoDB URI and API keys"
else
    print_warning "Server .env file already exists"
fi

# Create client .env file
echo ""
print_info "Setting up client environment variables..."
if [ ! -f "client/.env" ]; then
    cp client/env.example client/.env
    print_status "Client .env file created"
    print_warning "Please edit client/.env if you need to customize the API URL"
else
    print_warning "Client .env file already exists"
fi

# Install server dependencies
echo ""
print_info "Installing server dependencies..."
cd server
if [ ! -d "node_modules" ]; then
    npm install
    print_status "Server dependencies installed"
else
    print_warning "Server dependencies already installed"
fi

# Install client dependencies
echo ""
print_info "Installing client dependencies..."
cd ../client
if [ ! -d "node_modules" ]; then
    npm install
    print_status "Client dependencies installed"
else
    print_warning "Client dependencies already installed"
fi

cd ..

echo ""
echo "🎉 Setup Complete!"
echo "=================="
echo ""
print_info "Next steps:"
echo "1. Set up MongoDB (see MONGODB_SETUP_GUIDE.md)"
echo "2. Configure environment variables:"
echo "   - Edit server/.env with your MongoDB URI and API keys"
echo "   - Edit client/.env if needed"
echo "3. Run the seed script: cd server && npm run seed"
echo "4. Start development servers:"
echo "   - Backend: cd server && npm run dev"
echo "   - Frontend: cd client && npm start"
echo ""
print_info "For detailed instructions, see:"
echo "- MONGODB_SETUP_GUIDE.md"
echo "- BACKEND_SETUP.md"
echo "- VERIFICATION_CHECKLIST.md"
