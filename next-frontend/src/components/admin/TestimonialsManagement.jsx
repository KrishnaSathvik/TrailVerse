import React, { useState, useEffect } from 'react';
import { useToast } from '../../context/ToastContext';
import api from '../../services/api';
import {
  MessageSquare, CheckCircle, XCircle, Star, 
  Eye, EyeOff, Search, Calendar,
  MapPin, Clock
} from '@components/icons';

const TestimonialsManagement = () => {
  const { showToast } = useToast();
  const [testimonials, setTestimonials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, pending, approved, rejected
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTestimonial, setSelectedTestimonial] = useState(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetchTestimonials();
  }, [filter]);

  const fetchTestimonials = async () => {
    try {
      setLoading(true);
      // Fetch all testimonials (including unapproved ones)
      const response = await api.get('/testimonials?approved=false&limit=100');
      const approvedResponse = await api.get('/testimonials?approved=true&limit=100');
      
      const allTestimonials = [...response.data.data, ...approvedResponse.data.data];
      setTestimonials(allTestimonials);
    } catch (error) {
      console.error('Error fetching testimonials:', error);
      showToast('Failed to load testimonials', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id) => {
    try {
      await api.put(`/testimonials/${id}/approve`);
      showToast('Testimonial approved successfully', 'success');
      fetchTestimonials();
    } catch (error) {
      console.error('Error approving testimonial:', error);
      showToast('Failed to approve testimonial', 'error');
    }
  };

  const handleReject = async (id) => {
    try {
      await api.delete(`/testimonials/${id}`);
      showToast('Testimonial rejected and deleted', 'success');
      fetchTestimonials();
    } catch (error) {
      console.error('Error rejecting testimonial:', error);
      showToast('Failed to reject testimonial', 'error');
    }
  };

  const handleFeature = async (id, featured) => {
    try {
      await api.put(`/testimonials/${id}/feature`, { featured: !featured });
      showToast(featured ? 'Testimonial unfeatured' : 'Testimonial featured', 'success');
      fetchTestimonials();
    } catch (error) {
      console.error('Error toggling feature:', error);
      showToast('Failed to update testimonial', 'error');
    }
  };

  const filteredTestimonials = testimonials.filter(testimonial => {
    const matchesFilter = 
      filter === 'all' || 
      (filter === 'pending' && !testimonial.approved) ||
      (filter === 'approved' && testimonial.approved) ||
      (filter === 'featured' && testimonial.featured);
    
    const matchesSearch = 
      testimonial.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      testimonial.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (testimonial.parkName && testimonial.parkName.toLowerCase().includes(searchTerm.toLowerCase()));
    
    return matchesFilter && matchesSearch;
  });

  const getStatusBadge = (testimonial) => {
    if (testimonial.featured) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
          <Star className="h-3 w-3" />
          Featured
        </span>
      );
    }
    if (testimonial.approved) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
          <CheckCircle className="h-3 w-3" />
          Approved
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
        <Clock className="h-3 w-3" />
        Pending
      </span>
    );
  };

  const renderStars = (rating) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`h-4 w-4 ${i < rating ? 'text-yellow-400 fill-current' : 'text-gray-300'}`}
      />
    ));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="h-8 w-8 border-4 border-forest-500/30 border-t-forest-500 rounded-full animate-spin mx-auto mb-4" />
          <p style={{ color: 'var(--text-secondary)' }}>Loading testimonials...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            Testimonials Management
          </h2>
          <p style={{ color: 'var(--text-secondary)' }}>
            Review and manage user testimonials
          </p>
        </div>
        <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {filteredTestimonials.length} of {testimonials.length} testimonials
        </div>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
            <input
              type="text"
              placeholder="Search testimonials..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border"
              style={{
                backgroundColor: 'var(--surface)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)'
              }}
            />
          </div>
        </div>
        <div className="flex gap-2">
          {['all', 'pending', 'approved', 'featured'].map((filterType) => (
            <button
              key={filterType}
              onClick={() => setFilter(filterType)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                filter === filterType
                  ? 'bg-forest-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {filterType.charAt(0).toUpperCase() + filterType.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Testimonials List */}
      <div className="space-y-4">
        {filteredTestimonials.length === 0 ? (
          <div className="text-center py-12">
            <MessageSquare className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--text-secondary)' }} />
            <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
              No testimonials found
            </h3>
            <p style={{ color: 'var(--text-secondary)' }}>
              {searchTerm ? 'Try adjusting your search terms' : 'No testimonials match the current filter'}
            </p>
          </div>
        ) : (
          filteredTestimonials.map((testimonial) => (
            <div
              key={testimonial._id}
              className="p-6 rounded-xl border"
              style={{
                backgroundColor: 'var(--surface)',
                borderColor: 'var(--border)'
              }}
            >
              <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                {/* Testimonial Content */}
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-forest-500 flex items-center justify-center text-white font-semibold">
                        {testimonial.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                          {testimonial.name}
                        </h4>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          {testimonial.role}
                        </p>
                      </div>
                    </div>
                    {getStatusBadge(testimonial)}
                  </div>

                  <div className="flex items-center gap-4 mb-3">
                    <div className="flex items-center gap-1">
                      {renderStars(testimonial.rating)}
                    </div>
                    {testimonial.parkName && (
                      <div className="flex items-center gap-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        <MapPin className="h-4 w-4" />
                        {testimonial.parkName}
                      </div>
                    )}
                    <div className="flex items-center gap-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                      <Calendar className="h-4 w-4" />
                      {new Date(testimonial.submittedAt).toLocaleDateString()}
                    </div>
                  </div>

                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
                    {testimonial.content}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 lg:min-w-[200px]">
                  {!testimonial.approved ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApprove(testimonial._id)}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition text-sm font-medium"
                      >
                        <CheckCircle className="h-4 w-4" />
                        Approve
                      </button>
                      <button
                        onClick={() => handleReject(testimonial._id)}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition text-sm font-medium"
                      >
                        <XCircle className="h-4 w-4" />
                        Reject
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleFeature(testimonial._id, testimonial.featured)}
                        className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg transition text-sm font-medium ${
                          testimonial.featured
                            ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                            : 'bg-gray-500 text-white hover:bg-gray-600'
                        }`}
                      >
                        {testimonial.featured ? (
                          <>
                            <EyeOff className="h-4 w-4" />
                            Unfeature
                          </>
                        ) : (
                          <>
                            <Eye className="h-4 w-4" />
                            Feature
                          </>
                        )}
                      </button>
                    </div>
                  )}
                  
                  <button
                    onClick={() => {
                      setSelectedTestimonial(testimonial);
                      setShowModal(true);
                    }}
                    className="w-full px-3 py-2 border rounded-lg hover:bg-gray-50 transition text-sm font-medium"
                    style={{
                      borderColor: 'var(--border)',
                      color: 'var(--text-primary)'
                    }}
                  >
                    View Details
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal for detailed view */}
      {showModal && selectedTestimonial && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div 
            className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            style={{ backgroundColor: 'var(--surface)' }}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Testimonial Details
                </h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition"
                >
                  <XCircle className="h-5 w-5" style={{ color: 'var(--text-secondary)' }} />
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-forest-500 flex items-center justify-center text-white font-semibold text-lg">
                    {selectedTestimonial.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="font-semibold text-lg" style={{ color: 'var(--text-primary)' }}>
                      {selectedTestimonial.name}
                    </h4>
                    <p style={{ color: 'var(--text-secondary)' }}>
                      {selectedTestimonial.role}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1">
                    {renderStars(selectedTestimonial.rating)}
                    <span className="ml-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                      {selectedTestimonial.rating}/5
                    </span>
                  </div>
                  {selectedTestimonial.parkName && (
                    <div className="flex items-center gap-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
                      <MapPin className="h-4 w-4" />
                      {selectedTestimonial.parkName}
                    </div>
                  )}
                </div>

                <div>
                  <h5 className="font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                    Testimonial Content:
                  </h5>
                  <p className="text-sm leading-relaxed p-4 rounded-lg" style={{ 
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)'
                  }}>
                    {selectedTestimonial.content}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium" style={{ color: 'var(--text-primary)' }}>Submitted:</span>
                    <p style={{ color: 'var(--text-secondary)' }}>
                      {new Date(selectedTestimonial.submittedAt).toLocaleString()}
                    </p>
                  </div>
                  {selectedTestimonial.approvedAt && (
                    <div>
                      <span className="font-medium" style={{ color: 'var(--text-primary)' }}>Approved:</span>
                      <p style={{ color: 'var(--text-secondary)' }}>
                        {new Date(selectedTestimonial.approvedAt).toLocaleString()}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 pt-4">
                  {!selectedTestimonial.approved ? (
                    <>
                      <button
                        onClick={() => {
                          handleApprove(selectedTestimonial._id);
                          setShowModal(false);
                        }}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition font-medium"
                      >
                        <CheckCircle className="h-4 w-4" />
                        Approve
                      </button>
                      <button
                        onClick={() => {
                          handleReject(selectedTestimonial._id);
                          setShowModal(false);
                        }}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition font-medium"
                      >
                        <XCircle className="h-4 w-4" />
                        Reject
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        handleFeature(selectedTestimonial._id, selectedTestimonial.featured);
                        setShowModal(false);
                      }}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition font-medium ${
                        selectedTestimonial.featured
                          ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                          : 'bg-gray-500 text-white hover:bg-gray-600'
                      }`}
                    >
                      {selectedTestimonial.featured ? (
                        <>
                          <EyeOff className="h-4 w-4" />
                          Unfeature
                        </>
                      ) : (
                        <>
                          <Eye className="h-4 w-4" />
                          Feature
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TestimonialsManagement;
