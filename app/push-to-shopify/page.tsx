'use client';

// app/push-to-shopify/page.tsx
// ============================================================================
// STANDALONE Push-to-Shopify page — no dependencies on components/
// Loads products from /api/shopify-push, pushes in batches of 10
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';

interface Product {
  id: string;
  title: string;
  asin?: string;
  main_image?: string;
  image_url?: string;
  cost_price?: number;
  amazon_price?: number;
  current_price?: number;
  retail_price?: number;
  status?: string;
  shopify_product_id?: string;
}

interface PushResult {
  id: string;
  title: string;
  success: boolean;
  shopifyId?: string;
  error?: string;
}

interface StockStatus {
  inStock: boolean | null;
  price: number | null;
  source: string;
  seller?: string;
  error?: string;
}

const BATCH_SIZE = 10;
const STOCK_BATCH_SIZE = 5;

export default function PushToShopifyPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shopifyConfigured, setShopifyConfigured] = useState(false);
  const [shopifyStore, setShopifyStore] = useState<string | null>(null);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Push state
  const [pushing, setPushing] = useState(false);
  const [pushResults, setPushResults] = useState<PushResult[]>([]);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);
  const [pushLog, setPushLog] = useState<string[]>([]);
  const abortRef = useRef(false);
  const logRef = useRef<HTMLDivElement>(null);

  // Stock check state
  const [stockMap, setStockMap] = useState<Record<string, StockStatus>>({});
  const [checkingStock, setCheckingStock] = useState(false);
  const [stockProgress, setStockProgress] = useState(0);

  // Filter
  const [filter, setFilter] = useState<'all' | 'not_pushed' | 'pushed'>('all');
  const [forceCreate, setForceCreate] = useState(true); // Default ON since old IDs are stale

  // Load products
  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const res = await fetch('/api/shopify-push');
        const json = await res.json();
        if (!json.success) throw new Error(json.error);
        setProducts(json.products);
        setShopifyConfigured(json.shopifyConfigured);
        setShopifyStore(json.shopifyStore);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [pushLog]);

  // Filtered products
  const filtered = products.filter(p => {
    if (filter === 'not_pushed') return !p.shopify_product_id;
    if (filter === 'pushed') return !!p.shopify_product_id;
    return true;
  });

  const notPushedCount = products.filter(p => !p.shopify_product_id).length;
  const pushedCount = products.filter(p => !!p.shopify_product_id).length;

  // Selection helpers
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    const ids = new Set(filtered.map(p => p.id));
    setSelectedIds(ids);
  };

  const selectAllNotPushed = () => {
    const ids = new Set(products.filter(p => !p.shopify_product_id).map(p => p.id));
    setSelectedIds(ids);
  };

  const deselectAll = () => setSelectedIds(new Set());

  // PUSH to Shopify in batches
  const pushToShopify = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    setPushing(true);
    setPushResults([]);
    setPushLog([]);
    abortRef.current = false;

    const batches = [];
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      batches.push(ids.slice(i, i + BATCH_SIZE));
    }
    setTotalBatches(batches.length);

    const allResults: PushResult[] = [];

    for (let i = 0; i < batches.length; i++) {
      if (abortRef.current) {
        setPushLog(prev => [...prev, '⛔ Aborted by user']);
        break;
      }

      setCurrentBatch(i + 1);
      const batch = batches[i];
      setPushLog(prev => [...prev, `📦 Batch ${i + 1}/${batches.length} — pushing ${batch.length} products...`]);

      try {
        const res = await fetch('/api/shopify-push', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productIds: batch, forceCreate }),
        });

        const json = await res.json();

        if (json.success && json.data?.results) {
          for (const r of json.data.results) {
            allResults.push(r);
            if (r.success) {
              setPushLog(prev => [...prev, `✅ ${r.title} → Shopify #${r.shopifyId}`]);
              // Update local state
              setProducts(prev => prev.map(p =>
                p.id === r.id ? { ...p, shopify_product_id: r.shopifyId } : p
              ));
            } else {
              setPushLog(prev => [...prev, `❌ ${r.title}: ${r.error}`]);
            }
          }
        } else {
          const errMsg = json.error || 'Unknown error';
          setPushLog(prev => [...prev, `❌ Batch ${i + 1} failed: ${errMsg}`]);
          batch.forEach(id => {
            const prod = products.find(p => p.id === id);
            allResults.push({ id, title: prod?.title || id, success: false, error: errMsg });
          });
        }
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        setPushLog(prev => [...prev, `❌ Batch ${i + 1} network error: ${errMsg}`]);
        batch.forEach(id => {
          const prod = products.find(p => p.id === id);
          allResults.push({ id, title: prod?.title || id, success: false, error: errMsg });
        });
      }

      setPushResults([...allResults]);

      // Small delay between batches
      if (i < batches.length - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    const ok = allResults.filter(r => r.success).length;
    setPushLog(prev => [...prev, ``, `🏁 Done! ${ok}/${allResults.length} products pushed successfully.`]);
    setPushing(false);
  }, [selectedIds, products]);

  const abort = () => { abortRef.current = true; };

  // CHECK STOCK via Rainforest/Keepa
  const checkStock = useCallback(async () => {
    const ids = Array.from(selectedIds);
    const itemsToCheck = products
      .filter(p => ids.includes(p.id) && p.asin)
      .map(p => ({ asin: p.asin!, productId: p.id }));

    if (itemsToCheck.length === 0) {
      setPushLog(prev => [...prev, '⚠️ No products with ASINs selected to check']);
      return;
    }

    setCheckingStock(true);
    setStockProgress(0);
    setPushLog(prev => [...prev, `🔍 Checking stock for ${itemsToCheck.length} products...`]);

    const batches = [];
    for (let i = 0; i < itemsToCheck.length; i += STOCK_BATCH_SIZE) {
      batches.push(itemsToCheck.slice(i, i + STOCK_BATCH_SIZE));
    }

    const newStockMap: Record<string, StockStatus> = { ...stockMap };

    for (let i = 0; i < batches.length; i++) {
      if (abortRef.current) { setPushLog(prev => [...prev, '⛔ Stock check aborted']); break; }

      setStockProgress(Math.round(((i + 1) / batches.length) * 100));

      try {
        const res = await fetch('/api/stock-check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: batches[i] }),
        });
        const json = await res.json();

        if (json.success && json.data?.results) {
          for (const r of json.data.results) {
            newStockMap[r.productId] = {
              inStock: r.inStock,
              price: r.price,
              source: r.source,
              seller: r.seller,
              error: r.error,
            };
            const prod = products.find(p => p.id === r.productId);
            const name = prod?.title?.substring(0, 50) || r.asin;
            if (r.inStock === true) {
              setPushLog(prev => [...prev, `✅ ${name} — In Stock ${r.price ? `$${r.price}` : ''} (${r.source})`]);
            } else if (r.inStock === false) {
              setPushLog(prev => [...prev, `❌ ${name} — OUT OF STOCK (${r.source})`]);
            } else {
              setPushLog(prev => [...prev, `⚠️ ${name} — Unknown: ${r.error || 'no data'}`]);
            }
          }
          setStockMap({ ...newStockMap });
        }
      } catch (e) {
        setPushLog(prev => [...prev, `❌ Batch ${i + 1} stock check failed: ${e}`]);
      }
    }

    const inStock = Object.values(newStockMap).filter(s => s.inStock === true).length;
    const outOfStock = Object.values(newStockMap).filter(s => s.inStock === false).length;
    setPushLog(prev => [...prev, ``, `🏁 Stock check done: ${inStock} in stock, ${outOfStock} out of stock`]);
    setCheckingStock(false);
  }, [selectedIds, products, stockMap]);

  // Stats
  const successCount = pushResults.filter(r => r.success).length;
  const failCount = pushResults.filter(r => !r.success).length;

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#fff', background: '#0f172a', minHeight: '100vh' }}>
        <h1 style={{ fontSize: 24, marginBottom: 16 }}>Loading products...</h1>
        <div style={{ fontSize: 48 }}>⏳</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 40, color: '#fff', background: '#0f172a', minHeight: '100vh' }}>
        <h1 style={{ fontSize: 24, color: '#ef4444', marginBottom: 16 }}>Error Loading Products</h1>
        <pre style={{ background: '#1e293b', padding: 16, borderRadius: 8, whiteSpace: 'pre-wrap' }}>{error}</pre>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, background: '#0f172a', minHeight: '100vh', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>🚀 Push to Shopify</h1>
        <p style={{ color: '#94a3b8', fontSize: 14 }}>
          Store: <strong>{shopifyStore || 'Not configured'}</strong> &nbsp;|&nbsp;
          {shopifyConfigured
            ? <span style={{ color: '#22c55e' }}>✅ Shopify connected</span>
            : <span style={{ color: '#ef4444' }}>❌ Shopify not configured — add SHOPIFY_STORE_DOMAIN + SHOPIFY_ADMIN_ACCESS_TOKEN to env</span>
          }
        </p>
      </div>

      {/* Stats bar */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Products', value: products.length, color: '#3b82f6' },
          { label: 'Not Pushed', value: notPushedCount, color: '#f59e0b' },
          { label: 'Already Pushed', value: pushedCount, color: '#22c55e' },
          { label: 'Selected', value: selectedIds.size, color: '#8b5cf6' },
          { label: 'In Stock', value: Object.values(stockMap).filter(s => s.inStock === true).length, color: '#10b981' },
          { label: 'Out of Stock', value: Object.values(stockMap).filter(s => s.inStock === false).length, color: '#ef4444' },
        ].map(s => (
          <div key={s.label} style={{ background: '#1e293b', padding: '12px 20px', borderRadius: 8, borderLeft: `4px solid ${s.color}`, minWidth: 140 }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Action bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={selectAllNotPushed} style={btnStyle('#f59e0b')}>
          Select All Not Pushed ({notPushedCount})
        </button>
        <button onClick={selectAll} style={btnStyle('#3b82f6')}>
          Select All Visible ({filtered.length})
        </button>
        <button onClick={deselectAll} style={btnStyle('#64748b')}>
          Deselect All
        </button>

        <div style={{ flex: 1 }} />

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#94a3b8', cursor: 'pointer' }}>
          <input type="checkbox" checked={forceCreate} onChange={e => setForceCreate(e.target.checked)} />
          Force create (ignore old Shopify IDs)
        </label>

        {!checkingStock ? (
          <button
            onClick={checkStock}
            disabled={selectedIds.size === 0 || pushing}
            style={{
              ...btnStyle('#0ea5e9'),
              opacity: selectedIds.size === 0 || pushing ? 0.4 : 1,
              cursor: selectedIds.size === 0 || pushing ? 'not-allowed' : 'pointer',
            }}
          >
            🔍 Check Stock ({selectedIds.size})
          </button>
        ) : (
          <button onClick={abort} style={btnStyle('#ef4444')}>⛔ Stop Check</button>
        )}

        {Object.values(stockMap).filter(s => s.inStock === true).length > 0 && (
          <button
            onClick={() => {
              const inStockIds = new Set(
                Object.entries(stockMap)
                  .filter(([_, s]) => s.inStock === true)
                  .map(([id]) => id)
              );
              setSelectedIds(inStockIds);
            }}
            style={btnStyle('#10b981')}
          >
            Select In-Stock Only ({Object.values(stockMap).filter(s => s.inStock === true).length})
          </button>
        )}

        {!pushing ? (
          <button
            onClick={pushToShopify}
            disabled={selectedIds.size === 0 || !shopifyConfigured}
            style={{
              ...btnStyle('#22c55e'),
              opacity: selectedIds.size === 0 || !shopifyConfigured ? 0.4 : 1,
              cursor: selectedIds.size === 0 || !shopifyConfigured ? 'not-allowed' : 'pointer',
              fontSize: 16,
              padding: '10px 24px',
            }}
          >
            🚀 Push {selectedIds.size} Products to Shopify
          </button>
        ) : (
          <button onClick={abort} style={btnStyle('#ef4444')}>
            ⛔ Abort
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {(['all', 'not_pushed', 'pushed'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '6px 16px',
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: filter === f ? 700 : 400,
              background: filter === f ? '#3b82f6' : '#1e293b',
              color: filter === f ? '#fff' : '#94a3b8',
            }}
          >
            {f === 'all' ? `All (${products.length})` : f === 'not_pushed' ? `Not Pushed (${notPushedCount})` : `Pushed (${pushedCount})`}
          </button>
        ))}
      </div>

      {/* Push progress */}
      {(pushing || pushResults.length > 0) && (
        <div style={{ background: '#1e293b', borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <strong>{pushing ? `Pushing batch ${currentBatch}/${totalBatches}...` : 'Push Complete'}</strong>
            <span>✅ {successCount} &nbsp; ❌ {failCount}</span>
          </div>
          {pushing && (
            <div style={{ background: '#334155', borderRadius: 4, height: 8, overflow: 'hidden' }}>
              <div style={{ background: '#22c55e', height: '100%', width: `${totalBatches > 0 ? (currentBatch / totalBatches) * 100 : 0}%`, transition: 'width 0.3s' }} />
            </div>
          )}
          <div
            ref={logRef}
            style={{ marginTop: 12, maxHeight: 200, overflow: 'auto', fontSize: 12, fontFamily: 'monospace', background: '#0f172a', padding: 12, borderRadius: 6, lineHeight: 1.6 }}
          >
            {pushLog.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        </div>
      )}

      {/* Product list */}
      <div style={{ background: '#1e293b', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#334155', textAlign: 'left' }}>
              <th style={thStyle}>
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && filtered.every(p => selectedIds.has(p.id))}
                  onChange={() => {
                    if (filtered.every(p => selectedIds.has(p.id))) deselectAll();
                    else selectAll();
                  }}
                />
              </th>
              <th style={thStyle}>Image</th>
              <th style={thStyle}>Title</th>
              <th style={thStyle}>ASIN</th>
              <th style={thStyle}>Cost</th>
              <th style={thStyle}>Sell Price</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Shopify</th>
              <th style={thStyle}>Stock</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => {
              const cost = p.cost_price || p.amazon_price || p.current_price || 0;
              const sell = p.retail_price || +(cost * 1.70).toFixed(2);
              const pushResult = pushResults.find(r => r.id === p.id);
              return (
                <tr
                  key={p.id}
                  style={{
                    borderBottom: '1px solid #334155',
                    background: selectedIds.has(p.id) ? '#1e3a5f' : 'transparent',
                    cursor: 'pointer',
                  }}
                  onClick={() => toggleSelect(p.id)}
                >
                  <td style={tdStyle}>
                    <input type="checkbox" checked={selectedIds.has(p.id)} readOnly />
                  </td>
                  <td style={tdStyle}>
                    {(p.main_image || p.image_url) ? (
                      <img src={p.main_image || p.image_url} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 }} />
                    ) : (
                      <div style={{ width: 40, height: 40, background: '#334155', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>📦</div>
                    )}
                  </td>
                  <td style={{ ...tdStyle, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.title}
                  </td>
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: 11 }}>{p.asin || '—'}</td>
                  <td style={tdStyle}>${cost.toFixed(2)}</td>
                  <td style={{ ...tdStyle, color: '#22c55e', fontWeight: 600 }}>${sell.toFixed(2)}</td>
                  <td style={tdStyle}>
                    <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, background: p.status === 'active' ? '#166534' : '#713f12', color: '#fff' }}>
                      {p.status || 'draft'}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {p.shopify_product_id ? (
                      <span style={{ color: '#22c55e' }}>✅ #{p.shopify_product_id}</span>
                    ) : pushResult?.success ? (
                      <span style={{ color: '#22c55e' }}>✅ Just pushed</span>
                    ) : pushResult?.error ? (
                      <span style={{ color: '#ef4444' }} title={pushResult.error}>❌ Failed</span>
                    ) : (
                      <span style={{ color: '#f59e0b' }}>⏳ Not pushed</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    {stockMap[p.id] ? (
                      stockMap[p.id].inStock === true ? (
                        <span style={{ color: '#22c55e' }}>✅ In Stock {stockMap[p.id].price ? `$${stockMap[p.id].price}` : ''}</span>
                      ) : stockMap[p.id].inStock === false ? (
                        <span style={{ color: '#ef4444', fontWeight: 700 }}>❌ OOS</span>
                      ) : (
                        <span style={{ color: '#94a3b8' }} title={stockMap[p.id].error}>⚠️ Unknown</span>
                      )
                    ) : (
                      <span style={{ color: '#475569' }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const btnStyle = (bg: string): React.CSSProperties => ({
  padding: '6px 14px',
  borderRadius: 6,
  border: 'none',
  background: bg,
  color: '#fff',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
});

const thStyle: React.CSSProperties = { padding: '10px 12px', fontSize: 12, color: '#94a3b8', fontWeight: 600 };
const tdStyle: React.CSSProperties = { padding: '8px 12px' };
