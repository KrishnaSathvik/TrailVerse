#!/bin/bash

# Debug: Print environment variables
echo "=== Environment Variables ==="
env | grep REACT_APP_ | head -10
echo "=== OpenWeatherAPI Key Status ==="
if [ -z "$REACT_APP_OPENWEATHER_API_KEY" ]; then
    echo "❌ REACT_APP_OPENWEATHER_API_KEY is NOT set"
else
    echo "✅ REACT_APP_OPENWEATHER_API_KEY is set (length: ${#REACT_APP_OPENWEATHER_API_KEY})"
fi

# Navigate to client directory
cd client

# Create .env.production file with environment variables
echo "=== Creating .env.production ==="
cat > .env.production << EOF
REACT_APP_GA_TRACKING_ID=$REACT_APP_GA_TRACKING_ID
REACT_APP_API_URL=$REACT_APP_API_URL
REACT_APP_OPENWEATHER_API_KEY=$REACT_APP_OPENWEATHER_API_KEY
REACT_APP_NPS_API_KEY=$REACT_APP_NPS_API_KEY
REACT_APP_ADMIN_PASSWORD=$REACT_APP_ADMIN_PASSWORD
REACT_APP_ADMIN_EMAIL=$REACT_APP_ADMIN_EMAIL
REACT_APP_ENV=$REACT_APP_ENV
REACT_APP_NAME=$REACT_APP_NAME
REACT_APP_DOMAIN=$REACT_APP_DOMAIN
REACT_APP_URL=$REACT_APP_URL
REACT_APP_WEBSITE_URL=$REACT_APP_WEBSITE_URL
EOF

echo "=== .env.production contents ==="
cat .env.production

# Clean and run build
echo "=== Cleaning previous build ==="
rm -rf build
rm -rf node_modules/.cache

echo "=== Running build ==="
npm run build

# Navigate back to root
cd ..
