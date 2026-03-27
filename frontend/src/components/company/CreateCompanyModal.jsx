import React, { useState } from 'react';
import { Building2, X } from 'lucide-react';
import './CreateCompanyModal.css';

const CreateCompanyModal = ({ onClose, onSubmit }) => {
  const [formData, setFormData] = useState({
    name: '',
    industry: '',
    taxId: '',
    address: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await onSubmit(formData);
    } catch (err) {
      setError(err.message || 'Failed to create company');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box company-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-content">
            <Building2 size={24} />
            <h2>Create Your Company</h2>
          </div>
          <button className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {error && <div className="modal-error">{error}</div>}

        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label>Company Name *</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g., Acme Corp Pvt Ltd"
              required
            />
          </div>

          <div className="form-group">
            <label>Industry</label>
            <input
              type="text"
              name="industry"
              value={formData.industry}
              onChange={handleChange}
              placeholder="e.g., Technology, Finance, Retail"
            />
          </div>

          <div className="form-group">
            <label>Tax ID / Registration Number</label>
            <input
              type="text"
              name="taxId"
              value={formData.taxId}
              onChange={handleChange}
              placeholder="e.g., TAX123456"
            />
          </div>

          <div className="form-group">
            <label>Address</label>
            <textarea
              name="address"
              value={formData.address}
              onChange={handleChange}
              placeholder="Company address"
              rows="3"
            />
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Creating...' : 'Create Company'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateCompanyModal;
