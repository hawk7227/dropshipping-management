'use client';

/**
 * Membership Checkout Page
 * Professional sign-up flow with Stripe Elements
 * 
 * Design: Clean white/gray, subtle green savings, no aggressive sales
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';

// Initialize Stripe
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!
);

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface PricingTier {
  id: 'monthly' | 'annual';
  name: string;
  price: number;
  interval: 'month' | 'year';
  priceDisplay: string;
  monthlyEquivalent: string;
  savings?: string;
  popular?: boolean;
  features: string[];
}

interface User {
  id: string;
  email: string;
}

interface CheckoutState {
  step: 'select' | 'payment' | 'processing' | 'success';
  selectedTier: PricingTier | null;
  clientSecret: string | null;
  loading: boolean;
  error: string | null;
}

// ============================================================================
// PRICING TIERS
// ============================================================================

const PRICING_TIERS: PricingTier[] = [
  {
    id: 'monthly',
    name: 'Monthly',
    price: 999,
    interval: 'month',
    priceDisplay: '$9.99',
    monthlyEquivalent: '$9.99/mo',
    features: [
      'Pay $0 on every product',
      'Free shipping on orders $35+',
      'Member-exclusive deals',
      'Price drop alerts',
      'Cancel anytime',
    ],
  },
  {
    id: 'annual',
    name: 'Annual',
    price: 9900,
    interval: 'year',
    priceDisplay: '$99.00',
    monthlyEquivalent: '$8.25/mo',
    savings: 'Save $20.88',
    popular: true,
    features: [
      'Pay $0 on every product',
      'Free shipping on orders $35+',
      'Member-exclusive deals',
      'Price drop alerts',
      'Early access to new products',
      'Priority customer support',
    ],
  },
];

// ============================================================================
// SUBCOMPONENTS
// ============================================================================

/**
 * Plan Selection Cards
 */
function PlanSelector({
  tiers,
  selected,
  onSelect,
}: {
  tiers: PricingTier[];
  selected: PricingTier | null;
  onSelect: (tier: PricingTier) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {tiers.map((tier) => {
        const isSelected = selected?.id === tier.id;

        return (
          <button
            key={tier.id}
            onClick={() => onSelect(tier)}
            className={`
              relative p-6 rounded-xl border-2 text-left transition-all duration-200
              ${isSelected
                ? 'border-gray-900 bg-gray-50 shadow-sm'
                : 'border-gray-200 bg-white hover:border-gray-300'
              }
            `}
          >
            {tier.popular && (
              <span className="absolute -top-3 left-4 px-3 py-1 bg-gray-900 text-white text-xs font-medium rounded-full">
                Best Value
              </span>
            )}

            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {tier.name}
                </h3>
                <p className="text-sm text-gray-500">
                  Billed {tier.interval === 'month' ? 'monthly' : 'annually'}
                </p>
              </div>

              {/* Radio indicator */}
              <div
                className={`
                  w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors
                  ${isSelected ? 'border-gray-900 bg-gray-900' : 'border-gray-300'}
                `}
              >
                {isSelected && (
                  <svg
                    className="w-3 h-3 text-white"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </div>
            </div>

            <div className="flex items-baseline gap-1 mb-2">
              <span className="text-3xl font-bold text-gray-900">
                {tier.priceDisplay}
              </span>
              <span className="text-gray-500">/{tier.interval}</span>
            </div>

            <p className="text-sm text-gray-600 mb-3">
              {tier.monthlyEquivalent}
            </p>

            {tier.savings && (
              <p className="text-sm font-medium text-green-600">{tier.savings}</p>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Benefits List
 */
function BenefitsList({ features }: { features: string[] }) {
  return (
    <div className="bg-gray-50 rounded-xl p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        What You Get
      </h3>
      <ul className="space-y-3">
        {features.map((feature, index) => (
          <li key={index} className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span className="text-gray-700">{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Payment Form (inside Stripe Elements)
 */
function PaymentForm({
  tier,
  onSuccess,
  onError,
}: {
  tier: PricingTier;
  onSuccess: () => void;
  onError: (message: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [ready, setReady] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) return;

    setProcessing(true);

    try {
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/membership/success`,
        },
      });

      if (error) {
        onError(error.message || 'Payment failed. Please try again.');
        setProcessing(false);
      } else {
        onSuccess();
      }
    } catch (err) {
      onError('An unexpected error occurred.');
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Order summary */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex justify-between items-center">
          <span className="text-gray-600">Plan</span>
          <span className="font-medium text-gray-900">
            {tier.name} - {tier.priceDisplay}/{tier.interval}
          </span>
        </div>
      </div>

      {/* Stripe Payment Element */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <PaymentElement
          onReady={() => setReady(true)}
          options={{
            layout: 'tabs',
          }}
        />
      </div>

      {/* Submit button */}
      <button
        type="submit"
        disabled={!stripe || !ready || processing}
        className={`
          w-full py-4 px-6 rounded-lg font-semibold text-white
          transition-all duration-200 flex items-center justify-center gap-2
          ${processing || !ready
            ? 'bg-gray-400 cursor-not-allowed'
            : 'bg-gray-900 hover:bg-gray-800'
          }
        `}
      >
        {processing ? (
          <>
            <Spinner />
            Processing...
          </>
        ) : (
          `Start Membership - ${tier.priceDisplay}`
        )}
      </button>

      <p className="text-center text-sm text-gray-500">
        By subscribing, you agree to our Terms of Service and Privacy Policy.
        Cancel anytime from your account.
      </p>
    </form>
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

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function MembershipCheckout() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [user, setUser] = useState<User | null>(null);
  const [state, setState] = useState<CheckoutState>({
    step: 'select',
    selectedTier: null,
    clientSecret: null,
    loading: true,
    error: null,
  });

  // Fetch user on mount
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          setUser(data);
        } else {
          router.push(`/login?redirect=${encodeURIComponent('/membership/checkout')}`);
        }
      } catch (err) {
        setState((prev) => ({ ...prev, error: 'Failed to load user data' }));
      } finally {
        setState((prev) => ({ ...prev, loading: false }));
      }
    };

    fetchUser();
  }, [router]);

  // Pre-select tier from URL
  useEffect(() => {
    const tierParam = searchParams.get('tier');
    if (tierParam) {
      const tier = PRICING_TIERS.find((t) => t.id === tierParam);
      if (tier) {
        setState((prev) => ({ ...prev, selectedTier: tier }));
      }
    }
  }, [searchParams]);

  // Handle tier selection
  const handleSelectTier = useCallback((tier: PricingTier) => {
    setState((prev) => ({ ...prev, selectedTier: tier, error: null }));
  }, []);

  // Continue to payment
  const handleContinue = useCallback(async () => {
    if (!state.selectedTier || !user) return;

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const res = await fetch('/api/membership/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tier: state.selectedTier.id,
          userId: user.id,
          email: user.email,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create checkout');
      }

      const { clientSecret } = await res.json();

      setState((prev) => ({
        ...prev,
        loading: false,
        step: 'payment',
        clientSecret,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Something went wrong',
      }));
    }
  }, [state.selectedTier, user]);

  // Handle payment success
  const handlePaymentSuccess = useCallback(() => {
    setState((prev) => ({ ...prev, step: 'success' }));
    setTimeout(() => router.push('/membership/success'), 1500);
  }, [router]);

  // Handle payment error
  const handlePaymentError = useCallback((message: string) => {
    setState((prev) => ({ ...prev, error: message }));
  }, []);

  // Loading state
  if (state.loading && state.step === 'select') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Spinner className="w-10 h-10 text-gray-400 mx-auto" />
          <p className="mt-4 text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() =>
                state.step === 'payment'
                  ? setState((prev) => ({ ...prev, step: 'select', clientSecret: null }))
                  : router.back()
              }
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
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
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Back
            </button>

            {/* Progress */}
            <div className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  state.step !== 'select'
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-900 text-white'
                }`}
              >
                {state.step !== 'select' ? (
                  <svg
                    className="w-4 h-4"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : (
                  '1'
                )}
              </div>
              <div className="w-12 h-0.5 bg-gray-300" />
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  state.step === 'payment' || state.step === 'success'
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                2
              </div>
            </div>

            <div className="w-16" />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* Error Message */}
        {state.error && (
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
                <p className="font-medium text-red-800">Error</p>
                <p className="text-sm text-red-700 mt-1">{state.error}</p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Form Section */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              {/* Step 1: Plan Selection */}
              {state.step === 'select' && (
                <>
                  <h1 className="text-2xl font-bold text-gray-900 mb-2">
                    Choose Your Plan
                  </h1>
                  <p className="text-gray-600 mb-6">
                    Select a membership to unlock $0 pricing on every order.
                  </p>

                  <PlanSelector
                    tiers={PRICING_TIERS}
                    selected={state.selectedTier}
                    onSelect={handleSelectTier}
                  />

                  <button
                    onClick={handleContinue}
                    disabled={!state.selectedTier || state.loading}
                    className={`
                      w-full mt-6 py-4 px-6 rounded-lg font-semibold text-white
                      transition-all duration-200 flex items-center justify-center gap-2
                      ${!state.selectedTier || state.loading
                        ? 'bg-gray-300 cursor-not-allowed'
                        : 'bg-gray-900 hover:bg-gray-800'
                      }
                    `}
                  >
                    {state.loading ? (
                      <>
                        <Spinner />
                        Loading...
                      </>
                    ) : (
                      'Continue to Payment'
                    )}
                  </button>
                </>
              )}

              {/* Step 2: Payment */}
              {state.step === 'payment' &&
                state.clientSecret &&
                state.selectedTier && (
                  <>
                    <h1 className="text-2xl font-bold text-gray-900 mb-6">
                      Payment Details
                    </h1>

                    <Elements
                      stripe={stripePromise}
                      options={{
                        clientSecret: state.clientSecret,
                        appearance: {
                          theme: 'stripe',
                          variables: {
                            colorPrimary: '#111827',
                            colorBackground: '#ffffff',
                            colorText: '#1f2937',
                            fontFamily: 'system-ui, sans-serif',
                            borderRadius: '8px',
                          },
                        },
                      }}
                    >
                      <PaymentForm
                        tier={state.selectedTier}
                        onSuccess={handlePaymentSuccess}
                        onError={handlePaymentError}
                      />
                    </Elements>
                  </>
                )}

              {/* Success State */}
              {state.step === 'success' && (
                <div className="text-center py-12">
                  <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-4">
                    <svg
                      className="w-8 h-8 text-green-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    Welcome to Membership
                  </h2>
                  <p className="text-gray-600">Redirecting to your account...</p>
                </div>
              )}
            </div>
          </div>

          {/* Benefits Sidebar */}
          <div className="lg:col-span-2">
            <BenefitsList
              features={
                state.selectedTier?.features ||
                PRICING_TIERS.find((t) => t.popular)?.features ||
                []
              }
            />

            {/* Security Badge */}
            <div className="mt-6 flex items-center justify-center gap-3 text-gray-400">
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" />
              </svg>
              <span className="text-sm">Secure checkout by Stripe</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
