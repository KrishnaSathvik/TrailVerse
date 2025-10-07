#!/bin/bash

echo "🎨 TrailVerse Rebranding Script"
echo "================================"
echo ""

# Define old and new names
OLD_NAME="National Parks Explorer USA"
OLD_NAME_SHORT="NPE USA"
OLD_CODE_NAME="NomadIQ"
NEW_NAME="TrailVerse"
NEW_TAGLINE="Your Universe of National Parks Exploration"
NEW_EMAIL="trailverseteam@gmail.com"

echo "📝 Rebranding Configuration:"
echo "  Old Name: $OLD_NAME"
echo "  Old Short: $OLD_NAME_SHORT"
echo "  Old Code: $OLD_CODE_NAME"
echo "  New Name: $NEW_NAME"
echo "  New Tagline: $NEW_TAGLINE"
echo "  New Email: $NEW_EMAIL"
echo "  Domain: nationalparksexplorerusa.com (keeping for SEO)"
echo ""

# Create backup
echo "💾 Creating backup..."
mkdir -p backups/$(date +%Y%m%d_%H%M%S)
cp -r client backups/$(date +%Y%m%d_%H%M%S)/client_backup
cp -r server backups/$(date +%Y%m%d_%H%M%S)/server_backup
echo "✅ Backup created in backups/$(date +%Y%m%d_%H%M%S)/"
echo ""

# Function to replace in files
replace_in_files() {
    local pattern="$1"
    local replacement="$2"
    local files="$3"
    
    echo "🔄 Replacing '$pattern' with '$replacement' in $files"
    find $files -type f \( -name "*.jsx" -o -name "*.js" -o -name "*.html" -o -name "*.json" -o -name "*.md" \) -exec sed -i '' "s|$pattern|$replacement|g" {} \;
}

# Replace in client files
echo "🎯 Updating Client Files..."
replace_in_files "$OLD_NAME" "$NEW_NAME" "client/"
replace_in_files "$OLD_NAME_SHORT" "$NEW_NAME" "client/"
replace_in_files "$OLD_CODE_NAME" "$NEW_NAME" "client/"

# Replace in server files  
echo "🎯 Updating Server Files..."
replace_in_files "$OLD_NAME" "$NEW_NAME" "server/"
replace_in_files "$OLD_NAME_SHORT" "$NEW_NAME" "server/"
replace_in_files "$OLD_CODE_NAME" "$NEW_NAME" "server/"

# Replace in root files
echo "🎯 Updating Root Files..."
replace_in_files "$OLD_NAME" "$NEW_NAME" "."
replace_in_files "$OLD_NAME_SHORT" "$NEW_NAME" "."
replace_in_files "$OLD_CODE_NAME" "$NEW_NAME" "."

# Update specific patterns
echo "🎯 Updating Specific Patterns..."

# Update email addresses
find client/ server/ -type f \( -name "*.jsx" -o -name "*.js" -o -name "*.html" -o -name "*.json" \) -exec sed -i '' "s|travelswithkrishna@gmail.com|$NEW_EMAIL|g" {} \;

# Update taglines and descriptions
find client/ -type f \( -name "*.jsx" -o -name "*.js" \) -exec sed -i '' "s|Your gateway to exploring America|$NEW_TAGLINE|g" {} \;

# Update social media handles
find client/ -type f \( -name "*.jsx" -o -name "*.js" -o -name "*.html" \) -exec sed -i '' "s|@npeusa|@TrailVerse|g" {} \;

echo ""
echo "✅ Rebranding Complete!"
echo ""
echo "📋 Next Steps:"
echo "  1. Update logo files (replace /logo.png)"
echo "  2. Update favicon files"
echo "  3. Generate new og:image files"
echo "  4. Test the application"
echo "  5. Update social media profiles"
echo ""
echo "🎨 Brand Guidelines:"
echo "  Primary Color: #10b981 (Forest Green)"
echo "  Secondary Color: #059669 (Emerald)"
echo "  Font: Geist + Bricolage Grotesque"
echo "  Logo Style: Modern compass + mountain trail"
echo ""
echo "🌐 Domain Strategy:"
echo "  Keep: nationalparksexplorerusa.com (for SEO)"
echo "  Future: trailverse.com (redirect to main domain)"
echo ""
echo "📧 Email Setup:"
echo "  Primary: $NEW_EMAIL"
echo "  Support: $NEW_SUPPORT_EMAIL"
echo "  Forward from: info@nationalparksexplorerusa.com"
echo ""
echo "✨ TrailVerse is ready to launch!"
