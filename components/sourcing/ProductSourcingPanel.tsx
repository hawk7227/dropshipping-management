'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';

// ================================================================
// TYPES
// ================================================================
interface Supplier {
  id: string;
  name: string;
  logo: string;
  color: string;
  api: string;
}

interface Category {
  id: string;
  name: string;
  icon: string;
  count: number;
}

interface ShipsFrom {
  id: string;
  name: string;
  flag: string;
  days: string;
}

interface Product {
  id: string;
  title: string;
  image: string;
  supplier: Supplier;
  supplierSku: string;
  sourceUrl: string;
  category: Category;
  costPrice: number;
  retailPrice: number;
  competitorPrice: number;
  profitAmount: number;
  profitPercent: number;
  weight: number;
  dimensions: string;
  stock: number;
  minOrderQty: number;
  rating: number;
  reviewCount: number;
  shipsFrom: ShipsFrom;
  shippingCost: number;
  freeShipping: boolean;
  deliveryDays: number;
  isHotDeal: boolean;
  isNewArrival: boolean;
  isBestSeller: boolean;
  isTrending: boolean;
  addedAt: number;
  lastChecked: number;
  salesLast30Days: number;
}

interface Filters {
  search: string;
  category: string;
  supplier: string;
  minProfit: number;
  maxProfit: number;
  maxWeight: number;
  minCost: number;
  maxCost: number;
  minRating: number;
  minReviews: number;
  shipsFrom: string;
  maxShipDays: number;
  freeShipOnly: boolean;
  minStock: number;
  inStockOnly: boolean;
  hotDealsOnly: boolean;
  newArrivalsOnly: boolean;
  bestSellersOnly: boolean;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

interface Stats {
  totalIndexed: number;
  matchingDeals: number;
  avgProfit: number;
  hotDeals: number;
  newToday: number;
  suppliers: number;
}

interface ImportDestination {
  id: string;
  name: string;
  icon: string;
}

// ================================================================
// CONSTANTS
// ================================================================
const SUPPLIERS: Supplier[] = [
  { id: 'amazon', name: 'Amazon', logo: '🅰️', color: '#ff9900', api: 'Rainforest API' },
  { id: 'walmart', name: 'Walmart', logo: '🔵', color: '#0071ce', api: 'Walmart API' },
  { id: 'aliexpress', name: 'AliExpress', logo: '🔴', color: '#e62e04', api: 'AliExpress API' },
  { id: 'costco', name: 'Costco', logo: '⭕', color: '#e31837', api: 'Scraper' },
  { id: 'target', name: 'Target', logo: '🎯', color: '#cc0000', api: 'Target API' },
  { id: 'ebay', name: 'eBay', logo: '🛒', color: '#86b817', api: 'eBay API' },
];

const CATEGORIES: Category[] = [
  { id: 'electronics', name: 'Electronics', icon: '📱', count: 8420 },
  { id: 'home', name: 'Home & Kitchen', icon: '🏠', count: 6230 },
  { id: 'beauty', name: 'Beauty & Health', icon: '💄', count: 4180 },
  { id: 'sports', name: 'Sports & Outdoors', icon: '⚽', count: 3650 },
  { id: 'toys', name: 'Toys & Games', icon: '🎮', count: 2890 },
  { id: 'fashion', name: 'Fashion', icon: '👕', count: 2540 },
  { id: 'pets', name: 'Pet Supplies', icon: '🐕', count: 1820 },
  { id: 'auto', name: 'Automotive', icon: '🚗', count: 1450 },
  { id: 'garden', name: 'Garden & Outdoor', icon: '🌱', count: 1230 },
  { id: 'office', name: 'Office Products', icon: '📎', count: 980 },
];

const SHIPS_FROM: ShipsFrom[] = [
  { id: 'usa', name: 'USA', flag: '🇺🇸', days: '2-5' },
  { id: 'china', name: 'China', flag: '🇨🇳', days: '7-20' },
  { id: 'europe', name: 'Europe', flag: '🇪🇺', days: '5-10' },
  { id: 'uk', name: 'UK', flag: '🇬🇧', days: '5-8' },
];

const PRODUCT_TEMPLATES = [
  'Wireless Bluetooth Earbuds', 'Smart Watch Fitness Tracker', 'Portable Power Bank 20000mAh',
  'LED Ring Light with Stand', 'Stainless Steel Water Bottle', 'Yoga Mat Non-Slip Premium',
  'Wireless Phone Charger Fast', 'Mini Drone with 4K Camera', 'Bluetooth Speaker Waterproof',
  'Electric Toothbrush Sonic', 'Air Fryer 5.8 Quart Digital', 'Robot Vacuum Smart Mapping',
  'Ring Light 18 inch Professional', 'Resistance Bands Set 5 Pack', 'Instant Pot 8 Quart',
  'Noise Cancelling Headphones', 'Massage Gun Deep Tissue Pro', 'Smart LED Light Bulbs 4 Pack',
  'Portable Blender USB Rechargeable', 'Security Camera Wireless 1080P', 'Gaming Mouse RGB 16000 DPI',
  'Weighted Blanket 15lb Queen', 'Electric Kettle Gooseneck', 'Humidifier Cool Mist Large',
  'Smart Jump Rope with Counter', 'Laptop Stand Aluminum Adjustable', 'Kitchen Scale Digital Precision',
  'Hair Dryer Ionic Professional', 'Foam Roller High Density', 'Smart Plug WiFi Mini 4 Pack',
  'Car Phone Mount Magnetic', 'Milk Frother Electric Handheld', 'Ice Maker Countertop Portable',
  'Facial Cleansing Brush Sonic', 'Cordless Vacuum Stick Lightweight', 'Electric Wine Opener Set',
  'Meal Prep Containers 30 Pack', 'Phone Tripod with Remote', 'Sunrise Alarm Clock Light',
  'Electric Blanket Heated Throw', 'Water Flosser Cordless', 'Air Purifier HEPA Filter',
  'Espresso Machine Automatic', 'Standing Desk Converter', 'Beard Trimmer Professional'
];

const IMPORT_DESTINATIONS: ImportDestination[] = [
  { id: 'shopify', name: 'Shopify', icon: '🛒' },
  { id: 'ebay', name: 'eBay', icon: '🏷️' },
  { id: 'amazon', name: 'Amazon', icon: '📦' },
  { id: 'tiktok', name: 'TikTok Shop', icon: '🎵' },
  { id: 'woocommerce', name: 'WooCommerce', icon: '🔧' },
  { id: 'csv', name: 'Export CSV', icon: '📄' },
];

const PRODUCT_SUFFIXES = ['Pro', 'Plus', 'Max', 'Lite', 'Ultra', '2024', 'V2', 'Premium', 'Elite', 'Basic'];

const DEFAULT_FILTERS: Filters = {
  search: '',
  category: 'all',
  supplier: 'all',
  minProfit: 80,
  maxProfit: 500,
  maxWeight: 5,
  minCost: 1,
  maxCost: 100,
  minRating: 4.0,
  minReviews: 50,
  shipsFrom: 'all',
  maxShipDays: 30,
  freeShipOnly: false,
  minStock: 10,
  inStockOnly: true,
  hotDealsOnly: false,
  newArrivalsOnly: false,
  bestSellersOnly: false,
  sortBy: 'profit',
  sortOrder: 'desc'
};

// ================================================================
// UTILITY FUNCTIONS
// ================================================================
const fmt = (n: number) => '$' + n.toFixed(2);
const fmtK = (n: number) => n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n.toString();
const pct = (n: number) => Math.round(n) + '%';

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return seconds + 's ago';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + 'm ago';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + 'h ago';
  return Math.floor(hours / 24) + 'd ago';
}

// ================================================================
// PRODUCT GENERATOR
// ================================================================
function generateProducts(count: number = 500): Product[] {
  const products: Product[] = [];
  
  for (let i = 0; i < count; i++) {
    const supplier = SUPPLIERS[Math.floor(Math.random() * SUPPLIERS.length)];
    const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
    const shipsFrom = SHIPS_FROM[Math.floor(Math.random() * SHIPS_FROM.length)];
    
    const costPrice = parseFloat((Math.random() * 80 + 2).toFixed(2));
    const profitMultiplier = 1 + (Math.random() * 4 + 0.3);
    const retailPrice = parseFloat((costPrice * profitMultiplier).toFixed(2));
    const competitorPrice = parseFloat((retailPrice * (0.85 + Math.random() * 0.3)).toFixed(2));
    const profitAmount = retailPrice - costPrice;
    const profitPercent = ((profitAmount / costPrice) * 100);
    const weight = parseFloat((Math.random() * 8 + 0.1).toFixed(2));
    
    products.push({
      id: `PROD-${String(i + 1).padStart(6, '0')}`,
      title: PRODUCT_TEMPLATES[Math.floor(Math.random() * PRODUCT_TEMPLATES.length)] + 
             ' ' + PRODUCT_SUFFIXES[Math.floor(Math.random() * PRODUCT_SUFFIXES.length)],
      image: `https://picsum.photos/seed/${i + 200}/400/400`,
      supplier,
      supplierSku: `${supplier.id.toUpperCase()}-${Math.random().toString(36).substr(2, 8).toUpperCase()}`,
      sourceUrl: '#',
      category,
      costPrice,
      retailPrice,
      competitorPrice,
      profitAmount,
      profitPercent,
      weight,
      dimensions: `${Math.floor(Math.random() * 12 + 3)}" × ${Math.floor(Math.random() * 10 + 2)}" × ${Math.floor(Math.random() * 6 + 1)}"`,
      stock: Math.floor(Math.random() * 5000) + 5,
      minOrderQty: [1, 2, 5, 10, 25][Math.floor(Math.random() * 5)],
      rating: parseFloat((Math.random() * 1.5 + 3.5).toFixed(1)),
      reviewCount: Math.floor(Math.random() * 15000) + 10,
      shipsFrom,
      shippingCost: shipsFrom.id === 'usa' ? parseFloat((Math.random() * 5 + 2).toFixed(2)) : parseFloat((Math.random() * 3).toFixed(2)),
      freeShipping: Math.random() > 0.6,
      deliveryDays: shipsFrom.id === 'usa' ? Math.floor(Math.random() * 5) + 2 : Math.floor(Math.random() * 15) + 7,
      isHotDeal: Math.random() > 0.88,
      isNewArrival: Math.random() > 0.92,
      isBestSeller: Math.random() > 0.90,
      isTrending: Math.random() > 0.85,
      addedAt: Date.now() - Math.floor(Math.random() * 14 * 24 * 60 * 60 * 1000),
      lastChecked: Date.now() - Math.floor(Math.random() * 60 * 60 * 1000),
      salesLast30Days: Math.floor(Math.random() * 500) + 10
    });
  }
  
  return products;
}

// ================================================================
// STYLES (CSS-in-JS for animations)
// ================================================================
const styles = `
  @keyframes spin { to { transform: rotate(360deg); } }
  .spinner { animation: spin 1s linear infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
  .pulse { animation: pulse 1.5s ease-in-out infinite; }
  @keyframes slideUp { from { transform: translateY(30px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  .slide-up { animation: slideUp 0.4s ease-out forwards; }
  @keyframes glow { 0%, 100% { box-shadow: 0 0 10px rgba(34, 197, 94, 0.5); } 50% { box-shadow: 0 0 30px rgba(34, 197, 94, 0.9); } }
  .glow { animation: glow 2s ease-in-out infinite; }
  @keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
  .marquee { animation: marquee 40s linear infinite; }
  @keyframes countUp { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  .count-up { animation: countUp 0.5s ease-out; }
  @keyframes hotBadge { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.1); } }
  .hot-badge { animation: hotBadge 1s ease infinite; }
  .card-hover:hover { transform: translateY(-8px) scale(1.02); box-shadow: 0 25px 50px rgba(0,0,0,0.25); }
  .card-hover { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
  .profit-badge { background: linear-gradient(135deg, #22c55e 0%, #15803d 100%); }
  .loss-badge { background: linear-gradient(135deg, #ef4444 0%, #b91c1c 100%); }
  .hot-badge-bg { background: linear-gradient(135deg, #f97316 0%, #c2410c 100%); }
  .new-badge { background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); }
  .glass { background: rgba(255,255,255,0.05); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.1); }
  .supplier-amazon { border-left: 4px solid #ff9900; }
  .supplier-walmart { border-left: 4px solid #0071ce; }
  .supplier-aliexpress { border-left: 4px solid #e62e04; }
  .supplier-costco { border-left: 4px solid #e31837; }
  .supplier-target { border-left: 4px solid #cc0000; }
  .supplier-ebay { border-left: 4px solid #86b817; }
  input[type="range"] { -webkit-appearance: none; background: #334155; border-radius: 10px; height: 8px; cursor: pointer; }
  input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 22px; height: 22px; background: linear-gradient(135deg, #22c55e, #16a34a); border-radius: 50%; cursor: pointer; box-shadow: 0 2px 8px rgba(34,197,94,0.5); }
  .line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
`;

// ================================================================
// MAIN COMPONENT
// ================================================================
export default function ProductSourcingPanel() {
  // State
  const [products, setProducts] = useState<Product[]>([]);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [importList, setImportList] = useState<Product[]>([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importDestination, setImportDestination] = useState('shopify');
  const [showFilters, setShowFilters] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [lastUpdate, setLastUpdate] = useState(Date.now());
  const [loading, setLoading] = useState(true);

  // Initialize products
  useEffect(() => {
    const initialProducts = generateProducts(500);
    setProducts(initialProducts);
    setLoading(false);
  }, []);

  // Live updates every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const newProducts = generateProducts(3);
      newProducts.forEach(p => {
        p.isNewArrival = true;
        p.addedAt = Date.now();
      });
      setProducts(prev => [...newProducts, ...prev].slice(0, 600));
      setLastUpdate(Date.now());
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);

  // Filter and sort products
  const filteredProducts = useMemo(() => {
    let filtered = [...products];
    const f = filters;
    
    // Search
    if (f.search.trim()) {
      const search = f.search.toLowerCase();
      filtered = filtered.filter(p => 
        p.title.toLowerCase().includes(search) ||
        p.category.name.toLowerCase().includes(search) ||
        p.supplier.name.toLowerCase().includes(search)
      );
    }
    
    // Category
    if (f.category !== 'all') {
      filtered = filtered.filter(p => p.category.id === f.category);
    }
    
    // Supplier
    if (f.supplier !== 'all') {
      filtered = filtered.filter(p => p.supplier.id === f.supplier);
    }
    
    // Profit filter
    filtered = filtered.filter(p => 
      p.profitPercent >= f.minProfit && 
      p.profitPercent <= f.maxProfit
    );
    
    // Weight filter
    filtered = filtered.filter(p => p.weight <= f.maxWeight);
    
    // Cost/Price filter
    filtered = filtered.filter(p => 
      p.costPrice >= f.minCost && 
      p.costPrice <= f.maxCost
    );
    
    // Rating filter
    filtered = filtered.filter(p => p.rating >= f.minRating);
    
    // Reviews filter
    filtered = filtered.filter(p => p.reviewCount >= f.minReviews);
    
    // Ships from filter
    if (f.shipsFrom !== 'all') {
      filtered = filtered.filter(p => p.shipsFrom.id === f.shipsFrom);
    }
    
    // Free shipping only
    if (f.freeShipOnly) {
      filtered = filtered.filter(p => p.freeShipping);
    }
    
    // In stock only
    if (f.inStockOnly) {
      filtered = filtered.filter(p => p.stock >= f.minStock);
    }
    
    // Special filters
    if (f.hotDealsOnly) {
      filtered = filtered.filter(p => p.isHotDeal);
    }
    if (f.newArrivalsOnly) {
      filtered = filtered.filter(p => p.isNewArrival);
    }
    if (f.bestSellersOnly) {
      filtered = filtered.filter(p => p.isBestSeller);
    }
    
    // Sorting
    filtered.sort((a, b) => {
      let aVal: number, bVal: number;
      switch (f.sortBy) {
        case 'profit': aVal = a.profitPercent; bVal = b.profitPercent; break;
        case 'price': aVal = a.costPrice; bVal = b.costPrice; break;
        case 'rating': aVal = a.rating; bVal = b.rating; break;
        case 'reviews': aVal = a.reviewCount; bVal = b.reviewCount; break;
        case 'newest': aVal = a.addedAt; bVal = b.addedAt; break;
        case 'bestseller': aVal = a.salesLast30Days; bVal = b.salesLast30Days; break;
        case 'weight': aVal = a.weight; bVal = b.weight; break;
        default: aVal = a.profitPercent; bVal = b.profitPercent;
      }
      return f.sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
    });
    
    return filtered;
  }, [products, filters]);

  // Stats
  const stats: Stats = useMemo(() => ({
    totalIndexed: 32847,
    matchingDeals: filteredProducts.length,
    avgProfit: filteredProducts.length > 0 
      ? filteredProducts.reduce((sum, p) => sum + p.profitPercent, 0) / filteredProducts.length 
      : 0,
    hotDeals: filteredProducts.filter(p => p.isHotDeal).length,
    newToday: filteredProducts.filter(p => p.isNewArrival).length,
    suppliers: 6
  }), [filteredProducts]);

  // Pagination
  const totalPages = Math.ceil(filteredProducts.length / pageSize);
  const paginatedProducts = filteredProducts.slice((page - 1) * pageSize, page * pageSize);

  // Actions
  const updateFilter = useCallback((key: keyof Filters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setPage(1);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  }, []);

  const addToImportList = useCallback((product: Product) => {
    if (!importList.find(p => p.id === product.id)) {
      setImportList(prev => [...prev, product]);
    }
  }, [importList]);

  const removeFromImportList = useCallback((productId: string) => {
    setImportList(prev => prev.filter(p => p.id !== productId));
  }, []);

  const clearImportList = useCallback(() => {
    setImportList([]);
  }, []);

  const isInImportList = useCallback((productId: string) => {
    return importList.some(p => p.id === productId);
  }, [importList]);

  // Import list totals
  const importTotals = useMemo(() => ({
    totalCost: importList.reduce((sum, p) => sum + p.costPrice, 0),
    totalProfit: importList.reduce((sum, p) => sum + p.profitAmount, 0),
    avgProfit: importList.length > 0 
      ? importList.reduce((sum, p) => sum + p.profitPercent, 0) / importList.length 
      : 0
  }), [importList]);

  // Loading state
  if (loading) {
    return (
      <div className="bg-slate-950 text-white min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-green-500/30 border-t-green-500 rounded-full mx-auto mb-4 animate-spin"></div>
          <p className="text-slate-400">Loading 32,000+ deals...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{styles}</style>
      <div className="bg-slate-950 text-white min-h-screen">
        {/* Header */}
        <header className="bg-slate-900/80 backdrop-blur-lg border-b border-slate-800 sticky top-0 z-50">
          <div className="max-w-[1800px] mx-auto px-4">
            <div className="flex items-center justify-between h-16">
              {/* Logo */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-xl">
                  🔥
                </div>
                <div>
                  <h1 className="font-bold text-lg">Product Sourcing Hub</h1>
                  <p className="text-xs text-slate-400">Wholesale Deal Finder</p>
                </div>
              </div>
              
              {/* Live indicator */}
              <div className="hidden md:flex items-center gap-6">
                <div className="flex items-center gap-2 text-sm">
                  <span className="w-2 h-2 bg-green-500 rounded-full pulse"></span>
                  <span className="text-slate-400">Live Sync</span>
                </div>
                <div className="text-sm text-slate-400">
                  Last updated: <span className="text-white">{timeAgo(lastUpdate)}</span>
                </div>
                <div className="text-sm">
                  <span className="text-slate-400">Sources:</span>
                  <span className="ml-2">{SUPPLIERS.map(s => s.logo).join(' ')}</span>
                </div>
              </div>
              
              {/* Import Button */}
              <button 
                onClick={() => setShowImportModal(true)}
                className="relative bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white px-5 py-2.5 rounded-xl font-semibold flex items-center gap-2 transition-all shadow-lg shadow-green-500/25"
              >
                <span>📥</span>
                <span>Import List</span>
                {importList.length > 0 && (
                  <span className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center animate-bounce">
                    {importList.length}
                  </span>
                )}
              </button>
            </div>
          </div>
        </header>

        {/* Hero Stats */}
        <div className="bg-gradient-to-b from-slate-900 to-slate-950 py-8 border-b border-slate-800">
          <div className="max-w-[1800px] mx-auto px-4">
            {/* Main Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
              <div className="glass rounded-2xl p-5 text-center">
                <p className="text-slate-400 text-sm mb-1">Products Indexed</p>
                <p className="text-3xl font-bold count-up">{stats.totalIndexed.toLocaleString()}</p>
                <p className="text-xs text-slate-500 mt-1">from {stats.suppliers} suppliers</p>
              </div>
              <div className="glass rounded-2xl p-5 text-center glow">
                <p className="text-slate-400 text-sm mb-1">Matching Filters</p>
                <p className="text-3xl font-bold text-green-400 count-up">{stats.matchingDeals.toLocaleString()}</p>
                <p className="text-xs text-green-400/70 mt-1">profitable deals</p>
              </div>
              <div className="glass rounded-2xl p-5 text-center">
                <p className="text-slate-400 text-sm mb-1">Avg Profit Margin</p>
                <p className="text-3xl font-bold text-green-400 count-up">{pct(stats.avgProfit)}</p>
                <p className="text-xs text-slate-500 mt-1">on filtered items</p>
              </div>
              <div className="glass rounded-2xl p-5 text-center">
                <p className="text-slate-400 text-sm mb-1">🔥 Hot Deals</p>
                <p className="text-3xl font-bold text-orange-400 count-up">{stats.hotDeals.toLocaleString()}</p>
                <p className="text-xs text-orange-400/70 mt-1">selling fast</p>
              </div>
              <div className="glass rounded-2xl p-5 text-center">
                <p className="text-slate-400 text-sm mb-1">✨ New Today</p>
                <p className="text-3xl font-bold text-blue-400 count-up">{stats.newToday.toLocaleString()}</p>
                <p className="text-xs text-blue-400/70 mt-1">just added</p>
              </div>
            </div>
            
            {/* Live Ticker */}
            <div className="glass rounded-xl p-3 overflow-hidden">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 shrink-0">
                  <span className="w-2 h-2 bg-red-500 rounded-full pulse"></span>
                  <span className="text-xs font-semibold text-red-400 uppercase">Live Deals</span>
                </div>
                <div className="flex-1 overflow-hidden">
                  <div className="flex gap-8 marquee whitespace-nowrap">
                    {filteredProducts.slice(0, 15).map(p => (
                      <span key={p.id} className="inline-flex items-center gap-2 text-sm">
                        <span className="profit-badge text-white text-xs font-bold px-2 py-0.5 rounded">+{pct(p.profitPercent)}</span>
                        <span className="text-slate-300">{p.title.substring(0, 35)}{p.title.length > 35 ? '...' : ''}</span>
                        <span className="text-slate-500">{p.supplier.logo}</span>
                        <span className="text-green-400 font-medium">{fmt(p.costPrice)}</span>
                      </span>
                    ))}
                    {filteredProducts.slice(0, 15).map(p => (
                      <span key={`dup-${p.id}`} className="inline-flex items-center gap-2 text-sm">
                        <span className="profit-badge text-white text-xs font-bold px-2 py-0.5 rounded">+{pct(p.profitPercent)}</span>
                        <span className="text-slate-300">{p.title.substring(0, 35)}{p.title.length > 35 ? '...' : ''}</span>
                        <span className="text-slate-500">{p.supplier.logo}</span>
                        <span className="text-green-400 font-medium">{fmt(p.costPrice)}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-[1800px] mx-auto px-4 pb-12">
          <div className="flex gap-6 pt-6">
            {/* Filters Panel */}
            <div className={`w-80 shrink-0 ${showFilters ? '' : 'hidden lg:block'}`}>
              <div className="bg-slate-900 rounded-2xl border border-slate-800 sticky top-24 overflow-hidden">
                {/* Header */}
                <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                  <h2 className="font-bold text-lg flex items-center gap-2">
                    <span>🎯</span> Filters
                  </h2>
                  <button onClick={resetFilters} className="text-sm text-slate-400 hover:text-white">Reset All</button>
                </div>
                
                <div className="p-4 space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto">
                  
                  {/* Search */}
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">🔍 Search Products</label>
                    <input 
                      type="text" 
                      placeholder="Search 32,000+ products..."
                      value={filters.search}
                      onChange={(e) => updateFilter('search', e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                  
                  {/* Profit Margin */}
                  <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
                    <label className="block text-sm font-bold text-green-400 mb-3">💰 PROFIT MARGIN</label>
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-slate-400">Minimum</span>
                          <span className="text-green-400 font-bold">{filters.minProfit}%</span>
                        </div>
                        <input 
                          type="range" 
                          min="0" 
                          max="300" 
                          step="5" 
                          value={filters.minProfit}
                          onChange={(e) => updateFilter('minProfit', parseInt(e.target.value))}
                          className="w-full"
                        />
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-slate-400">Maximum</span>
                          <span className="text-green-400 font-bold">{filters.maxProfit}%</span>
                        </div>
                        <input 
                          type="range" 
                          min="50" 
                          max="500" 
                          step="10" 
                          value={filters.maxProfit}
                          onChange={(e) => updateFilter('maxProfit', parseInt(e.target.value))}
                          className="w-full"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-2">Only showing products with {filters.minProfit}% - {filters.maxProfit}% profit</p>
                  </div>
                  
                  {/* Weight */}
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">⚖️ Max Weight</label>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-400">Up to</span>
                      <span className="text-white font-bold">{filters.maxWeight} lbs</span>
                    </div>
                    <input 
                      type="range" 
                      min="0.5" 
                      max="50" 
                      step="0.5" 
                      value={filters.maxWeight}
                      onChange={(e) => updateFilter('maxWeight', parseFloat(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  
                  {/* Purchase Price */}
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">💵 Purchase Price Range</label>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-slate-500">Min</label>
                        <input 
                          type="number" 
                          min="0" 
                          max="1000" 
                          step="1" 
                          value={filters.minCost}
                          onChange={(e) => updateFilter('minCost', parseFloat(e.target.value) || 0)}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500">Max</label>
                        <input 
                          type="number" 
                          min="0" 
                          max="1000" 
                          step="1" 
                          value={filters.maxCost}
                          onChange={(e) => updateFilter('maxCost', parseFloat(e.target.value) || 1000)}
                          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                        />
                      </div>
                    </div>
                  </div>
                  
                  {/* Supplier */}
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">📦 Supplier Source</label>
                    <select 
                      value={filters.supplier}
                      onChange={(e) => updateFilter('supplier', e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white"
                    >
                      <option value="all">All Suppliers</option>
                      {SUPPLIERS.map(s => (
                        <option key={s.id} value={s.id}>{s.logo} {s.name}</option>
                      ))}
                    </select>
                  </div>
                  
                  {/* Category */}
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">📂 Category</label>
                    <select 
                      value={filters.category}
                      onChange={(e) => updateFilter('category', e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white"
                    >
                      <option value="all">All Categories</option>
                      {CATEGORIES.map(c => (
                        <option key={c.id} value={c.id}>{c.icon} {c.name} ({fmtK(c.count)})</option>
                      ))}
                    </select>
                  </div>
                  
                  {/* Ships From */}
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">🚚 Ships From</label>
                    <select 
                      value={filters.shipsFrom}
                      onChange={(e) => updateFilter('shipsFrom', e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white"
                    >
                      <option value="all">Anywhere</option>
                      {SHIPS_FROM.map(s => (
                        <option key={s.id} value={s.id}>{s.flag} {s.name} ({s.days} days)</option>
                      ))}
                    </select>
                  </div>
                  
                  {/* Minimum Rating */}
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">⭐ Minimum Rating</label>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-400">At least</span>
                      <span className="text-yellow-400 font-bold">{filters.minRating}+ stars</span>
                    </div>
                    <input 
                      type="range" 
                      min="1" 
                      max="5" 
                      step="0.5" 
                      value={filters.minRating}
                      onChange={(e) => updateFilter('minRating', parseFloat(e.target.value))}
                      className="w-full"
                    />
                  </div>
                  
                  {/* Toggles */}
                  <div className="space-y-3">
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <input 
                        type="checkbox" 
                        checked={filters.inStockOnly}
                        onChange={(e) => updateFilter('inStockOnly', e.target.checked)}
                        className="w-5 h-5 rounded bg-slate-700 border-slate-600 text-green-500 focus:ring-green-500"
                      />
                      <span className="text-slate-300 group-hover:text-white">📦 In Stock Only</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <input 
                        type="checkbox" 
                        checked={filters.freeShipOnly}
                        onChange={(e) => updateFilter('freeShipOnly', e.target.checked)}
                        className="w-5 h-5 rounded bg-slate-700 border-slate-600 text-green-500 focus:ring-green-500"
                      />
                      <span className="text-slate-300 group-hover:text-white">🚚 Free Shipping Only</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <input 
                        type="checkbox" 
                        checked={filters.hotDealsOnly}
                        onChange={(e) => updateFilter('hotDealsOnly', e.target.checked)}
                        className="w-5 h-5 rounded bg-slate-700 border-slate-600 text-orange-500 focus:ring-orange-500"
                      />
                      <span className="text-slate-300 group-hover:text-white">🔥 Hot Deals Only</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <input 
                        type="checkbox" 
                        checked={filters.newArrivalsOnly}
                        onChange={(e) => updateFilter('newArrivalsOnly', e.target.checked)}
                        className="w-5 h-5 rounded bg-slate-700 border-slate-600 text-blue-500 focus:ring-blue-500"
                      />
                      <span className="text-slate-300 group-hover:text-white">✨ New Arrivals Only</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <input 
                        type="checkbox" 
                        checked={filters.bestSellersOnly}
                        onChange={(e) => updateFilter('bestSellersOnly', e.target.checked)}
                        className="w-5 h-5 rounded bg-slate-700 border-slate-600 text-purple-500 focus:ring-purple-500"
                      />
                      <span className="text-slate-300 group-hover:text-white">👑 Best Sellers Only</span>
                    </label>
                  </div>
                  
                </div>
              </div>
            </div>

            {/* Products Grid */}
            <div className="flex-1 min-w-0">
              {/* Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setShowFilters(!showFilters)}
                    className="lg:hidden bg-slate-800 px-4 py-2 rounded-lg flex items-center gap-2"
                  >
                    <span>🎯</span> Filters
                  </button>
                  <p className="text-slate-400">
                    Showing <span className="text-white font-semibold">{filteredProducts.length.toLocaleString()}</span> products
                  </p>
                </div>
                
                <div className="flex items-center gap-3">
                  {/* Sort */}
                  <select 
                    value={filters.sortBy}
                    onChange={(e) => updateFilter('sortBy', e.target.value)}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white text-sm"
                  >
                    <option value="profit">Highest Profit</option>
                    <option value="price">Lowest Price</option>
                    <option value="rating">Best Rated</option>
                    <option value="reviews">Most Reviews</option>
                    <option value="newest">Newest First</option>
                    <option value="bestseller">Best Sellers</option>
                  </select>
                  
                  {/* View Toggle */}
                  <div className="flex bg-slate-800 rounded-lg p-1">
                    <button 
                      onClick={() => setViewMode('grid')}
                      className={`px-3 py-1.5 rounded ${viewMode === 'grid' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg>
                    </button>
                    <button 
                      onClick={() => setViewMode('list')}
                      className={`px-3 py-1.5 rounded ${viewMode === 'list' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd"></path></svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* Product Grid/List */}
              {paginatedProducts.length === 0 ? (
                <div className="text-center py-20">
                  <div className="text-6xl mb-4">🔍</div>
                  <h3 className="text-xl font-semibold mb-2">No products match your filters</h3>
                  <p className="text-slate-400 mb-6">Try adjusting your criteria to see more results</p>
                  <button onClick={resetFilters} className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-lg font-medium">
                    Reset Filters
                  </button>
                </div>
              ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  {paginatedProducts.map((p, i) => (
                    <ProductCard 
                      key={p.id} 
                      product={p} 
                      index={i}
                      inList={isInImportList(p.id)}
                      onAddToList={() => addToImportList(p)}
                      onRemoveFromList={() => removeFromImportList(p.id)}
                      onViewDetails={() => setSelectedProduct(p)}
                    />
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {paginatedProducts.map(p => (
                    <ProductListItem 
                      key={p.id} 
                      product={p}
                      inList={isInImportList(p.id)}
                      onAddToList={() => addToImportList(p)}
                      onRemoveFromList={() => removeFromImportList(p.id)}
                      onViewDetails={() => setSelectedProduct(p)}
                    />
                  ))}
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-8">
                  <button 
                    onClick={() => { if (page > 1) { setPage(page - 1); window.scrollTo(0, 400); } }}
                    className={`px-4 py-2 bg-slate-800 rounded-lg text-white ${page === 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-700'}`}
                    disabled={page === 1}
                  >
                    ← Prev
                  </button>
                  
                  {Array.from({ length: Math.min(totalPages, 10) }, (_, i) => i + 1).map(p => (
                    <button 
                      key={p}
                      onClick={() => { setPage(p); window.scrollTo(0, 400); }}
                      className={`w-10 h-10 rounded-lg font-medium ${page === p ? 'bg-green-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
                    >
                      {p}
                    </button>
                  ))}
                  
                  {totalPages > 10 && (
                    <>
                      <span className="text-slate-500">...</span>
                      <span className="text-slate-400">{totalPages}</span>
                    </>
                  )}
                  
                  <button 
                    onClick={() => { if (page < totalPages) { setPage(page + 1); window.scrollTo(0, 400); } }}
                    className={`px-4 py-2 bg-slate-800 rounded-lg text-white ${page === totalPages ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-700'}`}
                    disabled={page === totalPages}
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Product Modal */}
        {selectedProduct && (
          <ProductModal 
            product={selectedProduct}
            inList={isInImportList(selectedProduct.id)}
            onClose={() => setSelectedProduct(null)}
            onAddToList={() => addToImportList(selectedProduct)}
            onRemoveFromList={() => removeFromImportList(selectedProduct.id)}
          />
        )}

        {/* Import Modal */}
        {showImportModal && (
          <ImportModal 
            importList={importList}
            totals={importTotals}
            destination={importDestination}
            destinations={IMPORT_DESTINATIONS}
            onClose={() => setShowImportModal(false)}
            onChangeDestination={setImportDestination}
            onRemoveItem={removeFromImportList}
            onClear={clearImportList}
          />
        )}
      </div>
    </>
  );
}

// ================================================================
// SUB-COMPONENTS
// ================================================================

interface ProductCardProps {
  product: Product;
  index: number;
  inList: boolean;
  onAddToList: () => void;
  onRemoveFromList: () => void;
  onViewDetails: () => void;
}

function ProductCard({ product: p, index, inList, onAddToList, onRemoveFromList, onViewDetails }: ProductCardProps) {
  return (
    <div 
      className={`bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden card-hover slide-up supplier-${p.supplier.id}`}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Image */}
      <div className="relative aspect-square bg-slate-800 overflow-hidden">
        <img src={p.image} alt={p.title} className="w-full h-full object-cover" loading="lazy" />
        
        {/* Badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-2">
          {p.isHotDeal && <span className="hot-badge-bg text-white text-xs font-bold px-2 py-1 rounded-lg hot-badge">🔥 HOT</span>}
          {p.isNewArrival && <span className="new-badge text-white text-xs font-bold px-2 py-1 rounded-lg">✨ NEW</span>}
          {p.isBestSeller && <span className="bg-purple-600 text-white text-xs font-bold px-2 py-1 rounded-lg">👑 BEST</span>}
        </div>
        
        {/* Profit Badge */}
        <div className="absolute top-3 right-3">
          <div className="profit-badge text-white font-bold px-3 py-1.5 rounded-xl text-lg shadow-lg">
            +{pct(p.profitPercent)}
          </div>
        </div>
        
        {/* Quick Add */}
        <div className="absolute bottom-3 right-3">
          <button 
            onClick={(e) => { e.stopPropagation(); inList ? onRemoveFromList() : onAddToList(); }}
            className={`${inList ? 'bg-green-600' : 'bg-slate-800/90 hover:bg-green-600'} text-white w-10 h-10 rounded-full flex items-center justify-center transition-colors shadow-lg`}
          >
            {inList ? '✓' : '+'}
          </button>
        </div>
        
        {/* Supplier */}
        <div className="absolute bottom-3 left-3 bg-slate-900/90 backdrop-blur px-2 py-1 rounded-lg flex items-center gap-1.5">
          <span>{p.supplier.logo}</span>
          <span className="text-xs text-slate-300">{p.supplier.name}</span>
        </div>
      </div>
      
      {/* Content */}
      <div className="p-4">
        <h3 
          className="font-semibold text-sm text-white mb-2 line-clamp-2 min-h-[40px] cursor-pointer hover:text-green-400"
          onClick={onViewDetails}
        >
          {p.title}
        </h3>
        
        {/* Category & Rating */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-slate-500">{p.category.icon} {p.category.name}</span>
          <span className="text-xs text-yellow-400">⭐ {p.rating} ({fmtK(p.reviewCount)})</span>
        </div>
        
        {/* Pricing */}
        <div className="bg-slate-800/50 rounded-xl p-3 mb-3">
          <div className="grid grid-cols-2 gap-2 text-center">
            <div>
              <p className="text-xs text-slate-500 mb-1">Your Cost</p>
              <p className="text-lg font-bold text-white">{fmt(p.costPrice)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Sell For</p>
              <p className="text-lg font-bold text-green-400">{fmt(p.retailPrice)}</p>
            </div>
          </div>
          <div className="border-t border-slate-700 mt-2 pt-2 text-center">
            <p className="text-xs text-slate-400">Profit per sale</p>
            <p className="text-xl font-bold text-green-400">+{fmt(p.profitAmount)}</p>
          </div>
        </div>
        
        {/* Specs */}
        <div className="flex items-center justify-between text-xs text-slate-400 mb-3">
          <span>⚖️ {p.weight.toFixed(1)} lbs</span>
          <span>{p.shipsFrom.flag} {p.shipsFrom.name}</span>
          <span>📦 {fmtK(p.stock)} in stock</span>
        </div>
        
        {/* Actions */}
        <div className="flex gap-2">
          <button 
            onClick={onViewDetails}
            className="flex-1 bg-slate-800 hover:bg-slate-700 text-white py-2 rounded-lg text-sm font-medium transition-colors"
          >
            View Details
          </button>
          <button 
            onClick={inList ? onRemoveFromList : onAddToList}
            className={`flex-1 ${inList ? 'bg-green-600 hover:bg-green-500' : 'bg-green-600 hover:bg-green-500'} text-white py-2 rounded-lg text-sm font-medium transition-colors`}
          >
            {inList ? '✓ Added' : '+ Add to List'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ProductListItemProps {
  product: Product;
  inList: boolean;
  onAddToList: () => void;
  onRemoveFromList: () => void;
  onViewDetails: () => void;
}

function ProductListItem({ product: p, inList, onAddToList, onRemoveFromList, onViewDetails }: ProductListItemProps) {
  return (
    <div className={`bg-slate-900 rounded-xl border border-slate-800 p-4 flex gap-4 card-hover supplier-${p.supplier.id}`}>
      <img src={p.image} alt={p.title} className="w-32 h-32 object-cover rounded-lg shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 
              className="font-semibold text-white mb-1 cursor-pointer hover:text-green-400"
              onClick={onViewDetails}
            >
              {p.title}
            </h3>
            <div className="flex items-center gap-3 text-sm text-slate-400">
              <span>{p.supplier.logo} {p.supplier.name}</span>
              <span>{p.category.icon} {p.category.name}</span>
              <span className="text-yellow-400">⭐ {p.rating}</span>
            </div>
          </div>
          <div className="profit-badge text-white font-bold px-3 py-1 rounded-lg">+{pct(p.profitPercent)}</div>
        </div>
        <div className="flex items-center gap-6 mt-3">
          <div>
            <span className="text-xs text-slate-500">Cost:</span>
            <span className="text-white font-semibold ml-1">{fmt(p.costPrice)}</span>
          </div>
          <div>
            <span className="text-xs text-slate-500">Sell:</span>
            <span className="text-green-400 font-semibold ml-1">{fmt(p.retailPrice)}</span>
          </div>
          <div>
            <span className="text-xs text-slate-500">Profit:</span>
            <span className="text-green-400 font-bold ml-1">+{fmt(p.profitAmount)}</span>
          </div>
          <div>
            <span className="text-xs text-slate-500">Weight:</span>
            <span className="text-white ml-1">{p.weight.toFixed(1)} lbs</span>
          </div>
          <div>
            <span className="text-xs text-slate-500">Ships:</span>
            <span className="text-white ml-1">{p.shipsFrom.flag} {p.shipsFrom.name}</span>
          </div>
        </div>
      </div>
      <button 
        onClick={inList ? onRemoveFromList : onAddToList}
        className={`${inList ? 'bg-green-600' : 'bg-slate-800 hover:bg-green-600'} text-white px-6 py-2 rounded-lg font-medium transition-colors shrink-0 self-center`}
      >
        {inList ? '✓ Added' : '+ Add'}
      </button>
    </div>
  );
}

interface ProductModalProps {
  product: Product;
  inList: boolean;
  onClose: () => void;
  onAddToList: () => void;
  onRemoveFromList: () => void;
}

function ProductModal({ product: p, inList, onClose, onAddToList, onRemoveFromList }: ProductModalProps) {
  return (
    <div 
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-slate-900 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto slide-up border border-slate-700">
        <div className="flex flex-col md:flex-row">
          {/* Image */}
          <div className="md:w-1/2 p-6">
            <img src={p.image} alt={p.title} className="w-full rounded-xl" />
            <div className="flex gap-2 mt-4">
              {p.isHotDeal && <span className="hot-badge-bg text-white text-sm font-bold px-3 py-1 rounded-lg">🔥 Hot Deal</span>}
              {p.isNewArrival && <span className="new-badge text-white text-sm font-bold px-3 py-1 rounded-lg">✨ New</span>}
              {p.isBestSeller && <span className="bg-purple-600 text-white text-sm font-bold px-3 py-1 rounded-lg">👑 Best Seller</span>}
            </div>
          </div>
          
          {/* Details */}
          <div className="md:w-1/2 p-6 border-l border-slate-800">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">{p.supplier.logo}</span>
                  <span className="text-slate-400">{p.supplier.name}</span>
                </div>
                <h2 className="text-2xl font-bold text-white">{p.title}</h2>
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl">×</button>
            </div>
            
            {/* Category & Rating */}
            <div className="flex items-center gap-4 mb-6 text-sm">
              <span className="text-slate-400">{p.category.icon} {p.category.name}</span>
              <span className="text-yellow-400">⭐ {p.rating} ({p.reviewCount.toLocaleString()} reviews)</span>
            </div>
            
            {/* Profit Box */}
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 mb-6">
              <div className="text-center mb-4">
                <p className="text-green-400 text-sm mb-1">PROFIT MARGIN</p>
                <p className="text-5xl font-bold text-green-400">+{pct(p.profitPercent)}</p>
              </div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-slate-400 text-xs mb-1">Your Cost</p>
                  <p className="text-xl font-bold text-white">{fmt(p.costPrice)}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs mb-1">Sell For</p>
                  <p className="text-xl font-bold text-green-400">{fmt(p.retailPrice)}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs mb-1">Profit/Unit</p>
                  <p className="text-xl font-bold text-green-400">+{fmt(p.profitAmount)}</p>
                </div>
              </div>
            </div>
            
            {/* Specs */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-slate-800 rounded-lg p-3">
                <p className="text-slate-400 text-xs mb-1">⚖️ Weight</p>
                <p className="text-white font-semibold">{p.weight.toFixed(2)} lbs</p>
              </div>
              <div className="bg-slate-800 rounded-lg p-3">
                <p className="text-slate-400 text-xs mb-1">📐 Dimensions</p>
                <p className="text-white font-semibold">{p.dimensions}</p>
              </div>
              <div className="bg-slate-800 rounded-lg p-3">
                <p className="text-slate-400 text-xs mb-1">📦 Stock</p>
                <p className="text-white font-semibold">{p.stock.toLocaleString()} units</p>
              </div>
              <div className="bg-slate-800 rounded-lg p-3">
                <p className="text-slate-400 text-xs mb-1">📋 Min Order</p>
                <p className="text-white font-semibold">{p.minOrderQty} units</p>
              </div>
              <div className="bg-slate-800 rounded-lg p-3">
                <p className="text-slate-400 text-xs mb-1">🚚 Ships From</p>
                <p className="text-white font-semibold">{p.shipsFrom.flag} {p.shipsFrom.name}</p>
              </div>
              <div className="bg-slate-800 rounded-lg p-3">
                <p className="text-slate-400 text-xs mb-1">⏱️ Delivery</p>
                <p className="text-white font-semibold">{p.deliveryDays} days{p.freeShipping ? ' (FREE)' : ''}</p>
              </div>
            </div>
            
            {/* SKU & Source */}
            <div className="bg-slate-800 rounded-lg p-3 mb-6">
              <p className="text-slate-400 text-xs mb-1">Supplier SKU</p>
              <p className="text-white font-mono text-sm">{p.supplierSku}</p>
            </div>
            
            {/* Actions */}
            <div className="flex gap-3">
              <button 
                onClick={inList ? onRemoveFromList : onAddToList}
                className={`flex-1 ${inList ? 'bg-green-600' : 'bg-green-600 hover:bg-green-500'} text-white py-3 rounded-xl font-semibold transition-colors`}
              >
                {inList ? '✓ Added to Import List' : '+ Add to Import List'}
              </button>
              <a 
                href={p.sourceUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-3 rounded-xl font-semibold transition-colors flex items-center gap-2"
              >
                View Source ↗
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ImportModalProps {
  importList: Product[];
  totals: { totalCost: number; totalProfit: number; avgProfit: number };
  destination: string;
  destinations: ImportDestination[];
  onClose: () => void;
  onChangeDestination: (dest: string) => void;
  onRemoveItem: (id: string) => void;
  onClear: () => void;
}

function ImportModal({ importList, totals, destination, destinations, onClose, onChangeDestination, onRemoveItem, onClear }: ImportModalProps) {
  return (
    <div 
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-slate-900 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden slide-up border border-slate-700">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">📥 Import List</h2>
            <p className="text-slate-400">{importList.length} products selected</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-3xl">×</button>
        </div>
        
        {importList.length > 0 ? (
          <>
            {/* Summary Stats */}
            <div className="p-6 bg-slate-800/50 grid grid-cols-3 gap-4 border-b border-slate-800">
              <div className="text-center">
                <p className="text-slate-400 text-sm">Total Cost</p>
                <p className="text-2xl font-bold text-white">{fmt(totals.totalCost)}</p>
              </div>
              <div className="text-center">
                <p className="text-slate-400 text-sm">Total Profit</p>
                <p className="text-2xl font-bold text-green-400">+{fmt(totals.totalProfit)}</p>
              </div>
              <div className="text-center">
                <p className="text-slate-400 text-sm">Avg Margin</p>
                <p className="text-2xl font-bold text-green-400">{pct(totals.avgProfit)}</p>
              </div>
            </div>
            
            {/* Product List */}
            <div className="max-h-[300px] overflow-y-auto p-4">
              {importList.map(p => (
                <div key={p.id} className="flex items-center gap-4 p-3 bg-slate-800 rounded-lg mb-2">
                  <img src={p.image} className="w-12 h-12 rounded object-cover" alt={p.title} />
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate">{p.title}</p>
                    <p className="text-sm text-slate-400">{p.supplier.logo} {p.supplier.name} • {fmt(p.costPrice)}</p>
                  </div>
                  <span className="profit-badge text-white text-sm font-bold px-2 py-1 rounded">+{pct(p.profitPercent)}</span>
                  <button onClick={() => onRemoveItem(p.id)} className="text-red-400 hover:text-red-300 text-xl">×</button>
                </div>
              ))}
            </div>
            
            {/* Destination */}
            <div className="p-6 border-t border-slate-800">
              <label className="block text-sm font-medium text-slate-300 mb-3">Import Destination</label>
              <div className="grid grid-cols-3 gap-3 mb-6">
                {destinations.map(d => (
                  <button 
                    key={d.id}
                    onClick={() => onChangeDestination(d.id)}
                    className={`p-3 rounded-xl border ${destination === d.id ? 'border-green-500 bg-green-500/10' : 'border-slate-700 hover:border-slate-600'} text-center transition-colors`}
                  >
                    <span className="text-2xl">{d.icon}</span>
                    <p className={`text-sm mt-1 ${destination === d.id ? 'text-green-400' : 'text-slate-300'}`}>{d.name}</p>
                  </button>
                ))}
              </div>
              
              {/* Actions */}
              <div className="flex gap-3">
                <button onClick={onClear} className="px-6 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl text-white font-medium transition-colors">
                  Clear All
                </button>
                <button 
                  onClick={() => alert(`Importing ${importList.length} products to ${destination}...\n\nIn production, this would sync to your store!`)}
                  className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white py-3 rounded-xl font-bold transition-all"
                >
                  🚀 Import {importList.length} Products to {destinations.find(d => d.id === destination)?.name}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="p-12 text-center">
            <div className="text-6xl mb-4">📭</div>
            <h3 className="text-xl font-semibold mb-2">Your import list is empty</h3>
            <p className="text-slate-400 mb-6">Add products from the sourcing feed to import them to your store</p>
            <button onClick={onClose} className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-lg font-medium">
              Browse Products
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
