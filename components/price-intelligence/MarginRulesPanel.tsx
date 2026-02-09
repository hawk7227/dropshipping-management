'use client';

import React, { useState, useEffect } from 'react';
import { Card, Button, Table, Badge, Modal, Input, Select, ErrorAlert, ProgressBar } from '@/components/ui';

interface MarginRule {
  id: string;
  name: string;
  description: string | null;
  min_margin: number;
  max_margin: number | null;
  target_margin: number | null;
  category: string | null;
  vendor: string | null;
  product_type: string | null;
  sku_pattern: string | null;
  priority: number;
  is_active: boolean;
  apply_to_members: boolean;
  action: 'alert' | 'auto-adjust';
  created_at: string;
  updated_at: string;
}

interface FormData {
  name: string;
  description: string;
  minMargin: number;
  maxMargin: number;
  targetMargin: number;
  category: string;
  vendor: string;
  productType: string;
  skuPattern: string;
  priority: number;
  isActive: boolean;
  applyToMembers: boolean;
  action: 'alert' | 'auto-adjust';
}

export function MarginRulesPanel() {
  const [rules, setRules] = useState<MarginRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({
    name: '',
    description: '',
    minMargin: 20,
    maxMargin: 100,
    targetMargin: 35,
    category: '',
    vendor: '',
    productType: '',
    skuPattern: '',
    priority: 0,
    isActive: true,
    applyToMembers: false,
    action: 'alert',
  });

  // Load rules
  useEffect(() => {
    loadRules();
  }, []);

  const loadRules = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/prices?action=margin-rules');
      const result = await response.json();

      if (result.success) {
        setRules(result.data || []);
      } else {
        setError(result.error || 'Failed to load margin rules');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      if (!formData.name || formData.minMargin === undefined) {
        setError('Name and minimum margin are required');
        return;
      }

      const isUpdate = !!editingId;
      const action = isUpdate ? 'update-rule' : 'create-margin-rule';

      const response = await fetch(
        `/api/prices?action=${action}`,
        {
          method: isUpdate ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingId,
            ...formData,
          }),
        }
      );

      const result = await response.json();

      if (result.success) {
        setShowModal(false);
        setEditingId(null);
        resetForm();
        loadRules();
      } else {
        setError(result.error || 'Failed to save rule');
      }
    } catch (err) {
      setError(String(err));
    }
  };

  const handleEdit = (rule: MarginRule) => {
    setFormData({
      name: rule.name,
      description: rule.description || '',
      minMargin: rule.min_margin,
      maxMargin: rule.max_margin || 100,
      targetMargin: rule.target_margin || rule.min_margin + 15,
      category: rule.category || '',
      vendor: rule.vendor || '',
      productType: rule.product_type || '',
      skuPattern: rule.sku_pattern || '',
      priority: rule.priority,
      isActive: rule.is_active,
      applyToMembers: rule.apply_to_members,
      action: rule.action,
    });
    setEditingId(rule.id);
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this rule?')) return;

    try {
      const response = await fetch(`/api/prices?action=delete-rule&id=${id}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (result.success) {
        loadRules();
      } else {
        setError(result.error || 'Failed to delete rule');
      }
    } catch (err) {
      setError(String(err));
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      minMargin: 20,
      maxMargin: 100,
      targetMargin: 35,
      category: '',
      vendor: '',
      productType: '',
      skuPattern: '',
      priority: 0,
      isActive: true,
      applyToMembers: false,
      action: 'alert',
    });
    setEditingId(null);
  };

  const handleNew = () => {
    resetForm();
    setShowModal(true);
  };

  return (
    <div className="space-y-6">
      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Margin Rules</h2>
        <Button onClick={handleNew}>+ New Rule</Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          <ProgressBar value={50} />
          <p className="text-center text-gray-400">Loading margin rules...</p>
        </div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left px-4 py-3">Name</th>
                  <th className="text-left px-4 py-3">Min Margin</th>
                  <th className="text-left px-4 py-3">Target</th>
                  <th className="text-left px-4 py-3">Max Margin</th>
                  <th className="text-left px-4 py-3">Category</th>
                  <th className="text-left px-4 py-3">Action</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3">Priority</th>
                  <th className="text-center px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-6 text-gray-400">
                      No margin rules yet. Create one to get started.
                    </td>
                  </tr>
                ) : (
                  rules.map((rule) => (
                    <tr key={rule.id} className="border-b border-gray-800 hover:bg-gray-900/50">
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-semibold">{rule.name}</p>
                          {rule.description && <p className="text-xs text-gray-400">{rule.description}</p>}
                        </div>
                      </td>
                      <td className="px-4 py-3">{rule.min_margin}%</td>
                      <td className="px-4 py-3">
                        {rule.target_margin ? `${rule.target_margin}%` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {rule.max_margin ? `${rule.max_margin}%` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {rule.category || rule.product_type ? (
                          <div className="space-y-1">
                            {rule.category && <Badge variant="neutral">{rule.category}</Badge>}
                            {rule.product_type && <Badge variant="neutral">{rule.product_type}</Badge>}
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={rule.action === 'auto-adjust' ? 'warning' : 'info'}>
                          {rule.action === 'auto-adjust' ? '🤖 Auto' : '🔔 Alert'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={rule.is_active ? 'success' : 'neutral'}>
                          {rule.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">{rule.priority}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex gap-2 justify-center">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleEdit(rule)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleDelete(rule.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Modal */}
      {showModal && (
      <Modal onClose={() => setShowModal(false)} title={editingId ? 'Edit Margin Rule' : 'Create Margin Rule'}>
        <div className="space-y-4">
          {/* Basic Info */}
          <div>
            <label className="block text-sm font-medium mb-1">Rule Name *</label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Premium Electronics"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <Input
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Optional description"
            />
          </div>

          {/* Margin Settings */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Min Margin (%) *</label>
              <Input
                type="number"
                value={formData.minMargin}
                onChange={(e) => setFormData({ ...formData, minMargin: parseFloat(e.target.value) })}
                step="0.5"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Target Margin (%)</label>
              <Input
                type="number"
                value={formData.targetMargin}
                onChange={(e) => setFormData({ ...formData, targetMargin: parseFloat(e.target.value) })}
                step="0.5"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Max Margin (%)</label>
              <Input
                type="number"
                value={formData.maxMargin}
                onChange={(e) => setFormData({ ...formData, maxMargin: parseFloat(e.target.value) })}
                step="0.5"
              />
            </div>
          </div>

          {/* Scope */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Category</label>
              <Input
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="e.g., Electronics"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Vendor</label>
              <Input
                value={formData.vendor}
                onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
                placeholder="e.g., Apple"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Product Type</label>
              <Input
                value={formData.productType}
                onChange={(e) => setFormData({ ...formData, productType: e.target.value })}
                placeholder="e.g., Smartphone"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">SKU Pattern</label>
              <Input
                value={formData.skuPattern}
                onChange={(e) => setFormData({ ...formData, skuPattern: e.target.value })}
                placeholder="e.g., SKU-ELEC-*"
              />
            </div>
          </div>

          {/* Action & Settings */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Action Type</label>
              <Select
                options={[
                  { value: 'alert', label: '🔔 Alert Only' },
                  { value: 'auto-adjust', label: '🤖 Auto-Adjust Price' }
                ]}
                value={formData.action}
                onChange={(value) => setFormData({ ...formData, action: value as 'alert' | 'auto-adjust' })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Priority</label>
              <Input
                type="number"
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })}
                min="0"
              />
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="mr-2"
              />
              <span className="text-sm">Active</span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.applyToMembers}
                onChange={(e) => setFormData({ ...formData, applyToMembers: e.target.checked })}
                className="mr-2"
              />
              <span className="text-sm">Apply Different Pricing for Members</span>
            </label>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              {editingId ? 'Update Rule' : 'Create Rule'}
            </Button>
          </div>
        </div>
      </Modal>
      )}
    </div>
  );
}
