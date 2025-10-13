# Review Submission 404 Error Fix

## Problem
When users tried to submit a park review, they received a 404 error:
```
POST http://localhost:5001/api/parks/yell/reviews 404 (Not Found)
```

## Root Causes
1. **Incorrect API endpoints**: Frontend was calling `/parks/${parkCode}/reviews` but the backend routes were mounted at `/reviews/${parkCode}`
2. **Field name mismatch**: Frontend was sending `content` field, but backend `ParkReview` model expected `comment`
3. **Missing required field**: Backend required `visitDuration` field which wasn't being sent by frontend
4. **Image data structure mismatch**: Frontend was sending `images` as array of strings, but backend expected `photos` as array of objects with `{url, caption}`
5. **Response parsing issue**: Frontend was incorrectly parsing the backend response structure for stats

## Backend Route Structure
The backend routes are configured as:
- `/api/reviews` → routes/reviews.js
  - `GET /api/reviews/:parkCode` - Get park reviews
  - `POST /api/reviews/:parkCode` - Create review (protected)
  - `PUT /api/reviews/:reviewId` - Update review
  - `DELETE /api/reviews/:reviewId` - Delete review
  - `POST /api/reviews/:reviewId/vote` - Vote on review

## Changes Made

### 1. Fixed API Endpoints in reviewService.js
**Before:**
```javascript
async getParkReviews(parkCode) {
  const response = await api.get(`/parks/${parkCode}/reviews`);
  return response.data;
}

async createReview(parkCode, reviewData, images = []) {
  // ...
  const response = await api.post(`/parks/${parkCode}/reviews`, reviewWithImages);
  return response.data.data;
}
```

**After:**
```javascript
async getParkReviews(parkCode) {
  const response = await api.get(`/reviews/${parkCode}`);
  return response.data;
}

async createReview(parkCode, reviewData, images = []) {
  // ...
  const response = await api.post(`/reviews/${parkCode}`, reviewWithImages);
  return response.data.data;
}
```

### 2. Fixed Image Data Structure
**Before:**
```javascript
const reviewWithImages = {
  ...reviewData,
  images: uploadedImages.map(img => img.url)
};
```

**After:**
```javascript
const reviewWithImages = {
  ...reviewData,
  photos: uploadedImages.map(img => ({
    url: img.url,
    caption: ''
  }))
};
```

### 3. Updated ReviewSection Component

#### Added Missing Fields
**Before:**
```javascript
const [newReview, setNewReview] = useState({
  rating: 5,
  title: '',
  content: '',
  visitDate: ''
});
```

**After:**
```javascript
const [newReview, setNewReview] = useState({
  rating: 5,
  title: '',
  comment: '',
  visitDate: '',
  visitDuration: 'Day Trip'
});
```

#### Added Visit Duration Field to Form
```jsx
<div>
  <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
    Visit Duration
  </label>
  <select
    value={newReview.visitDuration}
    onChange={(e) => setNewReview({...newReview, visitDuration: e.target.value})}
    className="w-full px-4 py-2 rounded-lg"
    style={{
      backgroundColor: 'var(--surface-hover)',
      borderWidth: '1px',
      borderColor: 'var(--border)',
      color: 'var(--text-primary)'
    }}
    required
  >
    <option value="Day Trip">Day Trip</option>
    <option value="Weekend">Weekend</option>
    <option value="3-5 Days">3-5 Days</option>
    <option value="Week+">Week+</option>
    <option value="Multiple Visits">Multiple Visits</option>
  </select>
</div>
```

#### Updated Field Validation
- **Title field**: Added `minLength="5"` and `maxLength="100"`
- **Comment field**: Added `minLength="10"` and `maxLength="2000"`
- Changed `content` to `comment` throughout the form

#### Fixed Response Parsing
**Before:**
```javascript
const response = await reviewService.getParkReviews(parkCode);
setReviews(response.data || []);
setAverageRating(response.averageRating || 0);
setTotalReviews(response.total || 0);
```

**After:**
```javascript
const response = await reviewService.getParkReviews(parkCode);
setReviews(response.data || []);
// Handle stats from backend response
if (response.stats) {
  setAverageRating(response.stats.averageRating || 0);
  setTotalReviews(response.stats.totalReviews || 0);
} else {
  setAverageRating(response.averageRating || 0);
  setTotalReviews(response.total || response.pagination?.totalReviews || 0);
}
```

#### Updated Review Display for Images
Added support for both `photos` (new format) and `images` (legacy format):
```jsx
{/* Review Images - New format */}
{review.photos && review.photos.length > 0 && (
  <div className="mb-4">
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {review.photos.slice(0, 6).map((photo, index) => (
        <img
          src={photo.url || photo}
          alt={photo.caption || `Review image ${index + 1}`}
          // ...
        />
      ))}
    </div>
  </div>
)}

{/* Backward compatibility for legacy images format */}
{review.images && review.images.length > 0 && !review.photos && (
  // ... legacy image display
)}
```

Updated review content display:
```jsx
<p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
  {review.comment || review.content}
</p>
```

## Backend ParkReview Model Schema
The model expects the following fields:
- `parkCode` (string, required)
- `userId` (ObjectId, required)
- `rating` (number, 1-5, required)
- `title` (string, 5-100 chars, required)
- `comment` (string, 10-2000 chars, required)
- `visitDate` (Date, required)
- `visitDuration` (enum: 'Day Trip', 'Weekend', '3-5 Days', 'Week+', 'Multiple Visits', required)
- `activities` (array of strings, optional)
- `highlights` (array of strings, optional)
- `challenges` (array of strings, optional)
- `photos` (array of {url, caption}, optional)
- `status` (enum: 'pending', 'approved', 'rejected', default: 'approved')

## Validation Rules
From the backend validation middleware:
- **rating**: Integer between 1 and 5
- **title**: 5-100 characters
- **comment**: 10-2000 characters
- **visitDate**: Valid ISO8601 date
- **visitDuration**: Must be one of the enum values
- **activities**: Optional array
- **highlights**: Optional array
- **challenges**: Optional array

## Testing Checklist
- [x] Review submission works without errors
- [x] Visit duration field is displayed and required
- [x] Title validation (5-100 characters) works
- [x] Comment validation (10-2000 characters) works
- [x] Image upload works correctly
- [x] Reviews are displayed correctly after submission
- [x] Average rating and total reviews are shown correctly
- [x] Both new (`photos`) and legacy (`images`) formats are supported for display

## Files Modified
1. `/client/src/services/reviewService.js` - Fixed API endpoints and image data structure
2. `/client/src/components/park-details/ReviewSection.jsx` - Updated form fields, validation, and response parsing

## Notes
- The review system now uses the `ParkReview` model which is more comprehensive than the simpler `Review` model
- Backward compatibility is maintained for displaying legacy reviews with the `images` field
- All validation now matches between frontend and backend
- The form provides clear feedback about character requirements in placeholders

