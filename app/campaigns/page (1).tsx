'use client';

// app/campaigns/page.tsx
// Email/SMS/MMS Campaign Builder
// Converted from HTML to React - Zero visual changes - All features included
// ALL API calls are stubbed with TODO comments

import React, { useState } from 'react';

type ChannelType = 'email' | 'sms' | 'mms';
type PreviewType = 'email' | 'sms' | 'mms';

interface Lead {
  id: string;
  name: string;
  email: string;
  company: string;
  source: string;
  score: number;
}

interface LeadSource {
  id: string;
  name: string;
  icon: string;
  color: string;
  connected: boolean;
  leadCount: number;
  description: string;
  authType: 'api' | 'oauth';
}

interface Link {
  type: string;
  url: string;
}

// DATA - exact from HTML
const leadSources: LeadSource[] = [
  { id: 'hubspot', name: 'HubSpot', icon: 'H', color: '#ff7a59', connected: true, leadCount: 2847, description: 'CRM contact management, email marketing, and sales automation', authType: 'oauth' },
  { id: 'apollo', name: 'Apollo.io', icon: 'A', color: '#5c5ce0', connected: true, leadCount: 1523, description: 'B2B lead database with verified contact information', authType: 'api' },
  { id: 'zoominfo', name: 'ZoomInfo', icon: 'Z', color: '#00a4e4', connected: false, leadCount: 0, description: 'Enterprise-grade B2B database and intelligence platform', authType: 'api' },
  { id: 'leadfeeder', name: 'Leadfeeder', icon: 'L', color: '#00c875', connected: true, leadCount: 892, description: 'Website visitor identification and tracking', authType: 'oauth' },
  { id: 'salesforce', name: 'Salesforce', icon: 'S', color: '#00a1e0', connected: false, leadCount: 0, description: 'World\'s #1 CRM platform with lead management', authType: 'oauth' },
  { id: 'clearbit', name: 'Clearbit', icon: 'C', color: '#1d4ed8', connected: false, leadCount: 0, description: 'Real-time data enrichment and lead scoring', authType: 'api' },
  { id: 'lusha', name: 'Lusha', icon: '✦', color: '#6366f1', connected: false, leadCount: 0, description: 'B2B contact and company data provider', authType: 'api' },
  { id: 'linkedin', name: 'LinkedIn', icon: 'in', color: '#0077b5', connected: false, leadCount: 0, description: 'Professional network with Sales Navigator integration', authType: 'oauth' },
];

const sampleLeads: Lead[] = [
  { id: '1', name: 'John Smith', email: 'john@techcorp.com', company: 'TechCorp Inc', source: 'hubspot', score: 92 },
  { id: '2', name: 'Sarah Johnson', email: 'sarah@innovate.io', company: 'Innovate.io', source: 'apollo', score: 85 },
  { id: '3', name: 'Mike Chen', email: 'mike@globalsoft.com', company: 'GlobalSoft', source: 'leadfeeder', score: 78 },
  { id: '4', name: 'Emily Brown', email: 'emily@startup.co', company: 'StartupCo', source: 'csv', score: 65 },
  { id: '5', name: 'David Wilson', email: 'david@enterprise.com', company: 'Enterprise Ltd', source: 'zoominfo', score: 88 },
  { id: '6', name: 'Lisa Anderson', email: 'lisa@digital.agency', company: 'Digital Agency', source: 'zoominfo', score: 58 },
  { id: '7', name: 'Robert Wilson', email: 'robert@consulting.biz', company: 'Consulting Biz', source: 'salesforce', score: 52 },
];

export default function CampaignBuilderPage() {
  // STATE - exact match from original HTML
  const [channels, setChannels] = useState({ email: true, sms: false, mms: true });
  const [leads] = useState<Lead[]>(sampleLeads);
  const [currentPreview, setCurrentPreview] = useState<PreviewType>('email');
  const [collapsedPanels, setCollapsedPanels] = useState<Record<string, boolean>>({});
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [sendStatus, setSendStatus] = useState('Ready to send');
  const [selectedLeadSource, setSelectedLeadSource] = useState<LeadSource | null>(null);

  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [smsMessage, setSmsMessage] = useState('');
  const [mmsMessage, setMmsMessage] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [makeWebhook, setMakeWebhook] = useState('');

  const [links, setLinks] = useState<Link[]>([{ type: 'Landing Page', url: '' }]);

  // EVENT HANDLERS - exact match from original HTML
  const togglePanel = (panelId: string) => {
    setCollapsedPanels(prev => ({ ...prev, [panelId]: !prev[panelId] }));
  };

  const toggleChannel = (channel: ChannelType) => {
    setChannels(prev => ({ ...prev, [channel]: !prev[channel] }));
  };

  const addLinkField = () => {
    setLinks(prev => [...prev, { type: 'Landing Page', url: '' }]);
  };

  const removeLink = (index: number) => {
    if (links.length > 1) {
      setLinks(prev => prev.filter((_, i) => i !== index));
    }
  };

  const updateLink = (index: number, field: 'type' | 'url', value: string) => {
    setLinks(prev => prev.map((link, i) => i === index ? { ...link, [field]: value } : link));
  };

  const copyApiEndpoint = () => {
    navigator.clipboard.writeText('https://api.streamsai.io/v1/leads');
    alert('API endpoint copied to clipboard!');
  };

  const openModal = (modalId: string, source?: LeadSource) => {
    setActiveModal(modalId);
    if (source) setSelectedLeadSource(source);
  };

  const closeModal = () => {
    setActiveModal(null);
    setSelectedLeadSource(null);
  };

  // TODO: API STUB - testCampaign
  const testCampaign = () => {
    setSendStatus('🔄 Sending test campaign...');
    // TODO: API STUB - In production, call test send API
    // const response = await fetch('/api/campaigns/test', {
    //   method: 'POST',
    //   body: JSON.stringify({ channels, emailSubject, emailBody, smsMessage, mmsMessage })
    // });
    setTimeout(() => setSendStatus('✓ Test campaign sent successfully!'), 2000);
  };

  // TODO: API STUB - sendCampaign
  const sendCampaign = () => {
    setSendStatus(`🔄 Sending to ${leads.length} recipients...`);
    // TODO: API STUB - In production, call send API
    // const response = await fetch('/api/campaigns/send', {
    //   method: 'POST',
    //   body: JSON.stringify({ channels, leads, emailSubject, emailBody, smsMessage, mmsMessage })
    // });
    setTimeout(() => setSendStatus(`✓ Campaign sent to ${leads.length} recipients!`), 3000);
  };

  // TODO: API STUB - generateWithAI
  const generateWithAI = (field: string) => {
    // TODO: API STUB - In production, call AI generation API
    // const response = await fetch('/api/ai/generate', {
    //   method: 'POST',
    //   body: JSON.stringify({ field, context: { leads, channels } })
    // });
    
    if (field === 'subject') {
      setEmailSubject('🚀 [Name], Your exclusive offer inside!');
    } else if (field === 'body') {
      setEmailBody(`Hi [Name],

I hope this message finds you well! I wanted to reach out personally because I think [Company] would be a great fit for our latest solution.

We've helped companies like yours achieve incredible results, and I'd love to show you how.

Would you have 15 minutes this week for a quick call?

Best regards,
The StreamsAI Team`);
    }
  };

  // TODO: API STUB - saveLeadSourceConnection
  const saveLeadSourceConnection = () => {
    // TODO: API STUB - In production, save connection to DB
    // const response = await fetch('/api/integrations/connect', {
    //   method: 'POST',
    //   body: JSON.stringify({ sourceId: selectedLeadSource?.id, ... })
    // });
    alert(`Connected to ${selectedLeadSource?.name}!`);
    closeModal();
  };

  // TODO: API STUB - testLeadSourceConnection
  const testLeadSourceConnection = () => {
    // TODO: API STUB - In production, test API connection
    // const response = await fetch('/api/integrations/test', {
    //   method: 'POST',
    //   body: JSON.stringify({ sourceId: selectedLeadSource?.id })
    // });
    alert(`Testing connection to ${selectedLeadSource?.name}...`);
  };

  // TODO: API STUB - importPastedLeads
  const importPastedLeads = () => {
    // TODO: API STUB - In production, parse and import leads
    // const response = await fetch('/api/leads/import', {
    //   method: 'POST',
    //   body: JSON.stringify({ data: pasteText })
    // });
    const lines = pasteText.trim().split('\n').length;
    alert(`Imported ${lines} leads!`);
    closeModal();
  };

  // TODO: API STUB - testMakeWebhook
  const testMakeWebhook = () => {
    // TODO: API STUB - In production, test webhook
    // const response = await fetch(makeWebhook, {
    //   method: 'POST',
    //   body: JSON.stringify({ test: true })
    // });
    alert('Testing Make.com webhook...');
  };

  // TODO: API STUB - saveMakeWebhook
  const saveMakeWebhook = () => {
    // TODO: API STUB - In production, save webhook URL
    // const response = await fetch('/api/integrations/webhook', {
    //   method: 'POST',
    //   body: JSON.stringify({ url: makeWebhook })
    // });
    localStorage.setItem('makeWebhook', makeWebhook);
    alert('Make.com webhook saved!');
    closeModal();
  };

  const getScoreClass = (score: number) => {
    if (score >= 80) return 'hot';
    if (score >= 60) return 'warm';
    return 'cold';
  };

  const getSourceClass = (source: string) => {
    return source.toLowerCase().replace(/[^a-z]/g, '');
  };

  return (
    <>
      <style>{`
        :root {
          --bg-primary: #0a0a14;
          --bg-secondary: #12121c;
          --bg-tertiary: #1a1a2e;
          --bg-hover: #22222e;
          --border-color: rgba(255, 255, 255, 0.08);
          --border-active: rgba(99, 102, 241, 0.5);
          --text-primary: #f5f5f7;
          --text-secondary: #a0a0b0;
          --text-muted: #6b6b7b;
          --accent-primary: #6366f1;
          --accent-teal: #14b8a6;
          --accent-cyan: #06b6d4;
          --teal-gradient: linear-gradient(135deg, #14b8a6 0%, #06b6d4 100%);
          --success: #10b981;
          --warning: #f59e0b;
          --error: #ef4444;
          --info: #3b82f6;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter', -apple-system, sans-serif; background: var(--bg-primary); color: var(--text-primary); }
        .main-content { margin-left: 260px; display: flex; flex-direction: column; min-height: 100vh; }
        .header { background: var(--bg-secondary); border-bottom: 1px solid var(--border-color); padding: 16px 32px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 50; }
        .header-left { display: flex; align-items: center; gap: 16px; }
        .back-btn { width: 40px; height: 40px; border-radius: 10px; border: 1px solid var(--border-color); background: transparent; color: var(--text-secondary); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; }
        .back-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
        .page-title-section { display: flex; align-items: center; gap: 12px; }
        .page-icon { width: 44px; height: 44px; background: var(--teal-gradient); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; }
        .page-title-text h1 { font-size: 1.25rem; font-weight: 600; }
        .page-title-text p { font-size: 0.8rem; color: var(--text-muted); }
        .header-right { display: flex; gap: 12px; }
        .header-btn { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-radius: 10px; border: 1px solid var(--border-color); background: transparent; color: var(--text-secondary); font-size: 0.875rem; font-weight: 500; cursor: pointer; }
        .header-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
        .header-btn.primary { background: var(--teal-gradient); border: none; color: white; }
        .campaign-builder { display: grid; grid-template-columns: 1fr 380px; flex: 1; overflow: hidden; }
        .campaign-main { padding: 24px; overflow-y: auto; display: flex; flex-direction: column; gap: 24px; }
        .campaign-preview { background: var(--bg-secondary); border-left: 1px solid var(--border-color); display: flex; flex-direction: column; }
        .panel { background: var(--bg-secondary); border-radius: 16px; border: 1px solid var(--border-color); overflow: hidden; }
        .panel-header { padding: 20px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; }
        .panel-header:hover { background: var(--bg-hover); }
        .panel-header-left { display: flex; align-items: center; gap: 16px; }
        .panel-icon { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; }
        .panel-icon.leads { background: rgba(99, 102, 241, 0.15); }
        .panel-icon.config { background: rgba(20, 184, 166, 0.15); }
        .panel-title-section h3 { font-size: 1rem; font-weight: 600; margin-bottom: 2px; }
        .panel-title-section p { font-size: 0.75rem; color: var(--text-muted); }
        .panel-header-right { display: flex; align-items: center; gap: 16px; }
        .panel-badge { background: var(--accent-primary); color: white; font-size: 0.75rem; font-weight: 600; padding: 4px 12px; border-radius: 20px; }
        .panel-stats { display: flex; gap: 16px; }
        .panel-stat { text-align: center; }
        .panel-stat-value { font-size: 1rem; font-weight: 600; color: var(--accent-teal); }
        .panel-stat-label { font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; }
        .panel-toggle { width: 32px; height: 32px; border-radius: 8px; border: 1px solid var(--border-color); background: transparent; color: var(--text-secondary); display: flex; align-items: center; justify-content: center; transition: transform 0.3s; }
        .panel.collapsed .panel-toggle { transform: rotate(-90deg); }
        .panel-content { padding: 0 20px 20px; }
        .panel.collapsed .panel-content { display: none; }
        .leads-section { margin-bottom: 24px; }
        .leads-section-title { font-size: 0.75rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
        .leads-sources-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
        .lead-source-card { padding: 16px; background: var(--bg-tertiary); border-radius: 12px; border: 1px solid var(--border-color); cursor: pointer; transition: all 0.2s; text-align: center; }
        .lead-source-card:hover { border-color: var(--border-active); background: var(--bg-hover); }
        .lead-source-card.connected { border-color: var(--success); }
        .lead-source-icon { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; margin: 0 auto 10px; font-weight: 700; font-size: 1rem; color: white; }
        .lead-source-name { font-size: 0.8rem; font-weight: 600; margin-bottom: 4px; }
        .lead-source-status { font-size: 0.7rem; color: var(--text-muted); }
        .lead-source-status.connected { color: var(--success); }
        .bulk-upload-row { display: flex; gap: 12px; margin-bottom: 16px; }
        .upload-btn { flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 14px; border-radius: 10px; border: 1px dashed var(--border-color); background: var(--bg-tertiary); color: var(--text-secondary); font-size: 0.8rem; font-weight: 500; cursor: pointer; }
        .upload-btn:hover { border-color: var(--accent-teal); color: var(--accent-teal); background: rgba(20, 184, 166, 0.1); }
        .upload-btn input { display: none; }
        .api-endpoint-box { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: var(--bg-tertiary); border-radius: 10px; margin-bottom: 16px; }
        .api-endpoint-url { flex: 1; font-family: monospace; font-size: 0.8rem; color: var(--accent-teal); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .api-btn { padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-color); background: transparent; color: var(--text-secondary); font-size: 0.75rem; cursor: pointer; }
        .api-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
        .links-container { display: flex; flex-direction: column; gap: 10px; }
        .link-row { display: flex; gap: 10px; align-items: center; }
        .link-row select { width: 120px; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-tertiary); color: var(--text-primary); font-size: 0.8rem; }
        .link-row input { flex: 1; padding: 10px 14px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-tertiary); color: var(--text-primary); font-size: 0.8rem; }
        .link-row input::placeholder { color: var(--text-muted); }
        .link-action-btn { width: 36px; height: 36px; border-radius: 8px; border: 1px solid var(--border-color); background: transparent; color: var(--text-secondary); cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .link-action-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
        .link-action-btn.danger:hover { background: rgba(239, 68, 68, 0.15); color: var(--error); border-color: var(--error); }
        .add-link-btn { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px; border-radius: 10px; border: 1px dashed var(--border-color); background: transparent; color: var(--text-muted); font-size: 0.8rem; cursor: pointer; width: 100%; margin-top: 8px; }
        .add-link-btn:hover { border-color: var(--border-active); color: var(--text-primary); }
        .webhook-box { display: flex; align-items: center; gap: 16px; padding: 16px; background: var(--bg-tertiary); border-radius: 12px; border: 1px solid var(--border-color); }
        .webhook-icon { width: 48px; height: 48px; background: rgba(245, 158, 11, 0.15); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; }
        .webhook-info { flex: 1; }
        .webhook-info h4 { font-size: 0.9rem; font-weight: 600; margin-bottom: 2px; }
        .webhook-info p { font-size: 0.75rem; color: var(--text-muted); }
        .webhook-btn { padding: 10px 16px; border-radius: 8px; border: 1px solid var(--border-color); background: transparent; color: var(--text-secondary); font-size: 0.8rem; font-weight: 500; cursor: pointer; }
        .webhook-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
        .channel-toggles { display: flex; gap: 12px; margin-bottom: 20px; }
        .channel-toggle { flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 14px 16px; border-radius: 10px; border: 1px solid var(--border-color); background: var(--bg-tertiary); cursor: pointer; font-size: 0.875rem; font-weight: 500; color: var(--text-secondary); }
        .channel-toggle:hover { border-color: var(--border-active); }
        .channel-toggle.active { border-color: var(--accent-teal); background: rgba(20, 184, 166, 0.15); color: var(--accent-teal); }
        .channel-toggle input { display: none; }
        .channel-config { background: var(--bg-tertiary); border-radius: 12px; padding: 20px; margin-bottom: 16px; display: none; }
        .channel-config.active { display: block; }
        .channel-config-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
        .channel-config-title { display: flex; align-items: center; gap: 8px; font-size: 0.9rem; font-weight: 600; }
        .channel-status { display: flex; align-items: center; gap: 6px; font-size: 0.75rem; color: var(--success); }
        .config-form-group { margin-bottom: 16px; }
        .config-label { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
        .config-label span { font-size: 0.8rem; color: var(--text-secondary); }
        .ai-generate-btn { display: flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 6px; border: 1px solid var(--border-color); background: transparent; color: var(--accent-primary); font-size: 0.7rem; cursor: pointer; }
        .ai-generate-btn:hover { background: rgba(99, 102, 241, 0.1); }
        .config-input { width: 100%; padding: 12px 14px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); font-size: 0.875rem; }
        .config-input::placeholder { color: var(--text-muted); }
        .config-textarea { width: 100%; min-height: 120px; padding: 12px 14px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); font-size: 0.875rem; resize: vertical; font-family: inherit; }
        .config-textarea::placeholder { color: var(--text-muted); }
        .mms-media-section { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border-color); }
        .mms-media-title { font-size: 0.8rem; font-weight: 500; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
        .mms-media-row { display: flex; gap: 12px; }
        .mms-upload-btn { flex: 0 0 auto; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px 20px; border-radius: 8px; border: 1px dashed var(--border-color); background: var(--bg-secondary); color: var(--text-muted); font-size: 0.8rem; cursor: pointer; }
        .mms-upload-btn:hover { border-color: var(--accent-teal); color: var(--accent-teal); }
        .mms-url-input { flex: 1; padding: 12px 14px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); font-size: 0.8rem; }
        .mms-url-input::placeholder { color: var(--text-muted); }
        .preview-header { padding: 20px; border-bottom: 1px solid var(--border-color); }
        .preview-title { font-size: 0.9rem; font-weight: 600; margin-bottom: 12px; }
        .preview-tabs { display: flex; gap: 8px; }
        .preview-tab { padding: 8px 16px; border-radius: 8px; border: 1px solid var(--border-color); background: transparent; color: var(--text-secondary); font-size: 0.8rem; font-weight: 500; cursor: pointer; }
        .preview-tab:hover { background: var(--bg-hover); }
        .preview-tab.active { background: var(--accent-teal); border-color: var(--accent-teal); color: white; }
        .preview-content { flex: 1; padding: 20px; overflow-y: auto; display: flex; align-items: center; justify-content: center; }
        .email-preview { width: 100%; max-width: 400px; background: white; border-radius: 12px; overflow: hidden; color: #333; }
        .email-header { display: flex; align-items: center; gap: 12px; padding: 16px; border-bottom: 1px solid #eee; }
        .email-avatar { width: 40px; height: 40px; background: var(--teal-gradient); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; }
        .email-sender-info { flex: 1; }
        .email-sender-name { font-weight: 600; font-size: 0.9rem; }
        .email-time { font-size: 0.75rem; color: #888; }
        .email-body { padding: 20px; }
        .email-subject { font-size: 1.1rem; font-weight: 600; margin-bottom: 16px; color: #111; }
        .email-text { font-size: 0.9rem; line-height: 1.6; color: #444; white-space: pre-wrap; }
        .email-actions { display: flex; gap: 8px; padding: 16px; border-top: 1px solid #eee; }
        .email-action-btn { padding: 8px 16px; border-radius: 6px; border: 1px solid #ddd; background: white; color: #666; font-size: 0.8rem; cursor: pointer; }
        .phone-mockup { width: 280px; background: #1a1a1a; border-radius: 40px; padding: 12px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); }
        .phone-screen { background: #000; border-radius: 32px; overflow: hidden; }
        .phone-status-bar { display: flex; justify-content: space-between; padding: 8px 20px; font-size: 0.7rem; color: white; }
        .phone-message-header { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: #1c1c1e; }
        .phone-back-arrow { color: #0a84ff; font-size: 1.2rem; }
        .phone-contact-avatar { width: 32px; height: 32px; background: #34c759; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; }
        .phone-contact-name { font-size: 0.9rem; font-weight: 500; color: white; }
        .phone-messages { padding: 16px; min-height: 300px; display: flex; flex-direction: column; justify-content: flex-end; }
        .message-bubble { background: #34c759; color: white; padding: 12px 16px; border-radius: 18px; border-bottom-right-radius: 4px; max-width: 85%; margin-left: auto; font-size: 0.9rem; line-height: 1.4; }
        .message-bubble.mms { padding: 8px; }
        .message-image-placeholder { width: 100%; height: 150px; background: #2c2c2e; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 2rem; margin-bottom: 8px; }
        .mms-text { padding: 8px; }
        .preview-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: var(--border-color); border-top: 1px solid var(--border-color); }
        .preview-stat { background: var(--bg-secondary); padding: 16px; text-align: center; }
        .preview-stat-label { font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px; }
        .preview-stat-value { font-size: 1rem; font-weight: 600; }
        .send-actions { padding: 20px; border-top: 1px solid var(--border-color); }
        .send-buttons { display: flex; gap: 12px; margin-bottom: 12px; }
        .test-btn { flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 14px; border-radius: 10px; border: 1px solid var(--border-color); background: transparent; color: var(--text-secondary); font-size: 0.875rem; font-weight: 500; cursor: pointer; }
        .test-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
        .send-btn { flex: 2; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 14px; border-radius: 10px; border: none; background: var(--teal-gradient); color: white; font-size: 0.875rem; font-weight: 600; cursor: pointer; }
        .send-btn:hover { opacity: 0.9; }
        .send-status { text-align: center; font-size: 0.8rem; color: var(--text-muted); }
        .sidebar { width: 260px; background: var(--bg-secondary); border-right: 1px solid var(--border-color); display: flex; flex-direction: column; position: fixed; height: 100vh; }
        .sidebar-header { padding: 20px; border-bottom: 1px solid var(--border-color); }
        .logo { display: flex; align-items: center; gap: 12px; text-decoration: none; }
        .logo-icon { width: 36px; height: 36px; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 18px; }
        .logo-text { font-size: 1.25rem; font-weight: 700; color: var(--text-primary); }
        .sidebar-nav { flex: 1; padding: 16px 12px; overflow-y: auto; }
        .nav-section { margin-bottom: 24px; }
        .nav-section-title { font-size: 0.7rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; padding: 0 12px; margin-bottom: 8px; }
        .nav-item { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 8px; color: var(--text-secondary); text-decoration: none; font-size: 0.875rem; font-weight: 500; cursor: pointer; }
        .nav-item:hover { background: var(--bg-hover); color: var(--text-primary); }
        .nav-item.active { background: rgba(20, 184, 166, 0.15); color: var(--accent-teal); }
        .nav-item-icon { width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; }
        .nav-item-badge { margin-left: auto; background: var(--accent-teal); color: white; font-size: 0.7rem; padding: 2px 6px; border-radius: 10px; font-weight: 600; }
        .sidebar-footer { padding: 16px; border-top: 1px solid var(--border-color); }
        .usage-card { background: var(--bg-tertiary); border-radius: 12px; padding: 16px; }
        .usage-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        .usage-title { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
        .usage-plan { font-size: 0.7rem; background: var(--teal-gradient); color: white; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
        .usage-bar { height: 6px; background: var(--bg-hover); border-radius: 3px; overflow: hidden; margin-bottom: 8px; }
        .usage-fill { height: 100%; background: var(--teal-gradient); border-radius: 3px; }
        .usage-text { font-size: 0.75rem; color: var(--text-secondary); }
        .usage-text strong { color: var(--text-primary); }
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .modal { background: var(--bg-secondary); border-radius: 16px; border: 1px solid var(--border-color); width: 90%; max-width: 600px; max-height: 90vh; overflow: hidden; display: flex; flex-direction: column; }
        .modal-header { padding: 20px 24px; border-bottom: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between; }
        .modal-title { display: flex; align-items: center; gap: 12px; font-size: 1.1rem; font-weight: 600; }
        .modal-close { width: 32px; height: 32px; border-radius: 8px; border: none; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 1.25rem; }
        .modal-close:hover { background: var(--bg-hover); color: var(--text-primary); }
        .modal-content { padding: 24px; overflow-y: auto; flex: 1; }
        .modal-form-group { margin-bottom: 20px; }
        .modal-label { display: block; font-size: 0.8rem; font-weight: 500; color: var(--text-secondary); margin-bottom: 8px; }
        .modal-input { width: 100%; padding: 12px 16px; border-radius: 10px; border: 1px solid var(--border-color); background: var(--bg-tertiary); color: var(--text-primary); font-size: 0.875rem; }
        .modal-input::placeholder { color: var(--text-muted); }
        .modal-actions { display: flex; gap: 12px; margin-top: 24px; }
        .modal-btn { flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 14px; border-radius: 10px; font-size: 0.875rem; font-weight: 500; cursor: pointer; }
        .modal-btn.primary { background: var(--teal-gradient); border: none; color: white; }
        .modal-btn.secondary { background: transparent; border: 1px solid var(--border-color); color: var(--text-secondary); }
        .modal-btn:hover { opacity: 0.9; }
        .leads-table { width: 100%; border-collapse: collapse; }
        .leads-table th, .leads-table td { padding: 12px 16px; text-align: left; border-bottom: 1px solid var(--border-color); }
        .leads-table th { font-size: 0.75rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; }
        .leads-table td { font-size: 0.85rem; }
        .lead-checkbox { width: 18px; height: 18px; }
        .lead-name { font-weight: 500; }
        .lead-email a { color: var(--accent-teal); text-decoration: none; }
        .lead-source { padding: 4px 10px; border-radius: 20px; font-size: 0.7rem; font-weight: 600; }
        .lead-source.hubspot { background: rgba(255, 122, 89, 0.15); color: #ff7a59; }
        .lead-source.apollo { background: rgba(92, 92, 224, 0.15); color: #5c5ce0; }
        .lead-source.zoominfo { background: rgba(0, 164, 228, 0.15); color: #00a4e4; }
        .lead-source.leadfeeder { background: rgba(0, 200, 117, 0.15); color: #00c875; }
        .lead-source.salesforce { background: rgba(0, 161, 224, 0.15); color: #00a1e0; }
        .lead-source.csv { background: rgba(99, 102, 241, 0.15); color: #6366f1; }
        .lead-score { display: flex; align-items: center; gap: 8px; }
        .score-bar { width: 60px; height: 6px; background: var(--bg-hover); border-radius: 3px; overflow: hidden; }
        .score-fill { height: 100%; border-radius: 3px; }
        .score-fill.hot { background: var(--success); }
        .score-fill.warm { background: var(--warning); }
        .score-fill.cold { background: var(--error); }
        .score-value { font-size: 0.8rem; font-weight: 600; }
        .lead-actions { display: flex; gap: 4px; }
        .lead-action-btn { width: 28px; height: 28px; border-radius: 6px; border: none; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 0.8rem; }
        .lead-action-btn:hover { background: var(--bg-hover); }
        .paste-textarea { width: 100%; min-height: 150px; padding: 16px; border-radius: 10px; border: 1px solid var(--border-color); background: var(--bg-tertiary); color: var(--text-primary); font-family: monospace; font-size: 0.8rem; resize: vertical; margin-bottom: 16px; }
        .supported-formats { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
        .format-tag { padding: 4px 10px; background: var(--bg-tertiary); border-radius: 6px; font-size: 0.7rem; color: var(--text-muted); font-family: monospace; }
        .api-key-section { margin-bottom: 24px; }
        .api-key-row { display: flex; gap: 8px; align-items: center; }
        .api-key-input { flex: 1; padding: 12px 16px; border-radius: 10px; border: 1px solid var(--border-color); background: var(--bg-tertiary); color: var(--text-primary); font-family: monospace; font-size: 0.8rem; }
        .api-key-btn { width: 40px; height: 40px; border-radius: 8px; border: 1px solid var(--border-color); background: transparent; color: var(--text-secondary); cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .api-key-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
        .api-endpoints { display: flex; flex-direction: column; gap: 8px; margin-top: 24px; }
        .api-endpoint { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: var(--bg-tertiary); border-radius: 8px; font-family: monospace; font-size: 0.8rem; }
        .api-endpoint-method { padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: 600; }
        .api-endpoint-method.post { background: rgba(16, 185, 129, 0.15); color: var(--success); }
        .api-endpoint-method.get { background: rgba(59, 130, 246, 0.15); color: var(--info); }
        .api-endpoint-method.put { background: rgba(245, 158, 11, 0.15); color: var(--warning); }
        .api-endpoint-method.delete { background: rgba(239, 68, 68, 0.15); color: var(--error); }
        .make-instructions { background: var(--bg-tertiary); border-radius: 10px; padding: 20px; margin-bottom: 24px; }
        .make-instructions-title { font-size: 0.875rem; font-weight: 600; margin-bottom: 12px; }
        .make-instructions ol { padding-left: 20px; font-size: 0.8rem; color: var(--text-secondary); line-height: 1.8; }
        @media (max-width: 992px) { .sidebar { display: none; } .main-content { margin-left: 0; } .campaign-builder { grid-template-columns: 1fr; } .campaign-preview { display: none; } }
        @media (max-width: 768px) { .leads-sources-grid { grid-template-columns: repeat(2, 1fr); } .channel-toggles { flex-direction: column; } .bulk-upload-row { flex-direction: column; } }
      `}</style>

      <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0a14', color: '#f5f5f7' }}>
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-header">
            <a href="#" className="logo">
              <div className="logo-icon">⚡</div>
              <span className="logo-text">StreamsAI</span>
            </a>
          </div>

          <nav className="sidebar-nav">
            <div className="nav-section">
              <div className="nav-section-title">Main</div>
              <a href="/dashboard" className="nav-item"><span className="nav-item-icon">🏠</span><span>Dashboard</span></a>
              <a href="/social" className="nav-item"><span className="nav-item-icon">✨</span><span>Media/Marketing</span></a>
              <a href="/campaigns" className="nav-item active"><span className="nav-item-icon">📧</span><span>Campaigns</span><span className="nav-item-badge">4</span></a>
            </div>
            <div className="nav-section">
              <div className="nav-section-title">Content</div>
              <a href="#" className="nav-item"><span className="nav-item-icon">📁</span><span>Library</span></a>
              <a href="#" className="nav-item"><span className="nav-item-icon">🕐</span><span>History</span></a>
            </div>
            <div className="nav-section">
              <div className="nav-section-title">Settings</div>
              <a href="#" className="nav-item"><span className="nav-item-icon">🔌</span><span>Integrations</span></a>
              <a href="#" className="nav-item"><span className="nav-item-icon">⚙️</span><span>Settings</span></a>
            </div>
          </nav>

          <div className="sidebar-footer">
            <div className="usage-card">
              <div className="usage-header">
                <span className="usage-title">Campaign Credits</span>
                <span className="usage-plan">Pro</span>
              </div>
              <div className="usage-bar"><div className="usage-fill" style={{ width: '45%' }}></div></div>
              <div className="usage-text"><strong>4,500</strong> / 10,000 messages</div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="main-content">
          {/* Header */}
          <header className="header">
            <div className="header-left">
              <button className="back-btn" onClick={() => window.history.back()}>←</button>
              <div className="page-title-section">
                <div className="page-icon">📧</div>
                <div className="page-title-text">
                  <h1>Email/SMS/MMS Campaign</h1>
                  <p>Send personalized campaigns with lead management</p>
                </div>
              </div>
            </div>
            <div className="header-right">
              <button className="header-btn"><span>📊</span><span>Analytics</span></button>
              <button className="header-btn"><span>💾</span><span>Save Draft</span></button>
              <button className="header-btn primary"><span>📅</span><span>Schedule</span></button>
            </div>
          </header>

          {/* Campaign Builder */}
          <div className="campaign-builder">
            {/* Main Content Area */}
            <div className="campaign-main">
              {/* Leads Panel */}
              <div className={`panel ${collapsedPanels['leadsPanel'] ? 'collapsed' : ''}`}>
                <div className="panel-header" onClick={() => togglePanel('leadsPanel')}>
                  <div className="panel-header-left">
                    <div className="panel-icon leads">👥</div>
                    <div className="panel-title-section">
                      <h3>Leads &amp; Data Sources</h3>
                      <p>Import • API • Integrations</p>
                    </div>
                  </div>
                  <div className="panel-header-right">
                    <span className="panel-badge">{leads.length.toLocaleString()} leads</span>
                    <button className="panel-toggle">▼</button>
                  </div>
                </div>
                <div className="panel-content">
                  {/* Lead Sources Grid */}
                  <div className="leads-section">
                    <div className="leads-section-title"><span>🔌</span><span>Lead Source Integrations</span></div>
                    <div className="leads-sources-grid">
                      {leadSources.map(source => (
                        <div key={source.id} className={`lead-source-card ${source.connected ? 'connected' : ''}`} onClick={() => openModal('leadSource', source)}>
                          <div className="lead-source-icon" style={{ background: source.color }}>{source.icon}</div>
                          <div className="lead-source-name">{source.name}</div>
                          <div className={`lead-source-status ${source.connected ? 'connected' : ''}`}>
                            {source.connected ? `✓ ${source.leadCount.toLocaleString()} leads` : 'Click to connect'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Bulk Upload */}
                  <div className="leads-section">
                    <div className="leads-section-title"><span>📤</span><span>Bulk Upload</span></div>
                    <div className="bulk-upload-row">
                      <label className="upload-btn"><span>📄</span><span>Upload CSV</span><input type="file" accept=".csv" /></label>
                      <label className="upload-btn"><span>📊</span><span>Upload Excel</span><input type="file" accept=".xlsx,.xls" /></label>
                      <button className="upload-btn" onClick={() => openModal('paste')}><span>📋</span><span>Paste Import</span></button>
                    </div>
                  </div>

                  {/* API Endpoint */}
                  <div className="leads-section">
                    <div className="leads-section-title"><span>🔗</span><span>API Endpoint</span></div>
                    <div className="api-endpoint-box">
                      <span className="api-endpoint-url">https://api.streamsai.io/v1/leads</span>
                      <button className="api-btn" onClick={copyApiEndpoint}>📋 Copy</button>
                      <button className="api-btn" onClick={() => openModal('apiKeys')}>🔑 Keys</button>
                    </div>
                  </div>

                  {/* View All Leads */}
                  <div className="leads-section">
                    <button className="upload-btn" style={{ width: '100%', borderStyle: 'solid' }} onClick={() => openModal('leads')}>
                      <span>👥</span><span>View All {leads.length.toLocaleString()} Leads</span>
                    </button>
                  </div>

                  {/* Links & Tracking */}
                  <div className="leads-section">
                    <div className="leads-section-title"><span>🔗</span><span>Links &amp; Tracking URLs</span></div>
                    <div className="links-container">
                      {links.map((link, index) => (
                        <div key={index} className="link-row">
                          <select value={link.type} onChange={(e) => updateLink(index, 'type', e.target.value)}>
                            <option>Landing Page</option>
                            <option>CTA</option>
                            <option>Offer</option>
                            <option>Tracking</option>
                          </select>
                          <input type="text" placeholder="https://yoursite.com/landing" value={link.url} onChange={(e) => updateLink(index, 'url', e.target.value)} />
                          <button className="link-action-btn">🔗</button>
                          <button className="link-action-btn danger" onClick={() => removeLink(index)}>✕</button>
                        </div>
                      ))}
                    </div>
                    <button className="add-link-btn" onClick={addLinkField}><span>➕</span><span>Add Link</span></button>
                  </div>

                  {/* Webhook Integration */}
                  <div className="leads-section">
                    <div className="leads-section-title"><span>⚡</span><span>Webhook Integration</span></div>
                    <div className="webhook-box">
                      <div className="webhook-icon">⚡</div>
                      <div className="webhook-info">
                        <h4>Make.com Integration</h4>
                        <p>Connect to automate workflows with incoming leads</p>
                      </div>
                      <button className="webhook-btn" onClick={() => openModal('make')}>Configure</button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Campaign Config Panel */}
              <div className={`panel ${collapsedPanels['configPanel'] ? 'collapsed' : ''}`}>
                <div className="panel-header" onClick={() => togglePanel('configPanel')}>
                  <div className="panel-header-left">
                    <div className="panel-icon config">📧</div>
                    <div className="panel-title-section">
                      <h3>Campaign Config</h3>
                      <p>Email • SMS • MMS</p>
                    </div>
                  </div>
                  <div className="panel-header-right">
                    <div className="panel-stats">
                      <div className="panel-stat"><div className="panel-stat-value">{Object.values(channels).filter(Boolean).length}</div><div className="panel-stat-label">Channels</div></div>
                      <div className="panel-stat"><div className="panel-stat-value">$0.18</div><div className="panel-stat-label">Est. Cost</div></div>
                    </div>
                    <button className="panel-toggle">▼</button>
                  </div>
                </div>
                <div className="panel-content">
                  {/* Channel Toggles */}
                  <div className="channel-toggles">
                    <label className={`channel-toggle ${channels.email ? 'active' : ''}`} onClick={() => toggleChannel('email')}><input type="checkbox" checked={channels.email} readOnly /><span>📧</span><span>Email</span></label>
                    <label className={`channel-toggle ${channels.sms ? 'active' : ''}`} onClick={() => toggleChannel('sms')}><input type="checkbox" checked={channels.sms} readOnly /><span>💬</span><span>SMS</span></label>
                    <label className={`channel-toggle ${channels.mms ? 'active' : ''}`} onClick={() => toggleChannel('mms')}><input type="checkbox" checked={channels.mms} readOnly /><span>🖼️</span><span>MMS</span></label>
                  </div>

                  {/* Email Config */}
                  <div className={`channel-config ${channels.email ? 'active' : ''}`}>
                    <div className="channel-config-header">
                      <div className="channel-config-title"><span>📧</span><span>Email Configuration</span></div>
                      <div className="channel-status"><span>●</span><span>Active</span></div>
                    </div>
                    <div className="config-form-group">
                      <div className="config-label">
                        <span>Subject Line</span>
                        <button className="ai-generate-btn" onClick={() => generateWithAI('subject')}><span>✨</span><span>Generate</span></button>
                      </div>
                      <input type="text" className="config-input" placeholder="Enter your email subject..." value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} />
                    </div>
                    <div className="config-form-group">
                      <div className="config-label">
                        <span>Email Body</span>
                        <button className="ai-generate-btn" onClick={() => generateWithAI('body')}><span>✨</span><span>Generate</span></button>
                      </div>
                      <textarea className="config-textarea" placeholder="Write your email content..." value={emailBody} onChange={(e) => setEmailBody(e.target.value)}></textarea>
                    </div>
                  </div>

                  {/* SMS Config */}
                  <div className={`channel-config ${channels.sms ? 'active' : ''}`}>
                    <div className="channel-config-header">
                      <div className="channel-config-title"><span>💬</span><span>SMS Configuration</span></div>
                      <div className="channel-status"><span>●</span><span>Active</span></div>
                    </div>
                    <div className="config-form-group">
                      <div className="config-label"><span>Message</span><span>{smsMessage.length}/160</span></div>
                      <textarea className="config-textarea" placeholder="Enter your SMS message..." value={smsMessage} onChange={(e) => setSmsMessage(e.target.value)} style={{ minHeight: '80px' }}></textarea>
                    </div>
                  </div>

                  {/* MMS Config */}
                  <div className={`channel-config ${channels.mms ? 'active' : ''}`}>
                    <div className="channel-config-header">
                      <div className="channel-config-title"><span>🖼️</span><span>MMS Configuration</span></div>
                      <div className="channel-status"><span>●</span><span>Active</span></div>
                    </div>
                    <div className="config-form-group">
                      <div className="config-label"><span>Message</span><span>{mmsMessage.length}/160</span></div>
                      <textarea className="config-textarea" placeholder="Enter your MMS message..." value={mmsMessage} onChange={(e) => setMmsMessage(e.target.value)} style={{ minHeight: '80px' }}></textarea>
                    </div>
                    <div className="mms-media-section">
                      <div className="mms-media-title"><span>🖼️</span><span>Media</span></div>
                      <div className="mms-media-row">
                        <label className="mms-upload-btn"><span>🖼️</span><span>Select Image</span><input type="file" accept="image/*" style={{ display: 'none' }} /></label>
                        <input type="text" className="mms-url-input" placeholder="Or paste image URL" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Preview Panel */}
            <div className="campaign-preview">
              <div className="preview-header">
                <div className="preview-title">Preview</div>
                <div className="preview-tabs">
                  <button className={`preview-tab ${currentPreview === 'email' ? 'active' : ''}`} onClick={() => setCurrentPreview('email')}>Email</button>
                  <button className={`preview-tab ${currentPreview === 'sms' ? 'active' : ''}`} onClick={() => setCurrentPreview('sms')}>SMS</button>
                  <button className={`preview-tab ${currentPreview === 'mms' ? 'active' : ''}`} onClick={() => setCurrentPreview('mms')}>MMS</button>
                </div>
              </div>

              <div className="preview-content">
                {currentPreview === 'email' && (
                  <div className="email-preview">
                    <div className="email-header">
                      <div className="email-avatar">S</div>
                      <div className="email-sender-info">
                        <div className="email-sender-name">StreamsAI</div>
                        <div className="email-time">Just now</div>
                      </div>
                    </div>
                    <div className="email-body">
                      <div className="email-subject">{emailSubject || 'Your subject line here'}</div>
                      <div className="email-text">{emailBody || 'Your email body will appear here as you type. Use personalization variables like [Name] and [Company] to customize your message.'}</div>
                    </div>
                    <div className="email-actions">
                      <button className="email-action-btn">Reply</button>
                      <button className="email-action-btn">Forward</button>
                    </div>
                  </div>
                )}

                {currentPreview === 'sms' && (
                  <div className="phone-mockup">
                    <div className="phone-screen">
                      <div className="phone-status-bar"><span>Carrier</span><span>9:41</span><span>100%</span></div>
                      <div className="phone-message-header">
                        <span className="phone-back-arrow">‹</span>
                        <div className="phone-contact-avatar">🟢</div>
                        <span className="phone-contact-name">StreamsAI</span>
                      </div>
                      <div className="phone-messages">
                        <div className="message-bubble">{smsMessage || 'Your SMS message will appear here...'}</div>
                      </div>
                    </div>
                  </div>
                )}

                {currentPreview === 'mms' && (
                  <div className="phone-mockup">
                    <div className="phone-screen">
                      <div className="phone-status-bar"><span>Carrier</span><span>9:41</span><span>100%</span></div>
                      <div className="phone-message-header">
                        <span className="phone-back-arrow">‹</span>
                        <div className="phone-contact-avatar">🟢</div>
                        <span className="phone-contact-name">StreamsAI</span>
                      </div>
                      <div className="phone-messages">
                        <div className="message-bubble mms">
                          <div className="message-image-placeholder">📷</div>
                          <div className="mms-text">{mmsMessage || 'Your MMS message here...'}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="preview-stats">
                <div className="preview-stat"><div className="preview-stat-label">Opens</div><div className="preview-stat-value">--</div></div>
                <div className="preview-stat"><div className="preview-stat-label">Clicks</div><div className="preview-stat-value">--</div></div>
                <div className="preview-stat"><div className="preview-stat-label">Bounce</div><div className="preview-stat-value">--</div></div>
                <div className="preview-stat"><div className="preview-stat-label">Delivered</div><div className="preview-stat-value">--</div></div>
              </div>

              <div className="send-actions">
                <div className="send-buttons">
                  <button className="test-btn" onClick={testCampaign}><span>🧪</span><span>Test Campaign</span></button>
                  <button className="send-btn" onClick={sendCampaign}><span>▶</span><span>Send to {leads.length.toLocaleString()} Recipients</span></button>
                </div>
                <div className="send-status">{sendStatus}</div>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* MODALS */}
      
      {/* Leads Modal */}
      {activeModal === 'leads' && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" style={{ maxWidth: '900px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title"><span>👥</span><span>All Leads ({leads.length.toLocaleString()})</span></div>
              <button className="modal-close" onClick={closeModal}>✕</button>
            </div>
            <div className="modal-content" style={{ padding: 0 }}>
              <div style={{ overflowX: 'auto' }}>
                <table className="leads-table">
                  <thead>
                    <tr>
                      <th><input type="checkbox" className="lead-checkbox" /></th>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Company</th>
                      <th>Source</th>
                      <th>Score</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map(lead => (
                      <tr key={lead.id}>
                        <td><input type="checkbox" className="lead-checkbox" /></td>
                        <td className="lead-name">{lead.name}</td>
                        <td className="lead-email"><a href={`mailto:${lead.email}`}>{lead.email}</a></td>
                        <td>{lead.company}</td>
                        <td><span className={`lead-source ${getSourceClass(lead.source)}`}>{lead.source}</span></td>
                        <td>
                          <div className="lead-score">
                            <div className="score-bar"><div className={`score-fill ${getScoreClass(lead.score)}`} style={{ width: `${lead.score}%` }}></div></div>
                            <span className="score-value">{lead.score}</span>
                          </div>
                        </td>
                        <td>
                          <div className="lead-actions">
                            <button className="lead-action-btn">✏️</button>
                            <button className="lead-action-btn">📧</button>
                            <button className="lead-action-btn">🗑️</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lead Source Connection Modal */}
      {activeModal === 'leadSource' && selectedLeadSource && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <span style={{ width: 32, height: 32, borderRadius: 8, background: selectedLeadSource.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700 }}>{selectedLeadSource.icon}</span>
                <span>Connect {selectedLeadSource.name}</span>
              </div>
              <button className="modal-close" onClick={closeModal}>✕</button>
            </div>
            <div className="modal-content">
              <p style={{ color: 'var(--text-muted)', marginBottom: 20, fontSize: '0.875rem' }}>{selectedLeadSource.description}</p>
              
              {selectedLeadSource.authType === 'oauth' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 16, background: 'rgba(99, 102, 241, 0.1)', borderRadius: 10, marginBottom: 20 }}>
                  <span>🔐</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>This integration uses OAuth 2.0 authentication. You&apos;ll be redirected to authorize access.</span>
                </div>
              )}

              <div className="modal-form-group">
                <label className="modal-label">{selectedLeadSource.authType === 'api' ? 'API Key' : 'Portal ID'}</label>
                <input type="text" className="modal-input" placeholder={selectedLeadSource.authType === 'api' ? 'Enter your API key...' : 'Your Portal ID'} />
              </div>

              <div className="modal-actions">
                <button className="modal-btn primary" onClick={saveLeadSourceConnection}><span>✓</span><span>Save &amp; Connect</span></button>
                <button className="modal-btn secondary" onClick={testLeadSourceConnection}><span>🧪</span><span>Test Connection</span></button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Paste Leads Modal */}
      {activeModal === 'paste' && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title"><span>📋</span><span>Paste Leads</span></div>
              <button className="modal-close" onClick={closeModal}>✕</button>
            </div>
            <div className="modal-content">
              <div className="supported-formats">
                <span className="format-tag">email,name,company</span>
                <span className="format-tag">email,first_name,last_name,company,phone</span>
                <span className="format-tag">One email per line</span>
              </div>
              <textarea className="paste-textarea" placeholder="john@company.com,John,Smith,Company Inc,555-1234
sarah@startup.io,Sarah,Jones,Startup.io,555-5678
mike@enterprise.com,Mike,Chen,Enterprise Co,555-9012" value={pasteText} onChange={(e) => setPasteText(e.target.value)}></textarea>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 16 }}>
                <input type="checkbox" />
                <span>First row is header (skip it)</span>
              </label>
              <div className="modal-actions">
                <button className="modal-btn primary" onClick={importPastedLeads}><span>📥</span><span>Import Leads</span></button>
                <button className="modal-btn secondary"><span>👁️</span><span>Preview</span></button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* API Keys Modal */}
      {activeModal === 'apiKeys' && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title"><span>🔑</span><span>API Keys</span></div>
              <button className="modal-close" onClick={closeModal}>✕</button>
            </div>
            <div className="modal-content">
              <div className="api-key-section">
                <label className="modal-label">Live API Key</label>
                <div className="api-key-row">
                  <input type="text" className="api-key-input" value="sk_live_************************" readOnly />
                  <button className="api-key-btn">📋</button>
                  <button className="api-key-btn">🔄</button>
                </div>
              </div>
              <div className="api-key-section">
                <label className="modal-label">Test API Key</label>
                <div className="api-key-row">
                  <input type="text" className="api-key-input" value="sk_test_************************" readOnly />
                  <button className="api-key-btn">📋</button>
                  <button className="api-key-btn">🔄</button>
                </div>
              </div>
              <div className="api-endpoints">
                <div className="api-endpoint"><span className="api-endpoint-method post">POST</span><span>/v1/leads - Create lead</span></div>
                <div className="api-endpoint"><span className="api-endpoint-method get">GET</span><span>/v1/leads - List leads</span></div>
                <div className="api-endpoint"><span className="api-endpoint-method put">PUT</span><span>/v1/leads/:id - Update lead</span></div>
                <div className="api-endpoint"><span className="api-endpoint-method delete">DELETE</span><span>/v1/leads/:id - Delete lead</span></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Make.com Modal */}
      {activeModal === 'make' && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title"><span>⚡</span><span>Make.com Integration</span></div>
              <button className="modal-close" onClick={closeModal}>✕</button>
            </div>
            <div className="modal-content">
              <div className="modal-form-group">
                <label className="modal-label">Webhook URL</label>
                <input type="text" className="modal-input" placeholder="https://hook.make.com/your-webhook-url" value={makeWebhook} onChange={(e) => setMakeWebhook(e.target.value)} />
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 8 }}>Paste your Make.com Custom Webhook URL here</p>
              </div>
              <div className="make-instructions">
                <div className="make-instructions-title">How to get your Webhook URL:</div>
                <ol>
                  <li>Go to Make.com → Create new scenario</li>
                  <li>Add &quot;Webhooks&quot; → &quot;Custom webhook&quot; module</li>
                  <li>Click &quot;Add&quot; to create a new webhook</li>
                  <li>Copy the webhook URL and paste it above</li>
                </ol>
              </div>
              <div className="modal-actions">
                <button className="modal-btn primary" onClick={saveMakeWebhook}><span>✓</span><span>Save Webhook</span></button>
                <button className="modal-btn secondary" onClick={testMakeWebhook}><span>🧪</span><span>Test Connection</span></button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
