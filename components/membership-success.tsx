'use client';

/**
 * Membership Success Page
 * Displayed after successful membership signup
 */

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function MembershipSuccess() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const verifyMembership = async () => {
      try {
        // Check if user has active membership
        const res = await fetch('/api/membership/status');
        
        if (!res.ok) {
          if (res.status === 401) {
            router.push('/login?redirect=/membership/success');
            return;
          }
          throw new Error('Failed to verify membership');
        }

        const membership = await res.json();

        if (!membership || !['active', 'trialing'].includes(membership.status)) {
          // Membership not active yet, might be processing
          // Wait and retry
          await new Promise(resolve => setTimeout(resolve, 2000));
          const retryRes = await fetch('/api/membership/status');
          const retryData = await retryRes.json();
          
          if (!retryData || !['active', 'trialing'].includes(retryData.status)) {
            setError('Your membership is being processed. Please check your email for confirmation.');
          }
        }
      } catch (err) {
        console.error('Error verifying membership:', err);
        setError('Unable to verify membership status');
      } finally {
        setLoading(false);
      }
    };

    verifyMembership();
  }, [router]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <svg
            className="w-12 h-12 mx-auto text-gray-400 animate-spin"
            viewBox="0 0 24 24"
          >
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
          <p className="mt-4 text-gray-600">Confirming your membership...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 mx-auto bg-amber-100 rounded-full flex items-center justify-center mb-4">
            <svg
              className="w-8 h-8 text-amber-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Processing
          </h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <div className="space-y-3">
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 px-4 bg-gray-900 text-white font-semibold rounded-lg hover:bg-gray-800 transition-colors"
            >
              Check Again
            </button>
            <button
              onClick={() => router.push('/account')}
              className="w-full py-3 px-4 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Go to Account
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Success state
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-md w-full text-center">
        {/* Success Icon */}
        <div className="w-20 h-20 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-6">
          <svg
            className="w-10 h-10 text-green-500"
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

        {/* Heading */}
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Welcome to Membership!
        </h1>
        <p className="text-gray-600 mb-8">
          Your membership is now active. You can now enjoy $0 pricing on all products.
        </p>

        {/* Benefits List */}
        <div className="bg-gray-50 rounded-lg p-4 mb-8 text-left">
          <p className="text-sm font-medium text-gray-900 mb-3">
            Your member benefits:
          </p>
          <ul className="space-y-2">
            {[
              'Pay $0 on every product',
              'Free shipping on orders $35+',
              'Member-exclusive deals',
              'Price drop alerts',
            ].map((benefit, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-gray-600">
                <svg
                  className="w-4 h-4 text-green-500 flex-shrink-0"
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
                {benefit}
              </li>
            ))}
          </ul>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <button
            onClick={() => router.push('/')}
            className="w-full py-3 px-4 bg-gray-900 text-white font-semibold rounded-lg hover:bg-gray-800 transition-colors"
          >
            Start Shopping
          </button>
          <button
            onClick={() => router.push('/account')}
            className="w-full py-3 px-4 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            View My Account
          </button>
        </div>
      </div>
    </div>
  );
}
