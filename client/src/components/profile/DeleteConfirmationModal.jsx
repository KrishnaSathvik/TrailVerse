import React, { useState } from 'react';
import { X, AlertTriangle, Loader2 } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import reviewService from '../../services/reviewService';

const DeleteConfirmationModal = ({ review, isOpen, onClose, onSuccess }) => {
  const { showToast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await reviewService.deleteReview(review._id);
      showToast('Review deleted successfully', 'success');
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error deleting review:', error);
      showToast(
        error.message || 'Failed to delete review',
        'error'
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    if (!isDeleting) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-md w-full">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-red-100 dark:bg-red-900/20 rounded-full">
                <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Delete Review
              </h2>
            </div>
            <button
              onClick={handleClose}
              disabled={isDeleting}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition disabled:opacity-50"
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>

          <div className="mb-6">
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Are you sure you want to delete your review for{' '}
              <span className="font-semibold text-gray-900 dark:text-white">
                {review?.parkName || `Park ${review?.parkCode}`}
              </span>?
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-500">
              This action cannot be undone. Your review and any associated photos will be permanently removed.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Deleting...</span>
                </>
              ) : (
                <span>Delete Review</span>
              )}
            </button>
            <button
              onClick={handleClose}
              disabled={isDeleting}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmationModal;
