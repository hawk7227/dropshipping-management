'use client';

// app/products/page.tsx
// Product management page with full CRUD, inventory, Shopify sync, and bulk import

import React, { Suspense, useState } from 'react';
import {ProductsPanel} from '@/components/products/ProductsPanel';
import { BulkImportPanel } from '@/components/products/BulkImportPanel';

function ProductsPageContent() {
  const [activeTab, setActiveTab] = useState<'products' | 'import'>('products');

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Page Header with Tabs */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-semibold text-gray-900">Product Management</h1>
          </div>
          <div className="border-b border-gray-200">
            <nav className="flex gap-6">
              <button
                onClick={() => setActiveTab('products')}
                className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'products'
                    ? 'border-gray-900 text-gray-900'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                All Products
              </button>
              <button
                onClick={() => setActiveTab('import')}
                className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'import'
                    ? 'border-gray-900 text-gray-900'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Bulk Import
              </button>
            </nav>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'products' && <ProductsPanel />}
        {activeTab === 'import' && <BulkImportPanel />}
      </div>
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      }
    >
      <ProductsPageContent />
    </Suspense>
  );
}
