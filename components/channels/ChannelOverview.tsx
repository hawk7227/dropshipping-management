'use client';

import React, { useState, useEffect } from 'react';

interface ChannelOverviewProps {
  onRefresh?: () => void;
}

export default function ChannelOverview({ onRefresh }: ChannelOverviewProps) {
  const [channels, setChannels] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchChannels = async () => {
      try {
        const res = await fetch('/api/channels?action=channels-status');
        const data = await res.json();
        setChannels(data.data || {});
      } catch (error) {
        console.error('Failed to fetch channels:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchChannels();
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-gray-200 h-32 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  const channelIcons: Record<string, string> = {
    shopify: '🛍️',
    ebay: '🏷️',
    tiktok: '🎵',
    google: '🔍',
  };

  const channelNames: Record<string, string> = {
    shopify: 'Shopify',
    ebay: 'eBay',
    tiktok: 'TikTok Shop',
    google: 'Google Shopping',
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {Object.entries(channels).map(([key, channel]: [string, any]) => (
        <div
          key={key}
          className={`p-4 rounded-lg border-2 transition-all ${
            channel.active ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
          }`}
        >
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl">{channelIcons[key] || '📦'}</span>
            <h3 className="font-semibold text-gray-900">{channelNames[key] || key}</h3>
          </div>
          
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Status:</span>
              <span
                className={`font-semibold ${
                  channel.active ? 'text-green-600' : 'text-gray-400'
                }`}
              >
                {channel.active ? '✅ Active' : '⚠️ Inactive'}
              </span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-600">Listings:</span>
              <span className="font-semibold text-gray-900">
                {channel.listings_count || 0}
              </span>
            </div>
            
            <div className="flex justify-between">
              <span className="text-gray-600">Monthly Revenue:</span>
              <span className="font-semibold text-green-600">
                ${channel.monthly_revenue?.toFixed(2) || '0.00'}
              </span>
            </div>
            
            {channel.last_sync && (
              <div className="text-xs text-gray-500 pt-2 border-t">
                Last synced: {new Date(channel.last_sync).toLocaleDateString()}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
