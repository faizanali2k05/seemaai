'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import apiClient from '@/lib/api';
import { useAuthStore } from '@/lib/stores/auth-store';

export default function RegisterPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    firm_name: '',
    sra_number: '',
    full_name: '',
    email: '',
    password: '',
    confirm_password: '',
    phone: '',
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    // Validation
    if (!formData.firm_name || !formData.sra_number || !formData.full_name || !formData.email || !formData.password) {
      setError('All fields marked with * are required');
      setIsLoading(false);
      return;
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters');
      setIsLoading(false);
      return;
    }

    if (formData.password !== formData.confirm_password) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    try {
      const response = await apiClient.post('/auth/register', {
        firm_name: formData.firm_name,
        sra_number: formData.sra_number,
        full_name: formData.full_name,
        email: formData.email,
        password: formData.password,
        phone: formData.phone || null,
      });

      const { access_token, refresh_token, user } = response.data;

      // Store auth
      localStorage.setItem('accessToken', access_token);
      if (refresh_token) localStorage.setItem('refreshToken', refresh_token);
      localStorage.setItem('user', JSON.stringify(user));

      useAuthStore.setState({
        user,
        accessToken: access_token,
        refreshToken: refresh_token,
        isAuthenticated: true,
        isLoading: false,
      });

      toast.success('Firm registered successfully!');
      // Always go to onboarding after registration
      router.push('/onboarding');
    } catch (err: any) {
      const message = err?.response?.data?.detail || err?.message || 'Registration failed. Please try again.';
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-seema-page-bg px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-seema-text-primary mb-2">Seema</h1>
          <p className="text-seema-text-secondary">Register your firm</p>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-8">
          <h2 className="text-2xl font-semibold text-seema-text-primary mb-2">Create Account</h2>
          <p className="text-sm text-seema-text-secondary mb-6">
            Set up your firm in under 5 minutes. You'll complete onboarding after registration.
          </p>

          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-seema-status-error text-sm font-medium">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Firm Details */}
            <div className="pb-4 border-b border-gray-100">
              <p className="text-xs font-semibold text-seema-text-muted uppercase tracking-wider mb-3">Firm Details</p>
              <div className="space-y-3">
                <div>
                  <label htmlFor="firm_name" className="block text-sm font-medium text-seema-text-primary mb-1">
                    Firm Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="firm_name"
                    name="firm_name"
                    value={formData.firm_name}
                    onChange={handleInputChange}
                    disabled={isLoading}
                    className="input-base disabled:opacity-50"
                    placeholder="Smith & Partners Solicitors"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="sra_number" className="block text-sm font-medium text-seema-text-primary mb-1">
                      SRA Number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="sra_number"
                      name="sra_number"
                      value={formData.sra_number}
                      onChange={handleInputChange}
                      disabled={isLoading}
                      className="input-base disabled:opacity-50"
                      placeholder="e.g. 654321"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="phone" className="block text-sm font-medium text-seema-text-primary mb-1">
                      Phone
                    </label>
                    <input
                      type="tel"
                      id="phone"
                      name="phone"
                      value={formData.phone}
                      onChange={handleInputChange}
                      disabled={isLoading}
                      className="input-base disabled:opacity-50"
                      placeholder="020 7123 4567"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Your Details */}
            <div className="pb-4 border-b border-gray-100">
              <p className="text-xs font-semibold text-seema-text-muted uppercase tracking-wider mb-3">Your Details</p>
              <div className="space-y-3">
                <div>
                  <label htmlFor="full_name" className="block text-sm font-medium text-seema-text-primary mb-1">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="full_name"
                    name="full_name"
                    value={formData.full_name}
                    onChange={handleInputChange}
                    disabled={isLoading}
                    className="input-base disabled:opacity-50"
                    placeholder="John Smith"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-seema-text-primary mb-1">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    disabled={isLoading}
                    className="input-base disabled:opacity-50"
                    placeholder="john@smithpartners.co.uk"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Password */}
            <div>
              <p className="text-xs font-semibold text-seema-text-muted uppercase tracking-wider mb-3">Security</p>
              <div className="space-y-3">
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-seema-text-primary mb-1">
                    Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    disabled={isLoading}
                    className="input-base disabled:opacity-50"
                    placeholder="Minimum 8 characters"
                    required
                    minLength={8}
                  />
                </div>
                <div>
                  <label htmlFor="confirm_password" className="block text-sm font-medium text-seema-text-primary mb-1">
                    Confirm Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    id="confirm_password"
                    name="confirm_password"
                    value={formData.confirm_password}
                    onChange={handleInputChange}
                    disabled={isLoading}
                    className="input-base disabled:opacity-50"
                    placeholder="Re-enter your password"
                    required
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full btn-primary disabled:opacity-50 disabled:cursor-not-allowed mt-6"
            >
              {isLoading ? 'Creating your firm...' : 'Register & Start Setup'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-100">
            <p className="text-center text-sm text-seema-text-muted">
              Already have an account?{' '}
              <a href="/login" className="text-seema-primary hover:text-seema-primary-hover font-medium">
                Sign in
              </a>
            </p>
          </div>
        </div>

        <p className="text-center text-xs text-seema-text-muted mt-8">
          By registering, you agree to Seema's Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
