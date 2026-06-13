'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { Eye, EyeOff, Lock, Mail, ShieldCheck, Loader2 } from 'lucide-react';
import apiClient from '@/lib/api';
import { useAuthStore } from '@/lib/stores/auth-store';

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    if (!formData.email || !formData.password) {
      setError('Please enter both email and password.');
      setIsLoading(false);
      return;
    }

    try {
      const response = await apiClient.post('/auth/login', {
        email: formData.email,
        password: formData.password,
      });

      const { access_token, refresh_token, user } = response.data;

      if (!access_token) {
        setError('Authentication failed: no token received.');
        setIsLoading(false);
        return;
      }

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

      toast.success('Welcome back');

      // Always land on the dashboard after login.
      router.push('/dashboard');
    } catch (err: any) {
      const message =
        err?.response?.data?.detail || err?.message || 'Login failed. Please try again.';
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-white">
      {/* LEFT — Form panel */}
      <div className="flex-1 flex flex-col px-6 py-10 sm:px-12 lg:px-20 xl:px-28">
        {/* Logo / wordmark */}
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-seema-primary to-seema-accent flex items-center justify-center shadow-sm">
            <span className="text-white font-bold text-lg leading-none">S</span>
          </div>
          <span className="text-xl font-semibold text-seema-text-primary tracking-tight">
            Seema
          </span>
        </div>

        {/* Form */}
        <div className="flex-1 flex flex-col justify-center max-w-md w-full mx-auto py-12">
          <div className="mb-8">
            <h1 className="text-3xl font-semibold text-seema-text-primary tracking-tight">
              Sign in to Seema
            </h1>
            <p className="mt-2 text-seema-text-secondary">
              Welcome back. Sign in to manage your firm's compliance.
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <svg
                className="h-5 w-5 text-seema-status-error mt-0.5 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <p className="text-seema-status-error text-sm font-medium">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-seema-text-primary mb-1.5"
              >
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-seema-text-muted pointer-events-none" />
                <input
                  type="email"
                  id="email"
                  name="email"
                  autoComplete="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  disabled={isLoading}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-seema-primary focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed transition-shadow"
                  placeholder="you@lawfirm.co.uk"
                  required
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-seema-text-primary"
                >
                  Password
                </label>
                <a
                  href="#"
                  className="text-xs text-seema-primary hover:text-seema-primary-hover font-medium"
                >
                  Forgot password?
                </a>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-seema-text-muted pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  name="password"
                  autoComplete="current-password"
                  value={formData.password}
                  onChange={handleInputChange}
                  disabled={isLoading}
                  className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-seema-primary focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed transition-shadow"
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-seema-text-muted hover:text-seema-text-primary transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 select-none cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-seema-primary focus:ring-seema-primary cursor-pointer"
              />
              <span className="text-sm text-seema-text-secondary">Keep me signed in</span>
            </label>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-seema-primary text-white rounded-lg font-medium hover:bg-seema-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {isLoading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="text-center text-sm text-seema-text-muted mt-8">
            New firm?{' '}
            <a
              href="/register"
              className="text-seema-primary hover:text-seema-primary-hover font-medium"
            >
              Register your firm
            </a>
          </p>
        </div>

        {/* Trust footer */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-seema-text-muted">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-seema-status-success" />
            <span>SRA-aligned · ISO 27001 controls · UK GDPR</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="#" className="hover:text-seema-text-secondary transition-colors">
              Privacy
            </a>
            <a href="#" className="hover:text-seema-text-secondary transition-colors">
              Terms
            </a>
            <a href="#" className="hover:text-seema-text-secondary transition-colors">
              Support
            </a>
          </div>
        </div>
      </div>

      {/* RIGHT — Brand panel (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-[44%] xl:w-[48%] relative overflow-hidden bg-seema-sidebar-bg">
        {/* Gradient + pattern overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-seema-sidebar-bg via-[#1f3057] to-[#2d1b5a]" />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '32px 32px',
          }}
        />
        {/* Glow */}
        <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-seema-accent/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-seema-primary/20 blur-3xl" />

        <div className="relative z-10 flex flex-col justify-between p-12 xl:p-16 text-white w-full">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 backdrop-blur-sm w-fit">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-medium tracking-wide">
              Trusted by COLPs across England &amp; Wales
            </span>
          </div>

          <div className="max-w-lg">
            <h2 className="text-4xl xl:text-5xl font-semibold leading-tight tracking-tight">
              Your COLP&apos;s
              <br />
              <span className="bg-gradient-to-r from-blue-300 to-purple-300 bg-clip-text text-transparent">
                Operating System.
              </span>
            </h2>
            <p className="mt-5 text-white/70 text-lg leading-relaxed">
              SRA returns, breaches, undertakings, AML, and audit evidence —
              one platform, always inspection-ready.
            </p>

            <ul className="mt-8 space-y-3">
              {[
                'Automated SRA reporting & key-date tracking',
                'Breach register with regulator-ready exports',
                'Evidence vault with full audit trail',
              ].map((feature) => (
                <li key={feature} className="flex items-center gap-3 text-white/85">
                  <span className="h-5 w-5 rounded-full bg-white/10 border border-white/20 flex items-center justify-center flex-shrink-0">
                    <svg
                      className="h-3 w-3 text-emerald-300"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  <span className="text-sm">{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          <figure className="border-t border-white/10 pt-6 max-w-lg">
            <blockquote className="text-white/85 text-sm leading-relaxed">
              &ldquo;Cut our SRA return prep from three weeks to two days. The audit trail
              alone has paid for itself.&rdquo;
            </blockquote>
            <figcaption className="mt-3 flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-xs font-semibold">
                SC
              </div>
              <div className="text-xs text-white/60">
                <div className="text-white/90 font-medium">Sarah Chen</div>
                <div>COLP · Harrison Morgan Solicitors LLP</div>
              </div>
            </figcaption>
          </figure>
        </div>
      </div>
    </div>
  );
}
