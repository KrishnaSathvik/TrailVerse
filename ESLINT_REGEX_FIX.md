# ESLint Regex Fix - Unnecessary Escape Characters

## 🐛 **Problem Identified**
ESLint errors in both CreateBlogPage.jsx and EditBlogPage.jsx:
```
Unnecessary escape character: \[  no-useless-escape
```

## ✅ **Solution Applied**

### **Issue:**
The regex pattern `/[#*`_~\[\]()]/g` had unnecessary escape characters for square brackets inside a character class.

### **Fix:**
**Before (Incorrect):**
```javascript
formData.content.replace(/[#*`_~\[\]()]/g, '')
```

**After (Correct):**
```javascript
formData.content.replace(/[#*`_~[\]()]/g, '')
```

### **Explanation:**
- Inside a character class `[...]`, square brackets `[` and `]` don't need to be escaped
- The `\]` escape is only needed for the closing bracket to avoid ending the character class
- The `\[` escape was unnecessary and caused the ESLint error

### **Files Fixed:**
1. `client/src/pages/admin/CreateBlogPage.jsx` - Line 316
2. `client/src/pages/admin/EditBlogPage.jsx` - Line 352

### **Result:**
- ✅ No more ESLint errors
- ✅ Regex pattern works correctly
- ✅ Word count calculation functions properly
- ✅ Markdown syntax removal works as expected

The regex now correctly removes markdown formatting characters for accurate word counting! 🎉
