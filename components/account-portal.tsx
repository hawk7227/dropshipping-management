'use client';

/**
 * Member Account Portal
 * Dashboard for membership management, billing, and account settings
 * 
 * Design: Professional white/gray, clean layout
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface Membership {
  id: string;
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid';
  tier: 'monthly' | 'annual';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  stripeCustomerId: string;
}

interface Invoice {
  id: string;
  number: string | null;
  amount: number;
  currency: string;
  status: string;
  created: number;
  hostedUrl: string | null;
  pdfUrl: string | null;
}

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

interface User {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
}

type TabId = 'overview' | 'billing' | 'settings';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function formatCardBrand(brand: string): string {
  const brands: Record<string, string> = {
    visa: 'Visa',
    mastercard: 'Mastercard',
    amex: 'American Express',
    discover: 'Discover',
  };
  return brands[brand.toLowerCase()] || brand;
}

// ============================================================================
// SUBCOMPONENTS
// ============================================================================

/**
 * Status Badge
 */
function StatusBadge({
  status,
  cancelAtPeriodEnd,
}: {
  status: string;
  cancelAtPeriodEnd: boolean;
}) {
  let bgColor = 'bg-gray-100';
  let textColor = 'text-gray-700';
  let label = status;

  if (cancelAtPeriodEnd) {
    bgColor = 'bg-amber-50';
    textColor = 'text-amber-700';
    label = 'Canceling';
  } else {
    switch (status) {
      case 'active':
        bgColor = 'bg-green-50';
        textColor = 'text-green-700';
        label = 'Active';
        break;
      case 'trialing':
        bgColor = 'bg-blue-50';
        textColor = 'text-blue-700';
        label = 'Trial';
        break;
      case 'past_due':
        bgColor = 'bg-red-50';
        textColor = 'text-red-700';
        label = 'Past Due';
        break;
      case 'canceled':
        bgColor = 'bg-gray-100';
        textColor = 'text-gray-500';
        label = 'Canceled';
        break;
    }
  }

  return (
    <span
      className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${bgColor} ${textColor}`}
    >
      {label}
    </span>
  );
}

/**
 * Tab Button
 */
function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
        active
          ? 'bg-gray-900 text-white'
          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Loading Spinner
 */
function Spinner({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
        fill="none"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

/**
 * Overview Tab Content
 */
function OverviewTab({
  membership,
  user,
  paymentMethod,
  onManageBilling,
  onCancel,
  onReactivate,
  processing,
}: {
  membership: Membership;
  user: User;
  paymentMethod: PaymentMethod | null;
  onManageBilling: () => void;
  onCancel: () => void;
  onReactivate: () => void;
  processing: string | null;
}) {
  const isActive = ['active', 'trialing'].includes(membership.status);
  const isPastDue = membership.status === 'past_due';

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Membership Status
            </h2>
            <p className="text-gray-500 mt-1">
              {membership.tier === 'annual' ? 'Annual' : 'Monthly'} Plan
            </p>
          </div>
          <StatusBadge
            status={membership.status}
            cancelAtPeriodEnd={membership.cancelAtPeriodEnd}
          />
        </div>

        {/* Past Due Warning */}
        {isPastDue && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start gap-3">
              <svg
                className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
              <div>
                <p className="font-medium text-red-800">Payment Failed</p>
                <p className="text-sm text-red-700 mt-1">
                  Please update your payment method to continue your membership.
                </p>
                <button
                  onClick={onManageBilling}
                  className="mt-2 text-sm font-medium text-red-700 hover:text-red-900"
                >
                  Update Payment Method
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Cancellation Notice */}
        {membership.cancelAtPeriodEnd && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-3">
              <svg
                className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <div>
                <p className="font-medium text-amber-800">Membership Ending</p>
                <p className="text-sm text-amber-700 mt-1">
                  Your membership ends on{' '}
                  {formatDate(membership.currentPeriodEnd)}. Reactivate anytime.
                </p>
                <button
                  onClick={onReactivate}
                  disabled={processing === 'reactivate'}
                  className="mt-2 text-sm font-medium text-amber-700 hover:text-amber-900 disabled:opacity-50"
                >
                  {processing === 'reactivate'
                    ? 'Reactivating...'
                    : 'Reactivate Membership'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Details Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <p className="text-sm text-gray-500">Current Period</p>
            <p className="font-medium text-gray-900">
              {formatDate(membership.currentPeriodStart)} -{' '}
              {formatDate(membership.currentPeriodEnd)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">
              {membership.cancelAtPeriodEnd ? 'Ends On' : 'Next Billing'}
            </p>
            <p className="font-medium text-gray-900">
              {formatDate(membership.currentPeriodEnd)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Price</p>
            <p className="font-medium text-gray-900">
              {membership.tier === 'annual' ? '$99.00/year' : '$9.99/month'}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Member Since</p>
            <p className="font-medium text-gray-900">
              {formatDate(user.createdAt)}
            </p>
          </div>
        </div>
      </div>

      {/* Payment Method Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Payment Method</h2>
          <button
            onClick={onManageBilling}
            className="text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            Update
          </button>
        </div>

        {paymentMethod ? (
          <div className="flex items-center gap-4">
            <div className="w-12 h-8 bg-gray-100 rounded flex items-center justify-center">
              <span className="text-xs font-bold text-gray-600">
                {formatCardBrand(paymentMethod.brand).slice(0, 4).toUpperCase()}
              </span>
            </div>
            <div>
              <p className="font-medium text-gray-900">
                {formatCardBrand(paymentMethod.brand)} ending in{' '}
                {paymentMethod.last4}
              </p>
              <p className="text-sm text-gray-500">
                Expires {paymentMethod.expMonth}/{paymentMethod.expYear}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-gray-500">No payment method on file</p>
        )}
      </div>

      {/* Actions Card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Actions</h2>
        <div className="space-y-3">
          <button
            onClick={onManageBilling}
            className="w-full flex items-center justify-between p-4 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <svg
                className="w-5 h-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                />
              </svg>
              <span className="text-gray-900">Manage Billing</span>
            </div>
            <svg
              className="w-5 h-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>

          {isActive && !membership.cancelAtPeriodEnd && (
            <button
              onClick={onCancel}
              className="w-full flex items-center justify-between p-4 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <svg
                  className="w-5 h-5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
                <span className="text-gray-700">Cancel Membership</span>
              </div>
              <svg
                className="w-5 h-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Billing History Tab
 */
function BillingTab({ invoices }: { invoices: Invoice[] }) {
  if (invoices.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
        <svg
          className="w-12 h-12 mx-auto text-gray-300"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <h3 className="mt-4 text-lg font-medium text-gray-900">No invoices yet</h3>
        <p className="mt-2 text-gray-500">
          Your billing history will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Billing History</h2>
      </div>
      <div className="divide-y divide-gray-200">
        {invoices.map((invoice) => (
          <div
            key={invoice.id}
            className="px-6 py-4 flex items-center justify-between hover:bg-gray-50"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <div>
                <p className="font-medium text-gray-900">
                  Invoice {invoice.number || invoice.id.slice(-8)}
                </p>
                <p className="text-sm text-gray-500">
                  {formatDate(new Date(invoice.created * 1000).toISOString())}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="font-medium text-gray-900">
                  {formatCurrency(invoice.amount)}
                </p>
                <p
                  className={`text-sm ${
                    invoice.status === 'paid'
                      ? 'text-green-600'
                      : 'text-gray-500'
                  }`}
                >
                  {invoice.status === 'paid' ? 'Paid' : invoice.status}
                </p>
              </div>
              {invoice.hostedUrl && (
                <a
                  href={invoice.hostedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 text-gray-400 hover:text-gray-600"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Settings Tab
 */
function SettingsTab({ user }: { user: User }) {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Account Information
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Address
            </label>
            <p className="px-4 py-2 bg-gray-50 rounded-lg text-gray-900">
              {user.email}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Member ID
            </label>
            <p className="px-4 py-2 bg-gray-50 rounded-lg text-gray-600 font-mono text-sm">
              {user.id}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Data & Privacy
        </h2>
        <div className="space-y-3">
          <button className="text-sm text-gray-600 hover:text-gray-900">
            Download my data
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Cancel Confirmation Modal
 */
function CancelModal({
  open,
  onClose,
  onConfirm,
  processing,
  periodEnd,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  processing: boolean;
  periodEnd: string;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl max-w-md w-full p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Cancel Membership?
        </h2>
        <p className="text-gray-600 mb-4">
          Your membership will remain active until {formatDate(periodEnd)}. After
          that, you will lose access to member pricing.
        </p>

        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <p className="font-medium text-gray-900 mb-2">You will lose:</p>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>$0 checkout on all orders</li>
            <li>Access to wholesale pricing</li>
            <li>Free shipping on orders $35+</li>
            <li>Member-exclusive deals</li>
          </ul>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg border border-gray-300 font-medium text-gray-700 hover:bg-gray-50"
          >
            Keep Membership
          </button>
          <button
            onClick={onConfirm}
            disabled={processing}
            className="flex-1 px-4 py-2 rounded-lg bg-red-600 font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {processing ? 'Canceling...' : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AccountPortal() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [processing, setProcessing] = useState<string | null>(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);

  const [user, setUser] = useState<User | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);

  // Fetch all data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [userRes, membershipRes, invoicesRes, paymentRes] =
          await Promise.all([
            fetch('/api/auth/me'),
            fetch('/api/membership/status'),
            fetch('/api/membership/invoices'),
            fetch('/api/membership/payment-method'),
          ]);

        if (!userRes.ok) {
          router.push('/login?redirect=/account');
          return;
        }

        const userData = await userRes.json();
        setUser(userData);

        if (membershipRes.ok) {
          const membershipData = await membershipRes.json();
          if (membershipData) {
            setMembership(membershipData);
          } else {
            router.push('/membership');
            return;
          }
        }

        if (invoicesRes.ok) {
          setInvoices(await invoicesRes.json());
        }

        if (paymentRes.ok) {
          setPaymentMethod(await paymentRes.json());
        }
      } catch (err) {
        setError('Failed to load account data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router]);

  // Manage billing (open Stripe portal)
  const handleManageBilling = useCallback(async () => {
    setProcessing('billing');
    try {
      const res = await fetch('/api/membership/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnUrl: window.location.href }),
      });

      if (!res.ok) throw new Error();

      const { url } = await res.json();
      window.location.href = url;
    } catch {
      setError('Failed to open billing portal');
      setProcessing(null);
    }
  }, []);

  // Cancel membership
  const handleCancel = useCallback(async () => {
    setProcessing('cancel');
    try {
      const res = await fetch('/api/membership/cancel', { method: 'POST' });

      if (!res.ok) throw new Error();

      const updated = await res.json();
      setMembership(updated);
      setCancelModalOpen(false);
    } catch {
      setError('Failed to cancel membership');
    } finally {
      setProcessing(null);
    }
  }, []);

  // Reactivate membership
  const handleReactivate = useCallback(async () => {
    setProcessing('reactivate');
    try {
      const res = await fetch('/api/membership/reactivate', { method: 'POST' });

      if (!res.ok) throw new Error();

      const updated = await res.json();
      setMembership(updated);
    } catch {
      setError('Failed to reactivate membership');
    } finally {
      setProcessing(null);
    }
  }, []);

  // Loading
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Spinner className="w-10 h-10 text-gray-400 mx-auto" />
          <p className="mt-4 text-gray-500">Loading account...</p>
        </div>
      </div>
    );
  }

  // Error
  if (!membership || !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl p-8 max-w-md w-full text-center">
          <p className="text-gray-900 font-medium">Unable to load account</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-gray-900 text-white rounded-lg"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">My Account</h1>
              <p className="text-gray-500">{user.email}</p>
            </div>
            <button
              onClick={() => router.push('/')}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Back to Shop
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-2">
            <TabButton
              active={activeTab === 'overview'}
              onClick={() => setActiveTab('overview')}
            >
              Overview
            </TabButton>
            <TabButton
              active={activeTab === 'billing'}
              onClick={() => setActiveTab('billing')}
            >
              Billing
            </TabButton>
            <TabButton
              active={activeTab === 'settings'}
              onClick={() => setActiveTab('settings')}
            >
              Settings
            </TabButton>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {activeTab === 'overview' && (
          <OverviewTab
            membership={membership}
            user={user}
            paymentMethod={paymentMethod}
            onManageBilling={handleManageBilling}
            onCancel={() => setCancelModalOpen(true)}
            onReactivate={handleReactivate}
            processing={processing}
          />
        )}

        {activeTab === 'billing' && <BillingTab invoices={invoices} />}

        {activeTab === 'settings' && <SettingsTab user={user} />}
      </main>

      {/* Cancel Modal */}
      <CancelModal
        open={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
        onConfirm={handleCancel}
        processing={processing === 'cancel'}
        periodEnd={membership.currentPeriodEnd}
      />
    </div>
  );
}
