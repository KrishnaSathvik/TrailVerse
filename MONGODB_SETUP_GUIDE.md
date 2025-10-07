# MongoDB Setup Guide

## Option A: MongoDB Atlas (Cloud - Recommended for Production)

### 1. Create MongoDB Atlas Account
1. Go to [MongoDB Atlas](https://cloud.mongodb.com)
2. Sign up for a free account
3. Create a new project called "National Parks Explorer"

### 2. Create a Cluster
1. Click "Build a Database"
2. Choose "FREE" tier (M0 Sandbox)
3. Select a cloud provider and region (choose closest to you)
4. Click "Create Cluster"

### 3. Set up Database Access
1. Go to "Database Access" in the left sidebar
2. Click "Add New Database User"
3. Create a user:
   - Username: `nomadiq-user`
   - Password: Generate a secure password (save it!)
   - Database User Privileges: "Read and write to any database"
4. Click "Add User"

### 4. Set up Network Access
1. Go to "Network Access" in the left sidebar
2. Click "Add IP Address"
3. For development: Click "Allow Access from Anywhere" (0.0.0.0/0)
4. For production: Add your specific IP addresses

### 5. Get Connection String
1. Go to "Database" in the left sidebar
2. Click "Connect" on your cluster
3. Choose "Connect your application"
4. Copy the connection string
5. Replace `<password>` with your user password
6. Replace `<dbname>` with `nomadiq`

Example connection string:
```
mongodb+srv://nomadiq-user:your-password@cluster0.xxxxx.mongodb.net/nomadiq?retryWrites=true&w=majority
```

## Option B: Local MongoDB Installation

### macOS (using Homebrew)
```bash
# Install MongoDB Community Edition
brew tap mongodb/brew
brew install mongodb-community

# Start MongoDB
brew services start mongodb-community

# Verify it's running
brew services list | grep mongodb

# Connection string for local
MONGODB_URI=mongodb://localhost:27017/nomadiq
```

### Ubuntu/Debian
```bash
# Import MongoDB public GPG key
wget -qO - https://www.mongodb.org/static/pgp/server-7.0.asc | sudo apt-key add -

# Create list file for MongoDB
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

# Update package database
sudo apt-get update

# Install MongoDB
sudo apt-get install -y mongodb-org

# Start MongoDB
sudo systemctl start mongod
sudo systemctl enable mongod

# Connection string for local
MONGODB_URI=mongodb://localhost:27017/nomadiq
```

### Windows
1. Download MongoDB Community Server from [mongodb.com](https://www.mongodb.com/try/download/community)
2. Run the installer with default settings
3. MongoDB will start automatically as a Windows service
4. Connection string: `mongodb://localhost:27017/nomadiq`

## Verify MongoDB Connection

### Test Connection (Optional)
```bash
# Install MongoDB Shell (optional)
npm install -g mongosh

# Connect to your database
mongosh "mongodb+srv://username:password@cluster.mongodb.net/nomadiq"
# or for local:
mongosh "mongodb://localhost:27017/nomadiq"
```

## Troubleshooting

### Common Issues
1. **Connection timeout**: Check your IP address is whitelisted in Atlas
2. **Authentication failed**: Verify username/password in connection string
3. **Network error**: Check if MongoDB service is running (local) or cluster is active (Atlas)

### Health Check
```bash
# For local MongoDB
brew services list | grep mongodb  # macOS
sudo systemctl status mongod       # Linux

# Test connection
curl http://localhost:27017  # Should return connection refused (normal)
```
