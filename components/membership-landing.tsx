'use client';

/**
 * Membership Landing Page
 * Presents membership benefits and pricing tiers
 * 
 * Design: Professional Costco/Google Shopping aesthetic
 */

import React from 'react';
import { useRouter } from 'next/navigation';

// ============================================================================
// PRICING TIERS
// ============================================================================

const TIERS = [
  {
    id: 'monthly',
    name: 'Monthly',
    price: '$9.99',
    interval: '/month',
    description: 'Flexible month-to-month',
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
    price: '$99',
    interval: '/year',
    description: 'Best value - save $20.88',
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
// VALUE PROPS
// ============================================================================

const VALUE_PROPS = [
  {
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: 'Pay $0 at Checkout',
    description: 'Members get every product at wholesale cost - $0 checkout on all orders.',
  },
  {
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
    title: 'Free Shipping',
    description: 'Free standard shipping on orders over $35. Non-members pay $75 minimum.',
  },
  {
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    ),
    title: 'Price Drop Alerts',
    description: 'Get notified when products you want go on sale or drop in price.',
  },
];

// ============================================================================
// COMPONENT
// ============================================================================

export default function MembershipLanding() {
  const router = useRouter();

  const handleSelectTier = (tierId: string) => {
    router.push(`/membership/checkout?tier=${tierId}`);
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="bg-gray-50 border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 py-16 text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Join Membership
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Pay $0 at checkout on every order. Access wholesale pricing that was previously only available to retailers.
          </p>
        </div>
      </section>

      {/* Value Props */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {VALUE_PROPS.map((prop, i) => (
            <div key={i} className="text-center">
              <div className="w-16 h-16 mx-auto bg-gray-100 rounded-2xl flex items-center justify-center text-gray-600 mb-4">
                {prop.icon}
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {prop.title}
              </h3>
              <p className="text-gray-600">{prop.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing Section */}
      <section className="bg-gray-50 border-y border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-16">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-12">
            Choose Your Plan
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {TIERS.map((tier) => (
              <div
                key={tier.id}
                className={`relative bg-white rounded-2xl border-2 p-8 ${
                  tier.popular
                    ? 'border-gray-900 shadow-lg'
                    : 'border-gray-200'
                }`}
              >
                {tier.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-gray-900 text-white text-sm font-medium rounded-full">
                    Best Value
                  </span>
                )}

                <div className="text-center mb-6">
                  <h3 className="text-xl font-semibold text-gray-900">
                    {tier.name}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">{tier.description}</p>
                </div>

                <div className="text-center mb-6">
                  <span className="text-4xl font-bold text-gray-900">
                    {tier.price}
                  </span>
                  <span className="text-gray-500">{tier.interval}</span>
                </div>

                <ul className="space-y-3 mb-8">
                  {tier.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-3">
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
                      <span className="text-gray-600">{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSelectTier(tier.id)}
                  className={`w-full py-4 px-6 rounded-xl font-semibold transition-colors ${
                    tier.popular
                      ? 'bg-gray-900 text-white hover:bg-gray-800'
                      : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                  }`}
                >
                  Get Started
                </button>
              </div>
            ))}
          </div>

          <p className="text-center text-gray-500 mt-8">
            Cancel anytime. No contracts, no commitments.
          </p>
        </div>
      </section>

      {/* How It Works */}
      <section className="max-w-4xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-12">
          How It Works
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            {
              step: '1',
              title: 'Sign Up',
              description: 'Choose a monthly or annual plan. Cancel anytime.',
            },
            {
              step: '2',
              title: 'Shop Products',
              description: 'Browse our catalog of products at wholesale prices.',
            },
            {
              step: '3',
              title: 'Pay $0',
              description: 'Check out at $0. We cover the wholesale cost.',
            },
          ].map((item, i) => (
            <div key={i} className="text-center">
              <div className="w-12 h-12 mx-auto bg-gray-900 text-white rounded-full flex items-center justify-center text-xl font-bold mb-4">
                {item.step}
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {item.title}
              </h3>
              <p className="text-gray-600">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-gray-50 border-t border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-12">
            Frequently Asked Questions
          </h2>

          <div className="space-y-6">
            {[
              {
                q: 'How does $0 checkout work?',
                a: 'As a member, you pay a monthly or annual fee. In return, you get access to wholesale pricing on all products. The products are sourced at cost, so members pay $0 at checkout.',
              },
              {
                q: 'Can I really order unlimited products?',
                a: 'Yes, members can place unlimited orders. There are no hidden limits or restrictions on how many products you can order.',
              },
              {
                q: 'What if I want to cancel?',
                a: 'You can cancel anytime from your account settings. Your membership will remain active until the end of your billing period.',
              },
              {
                q: 'Is there a free trial?',
                a: 'We don\'t offer a free trial, but you can cancel within the first 7 days for a full refund if you\'re not satisfied.',
              },
            ].map((faq, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="font-semibold text-gray-900 mb-2">{faq.q}</h3>
                <p className="text-gray-600">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Ready to Start Saving?
        </h2>
        <p className="text-gray-600 mb-8">
          Join thousands of members who pay $0 on every order.
        </p>
        <button
          onClick={() => handleSelectTier('annual')}
          className="px-8 py-4 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-800 transition-colors"
        >
          Get Started - $99/year
        </button>
      </section>
    </div>
  );
}
