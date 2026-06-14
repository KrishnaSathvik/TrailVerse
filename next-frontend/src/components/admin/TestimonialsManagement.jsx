'use client';

import React, { useState, useEffect } from 'react';
import { useToast } from '@/context/ToastContext';
import api from '@/services/api';
import {
  MessageSquare, CheckCircle, XCircle, Star,
  Eye, EyeOff, Calendar,
  MapPin, Clock
} from '@components/icons';
import {
  AdminSearchInput,
  AdminTabs,
  AdminEmptyState,
  AdminSection,
  adminCard,
  AdminLoading,
} from '@components/admin/AdminUI';

const TestimonialsManagement = ({ embedded = false, refreshKey = 0, onStatsChange }) => {
  const { showToast } = useToast();
  const [testimonials, setTestimonials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, pending, approved, featured
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTestimonial, setSelectedTestimonial] = useState(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetchTestimonials();
  }, [refreshKey]);

  const fetchTestimonials = async () => {
    try {
      setLoading(true);
      // Single fetch with no approved filter — gets ALL testimonials
      const response = await api.get('/testimonials?approved=&limit=200');
      setTestimonials(response.data.data || []);
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
      onStatsChange?.();
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
      onStatsChange?.();
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
      onStatsChange?.();
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
        <span
          className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
          style={{ backgroundColor: 'rgba(234, 179, 8, 0.15)', color: 'var(--text-primary)' }}
        >
          <Star className="h-3 w-3" style={{ color: '#eab308' }} />
          Featured
        </span>
      );
    }
    if (testimonial.approved) {
      return (
        <span
          className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
          style={{ backgroundColor: 'rgba(34, 197, 94, 0.15)', color: 'var(--text-primary)' }}
        >
          <CheckCircle className="h-3 w-3" style={{ color: '#22c55e' }} />
          Approved
        </span>
      );
    }
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
        style={{ backgroundColor: 'rgba(249, 115, 22, 0.15)', color: 'var(--text-primary)' }}
      >
        <Clock className="h-3 w-3" style={{ color: '#f97316' }} />
        Pending
      </span>
    );
  };

  const renderStars = (rating) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className="h-4 w-4"
        style={{ color: i < rating ? '#facc15' : 'var(--text-tertiary)' }}
      />
    ));
  };

  const filterTabs = [
    { id: 'all', label: 'All', count: testimonials.length },
    { id: 'pending', label: 'Pending', count: testimonials.filter((t) => !t.approved).length },
    { id: 'approved', label: 'Approved', count: testimonials.filter((t) => t.approved && !t.featured).length },
    { id: 'featured', label: 'Featured', count: testimonials.filter((t) => t.featured).length },
  ];

  if (loading) {
    return <AdminLoading label="Loading testimonials…" />;
  }

  return (
    <div className="space-y-4">
      {!embedded && (
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Testimonials</h2>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Review and manage user stories</p>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-3">
        <AdminSearchInput
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by name, park, or quote…"
          icon={MessageSquare}
        />
        <AdminTabs tabs={filterTabs} active={filter} onChange={setFilter} />
      </div>

      <AdminSection title={`${filteredTestimonials.length} result${filteredTestimonials.length === 1 ? '' : 's'}`}>
        {filteredTestimonials.length === 0 ? (
          <AdminEmptyState
            icon={MessageSquare}
            title="No testimonials found"
            description={searchTerm ? 'Try a different search term.' : 'Nothing matches this filter yet.'}
          />
        ) : (
          <div className="space-y-3">
            {filteredTestimonials.map((testimonial) => (
              <div
                key={testimonial._id}
                className="p-4 sm:p-5 rounded-xl flex flex-col lg:flex-row lg:items-start gap-4"
                style={adminCard}
              >
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

                  <div className="flex flex-wrap items-center gap-3 sm:gap-4 mb-3">
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

                <div className="flex flex-col gap-2 lg:min-w-[200px]">
                  {!testimonial.approved ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleApprove(testimonial._id)}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg transition text-sm font-medium"
                        style={{ backgroundColor: '#22c55e', color: 'white' }}
                      >
                        <CheckCircle className="h-4 w-4" />
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReject(testimonial._id)}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg transition text-sm font-medium"
                        style={{ backgroundColor: '#ef4444', color: 'white' }}
                      >
                        <XCircle className="h-4 w-4" />
                        Reject
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleFeature(testimonial._id, testimonial.featured)}
                      className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg transition text-sm font-medium"
                      style={{
                        backgroundColor: testimonial.featured ? '#eab308' : 'var(--surface-hover)',
                        color: testimonial.featured ? 'white' : 'var(--text-primary)',
                        border: testimonial.featured ? 'none' : '1px solid var(--border)',
                      }}
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
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTestimonial(testimonial);
                      setShowModal(true);
                    }}
                    className="w-full px-3 py-2 border rounded-lg transition text-sm font-medium"
                    style={{
                      borderColor: 'var(--border)',
                      color: 'var(--text-primary)',
                      backgroundColor: 'var(--surface)',
                    }}
                  >
                    View Details
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </AdminSection>

      {/* Modal for detailed view */}
      {showModal && selectedTestimonial && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div
            className="rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto mx-2 sm:mx-auto"
            style={{ backgroundColor: 'var(--surface)' }}
          >
            <div className="p-4 sm:p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Testimonial Details
                </h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-2 rounded-lg transition"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <XCircle className="h-5 w-5" />
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

                <div className="flex flex-wrap items-center gap-3 sm:gap-4">
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
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition font-medium"
                        style={{ backgroundColor: '#22c55e', color: 'white' }}
                      >
                        <CheckCircle className="h-4 w-4" />
                        Approve
                      </button>
                      <button
                        onClick={() => {
                          handleReject(selectedTestimonial._id);
                          setShowModal(false);
                        }}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition font-medium"
                        style={{ backgroundColor: '#ef4444', color: 'white' }}
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
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition font-medium"
                      style={{
                        backgroundColor: selectedTestimonial.featured ? '#eab308' : 'var(--surface-hover)',
                        color: selectedTestimonial.featured ? 'white' : 'var(--text-primary)',
                        border: selectedTestimonial.featured ? 'none' : '1px solid var(--border)'
                      }}
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
