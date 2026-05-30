const VISITED_PROMPT_KEY_PREFIX = 'trailverse_review_visited_prompt_';

export function getVisitedReviewPromptKey(parkCode) {
  return `${VISITED_PROMPT_KEY_PREFIX}${parkCode}`;
}

export function hasSeenVisitedReviewPrompt(parkCode) {
  if (typeof window === 'undefined' || !parkCode) return true;
  try {
    return window.localStorage.getItem(getVisitedReviewPromptKey(parkCode)) === '1';
  } catch {
    return true;
  }
}

export function markVisitedReviewPromptSeen(parkCode) {
  if (typeof window === 'undefined' || !parkCode) return;
  try {
    window.localStorage.setItem(getVisitedReviewPromptKey(parkCode), '1');
  } catch {
    // ignore quota / private mode
  }
}

export function reviewBelongsToUser(review, user) {
  if (!review || !user) return false;
  const userId = user.id || user._id;
  if (!userId) return false;
  const reviewUserId = review.userId?._id || review.userId?.id || review.userId;
  if (!reviewUserId) return false;
  return String(reviewUserId) === String(userId);
}
