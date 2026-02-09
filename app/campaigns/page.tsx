'use client';

// app/campaigns/page.tsx
// Email/SMS/MMS Campaign Builder - COMPLETE React Conversion
// Pixel-perfect match with original HTML
// REMOVED: Sidebar (app has own nav), Lead Sources section (as requested)
// ALL other features preserved exactly

import React, { useState } from 'react';

interface Link {
  type: string;
  url: string;
}

interface Lead {
  id: string;
  name: string;
  email: string;
  company: string;
  source: string;
  score: number;
}

// Medazon Health Patient Interface
interface Patient {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  date_of_birth: string | null;
  city: string | null;
  state: string | null;
  email_opt_in: boolean;
  sms_opt_in: boolean;
  mms_opt_in: boolean;
  tags: string[];
  last_visit: string | null;
  status: string;
}

// Cost structure
interface CostEstimate {
  email: { count: number; unitCost: number; total: string };
  sms: { count: number; unitCost: number; total: string };
  mms: { count: number; unitCost: number; total: string };
  combined: { total: string };
}

// Sample leads data - matches original HTML
const sampleLeads: Lead[] = [
  { id: '1', name: 'John Smith', email: 'john@techcorp.com', company: 'TechCorp Inc', source: 'hubspot', score: 92 },
  { id: '2', name: 'Sarah Johnson', email: 'sarah@startup.io', company: 'Startup.io', source: 'apollo', score: 85 },
  { id: '3', name: 'Mike Chen', email: 'mike@enterprise.com', company: 'Enterprise Co', source: 'leadfeeder', score: 78 },
  { id: '4', name: 'Emily Davis', email: 'emily@startupxyz.com', company: 'StartupXYZ', source: 'csv', score: 71 },
  { id: '5', name: 'Robert Wilson', email: 'robert@enterprise.co', company: 'Enterprise Co', source: 'hubspot', score: 65 },
  { id: '6', name: 'Lisa Anderson', email: 'lisa@digital.agency', company: 'Digital Agency', source: 'zoominfo', score: 58 },
  { id: '7', name: 'David Brown', email: 'david@consulting.biz', company: 'Consulting Biz', source: 'salesforce', score: 52 },
];

export default function CampaignBuilderPage() {
  // State - matches original HTML state
  const [channels, setChannels] = useState({ email: true, sms: false, mms: true });
  const [currentPreview, setCurrentPreview] = useState<'email' | 'sms' | 'mms'>('email');
  const [collapsedPanels, setCollapsedPanels] = useState<Record<string, boolean>>({});
  const [links, setLinks] = useState<Link[]>([{ type: 'Landing Page', url: '' }]);
  
  // Form state
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [smsMessage, setSmsMessage] = useState('');
  const [mmsMessage, setMmsMessage] = useState('');
  const [sendStatus, setSendStatus] = useState('Ready to send');
  const [sendAsImage, setSendAsImage] = useState(false);
  
  // Modal state
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [makeWebhook, setMakeWebhook] = useState('');
  const [leadsSearch, setLeadsSearch] = useState('');
  const [skipHeader, setSkipHeader] = useState(false);

  // Medazon Health Patient State
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatients, setSelectedPatients] = useState<Set<string>>(new Set());
  const [patientStats, setPatientStats] = useState({ total: 0, emailOptIn: 0, smsOptIn: 0, mmsOptIn: 0 });
  const [patientSegment, setPatientSegment] = useState('all');
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [costEstimate, setCostEstimate] = useState<CostEstimate>({
    email: { count: 0, unitCost: 0.001, total: '0.00' },
    sms: { count: 0, unitCost: 0.0075, total: '0.00' },
    mms: { count: 0, unitCost: 0.02, total: '0.00' },
    combined: { total: '0.00' }
  });
  const [recipientSource, setRecipientSource] = useState<'leads' | 'patients'>('leads');

  // Fetch Medazon Health Patients
  const fetchPatients = async (segment?: string) => {
    setLoadingPatients(true);
    try {
      const params = new URLSearchParams();
      if (segment && segment !== 'all') params.append('segment', segment);
      
      const response = await fetch(`/api/campaigns/patients?${params}`);
      const data = await response.json();
      
      if (data.patients) {
        setPatients(data.patients);
        setCostEstimate(data.costs);
      }
      
      // Fetch stats
      const statsResponse = await fetch('/api/campaigns/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_stats' })
      });
      const statsData = await statsResponse.json();
      if (statsData.stats) {
        setPatientStats(statsData.stats);
      }
    } catch (error) {
      console.error('Error fetching patients:', error);
    } finally {
      setLoadingPatients(false);
    }
  };

  // Update cost estimate when channels or recipients change
  const updateCostEstimate = () => {
    const recipientCount = recipientSource === 'patients' 
      ? (selectedPatients.size > 0 ? selectedPatients.size : patients.length)
      : sampleLeads.length;
    
    const emailCount = channels.email ? recipientCount : 0;
    const smsCount = channels.sms ? recipientCount : 0;
    const mmsCount = channels.mms ? recipientCount : 0;

    const emailCost = emailCount * 0.001;
    const smsCost = smsCount * 0.0075;
    const mmsCost = mmsCount * 0.02;

    setCostEstimate({
      email: { count: emailCount, unitCost: 0.001, total: emailCost.toFixed(2) },
      sms: { count: smsCount, unitCost: 0.0075, total: smsCost.toFixed(2) },
      mms: { count: mmsCount, unitCost: 0.02, total: mmsCost.toFixed(2) },
      combined: { total: (emailCost + smsCost + mmsCost).toFixed(2) }
    });
  };

  // Toggle patient selection
  const togglePatientSelection = (patientId: string) => {
    setSelectedPatients(prev => {
      const newSet = new Set(prev);
      if (newSet.has(patientId)) {
        newSet.delete(patientId);
      } else {
        newSet.add(patientId);
      }
      return newSet;
    });
  };

  // Select all patients
  const selectAllPatients = () => {
    if (selectedPatients.size === patients.length) {
      setSelectedPatients(new Set());
    } else {
      setSelectedPatients(new Set(patients.map(p => p.id)));
    }
  };

  // Get initials for avatar
  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  // Panel toggle
  const togglePanel = (panelId: string) => {
    setCollapsedPanels(prev => ({ ...prev, [panelId]: !prev[panelId] }));
  };

  // Channel toggle
  const toggleChannel = (channel: 'email' | 'sms' | 'mms') => {
    setChannels(prev => ({ ...prev, [channel]: !prev[channel] }));
  };

  // Preview switch
  const switchPreview = (type: 'email' | 'sms' | 'mms') => {
    setCurrentPreview(type);
  };

  // Link functions
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

  const testLink = (url: string) => {
    if (!url) {
      alert('Please enter a URL first');
      return;
    }
    alert('Testing link: ' + url + '\n✓ Status: 200 OK\n⏱ Response time: 145ms');
  };

  // Modal functions
  const openModal = (modalId: string) => {
    setActiveModal(modalId);
  };

  const closeModal = () => {
    setActiveModal(null);
  };

  // Upload functions
  const handleBulkUpload = (type: string) => {
    alert('Processing ' + type.toUpperCase() + ' file\n\n✓ 150 rows found\n✓ 142 valid leads\n✓ 8 duplicates skipped');
  };

  const copyApiEndpoint = () => {
    navigator.clipboard.writeText('https://api.dropshippro.io/v1/leads');
    alert('API endpoint copied to clipboard!');
  };

  // AI Generate
  const generateWithAI = (field: string) => {
    if (field === 'subject') {
      setEmailSubject('🚀 [Name], Your exclusive offer inside!');
    } else if (field === 'body') {
      setEmailBody('Hi [Name],\n\nI hope this message finds you well! I wanted to reach out personally because I think [Company] would be a great fit for our latest solution.\n\nWe\'ve helped companies like yours achieve incredible results, and I\'d love to show you how.\n\nWould you have 15 minutes this week for a quick call?\n\nBest regards,\nThe Dropship Pro Team');
    }
  };

  // Campaign functions
  const testCampaign = () => {
    setSendStatus('🔄 Sending test campaign...');
    setTimeout(() => {
      setSendStatus('✓ Test campaign sent successfully!');
    }, 2000);
  };

  const sendCampaign = () => {
    setSendStatus('🔄 Sending to ' + sampleLeads.length + ' recipients...');
    setTimeout(() => {
      setSendStatus('✓ Campaign sent to ' + sampleLeads.length + ' recipients!');
    }, 3000);
  };

  // Paste modal functions
  const previewPastedLeads = () => {
    alert('Found 3 valid leads ready to import');
  };

  const importPastedLeads = () => {
    alert('✓ Successfully imported 3 leads!');
    closeModal();
  };

  // API Keys modal functions
  const copyApiKey = (type: string) => {
    alert((type === 'live' ? 'Live' : 'Test') + ' API key copied to clipboard!');
  };

  const regenerateApiKey = (type: string) => {
    if (confirm('Are you sure you want to regenerate your ' + type + ' API key? This will invalidate the current key.')) {
      alert('API key regenerated!');
    }
  };

  // Make.com modal functions
  const testMakeConnection = () => {
    alert('✓ Webhook connection successful!');
  };

  const saveMakeSettings = () => {
    alert('Make.com settings saved!');
    closeModal();
  };

  // Score helpers
  const getScoreClass = (score: number) => {
    if (score >= 80) return 'hot';
    if (score >= 60) return 'warm';
    return 'cold';
  };

  return (
    <>
      <style>{`
        :root {
          --bg-primary: #0a0a14;
          --bg-secondary: #12121c;
          --bg-tertiary: #1a1a2e;
          --bg-elevated: #202035;
          --bg-hover: #22222e;
          --border-color: rgba(255, 255, 255, 0.08);
          --border-subtle: rgba(255, 255, 255, 0.04);
          --border-medium: #334155;
          --border-strong: #475569;
          --border-active: rgba(99, 102, 241, 0.5);
          --text-primary: #f5f5f7;
          --text-secondary: #a0a0b0;
          --text-muted: #6b6b7b;
          --accent-primary: #6366f1;
          --accent-secondary: #8b5cf6;
          --accent-teal: #14b8a6;
          --accent-cyan: #06b6d4;
          --accent-gradient: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          --teal-gradient: linear-gradient(135deg, #14b8a6 0%, #06b6d4 100%);
          --success: #10b981;
          --warning: #f59e0b;
          --error: #ef4444;
          --info: #3b82f6;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        .app-container { display: flex; min-height: 100vh; }

        .main-content { flex: 1; display: flex; flex-direction: column; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; background: var(--bg-primary); color: var(--text-primary); min-height: 100vh; }

        .campaign-page { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; background: var(--bg-primary); color: var(--text-primary); min-height: 100vh; display: flex; flex-direction: column; }
        .header { background: var(--bg-secondary); border-bottom: 1px solid var(--border-color); padding: 16px 32px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 50; }
        .header-left { display: flex; align-items: center; gap: 16px; }
        .back-btn { width: 40px; height: 40px; border-radius: 10px; border: 1px solid var(--border-color); background: transparent; color: var(--text-secondary); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; transition: all 0.2s; }
        .back-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
        .page-title-section { display: flex; align-items: center; gap: 12px; }
        .page-icon { width: 44px; height: 44px; background: var(--teal-gradient); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; }
        .page-title-text h1 { font-size: 1.25rem; font-weight: 600; margin: 0; }
        .page-title-text p { font-size: 0.8rem; color: var(--text-muted); margin: 0; }
        .header-right { display: flex; gap: 12px; }
        .header-btn { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-radius: 10px; border: 1px solid var(--border-color); background: transparent; color: var(--text-secondary); font-size: 0.875rem; font-weight: 500; cursor: pointer; transition: all 0.2s; }
        .header-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
        .header-btn.primary { background: var(--teal-gradient); border: none; color: white; }
        .header-btn.primary:hover { opacity: 0.9; }
        .campaign-builder { display: grid; grid-template-columns: 1fr 380px; flex: 1; overflow: hidden; }
        .campaign-main { padding: 24px; overflow-y: auto; display: flex; flex-direction: column; gap: 24px; }
        .campaign-preview { background: var(--bg-secondary); border-left: 1px solid var(--border-color); display: flex; flex-direction: column; }
        .panel { background: var(--bg-secondary); border-radius: 16px; border: 1px solid var(--border-color); overflow: hidden; }
        .panel-header { padding: 20px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; transition: background 0.2s; }
        .panel-header:hover { background: var(--bg-hover); }
        .panel-header-left { display: flex; align-items: center; gap: 16px; }
        .panel-icon { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; }
        .panel-icon.leads { background: rgba(99, 102, 241, 0.15); }
        .panel-icon.config { background: rgba(20, 184, 166, 0.15); }
        .panel-title-section h3 { font-size: 1rem; font-weight: 600; margin: 0 0 2px 0; }
        .panel-title-section p { font-size: 0.75rem; color: var(--text-muted); margin: 0; }
        .panel-header-right { display: flex; align-items: center; gap: 16px; }
        .panel-badge { background: var(--accent-primary); color: white; font-size: 0.75rem; font-weight: 600; padding: 4px 12px; border-radius: 20px; }
        .panel-stats { display: flex; gap: 16px; }
        .panel-stat { text-align: center; }
        .panel-stat-value { font-size: 1rem; font-weight: 600; color: var(--accent-teal); }
        .panel-stat-label { font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; }
        .panel-toggle { width: 32px; height: 32px; border-radius: 8px; border: 1px solid var(--border-color); background: transparent; color: var(--text-secondary); display: flex; align-items: center; justify-content: center; transition: all 0.3s; }
        .panel.collapsed .panel-toggle { transform: rotate(-90deg); }
        .panel-content { padding: 0 20px 20px; display: block; }
        .panel.collapsed .panel-content { display: none; }
        .leads-section { margin-bottom: 24px; }
        .leads-section-title { font-size: 0.75rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
        .bulk-upload-row { display: flex; gap: 12px; margin-bottom: 16px; }
        .upload-btn { flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 14px; border-radius: 10px; border: 1px dashed var(--border-color); background: var(--bg-tertiary); color: var(--text-secondary); font-size: 0.8rem; font-weight: 500; cursor: pointer; transition: all 0.2s; }
        .upload-btn:hover { border-color: var(--accent-teal); color: var(--accent-teal); background: rgba(20, 184, 166, 0.1); }
        .upload-btn input { display: none; }
        .api-endpoint-box { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: var(--bg-tertiary); border-radius: 10px; margin-bottom: 16px; }
        .api-endpoint-url { flex: 1; font-family: monospace; font-size: 0.8rem; color: var(--accent-teal); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .api-btn { padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-color); background: transparent; color: var(--text-secondary); font-size: 0.75rem; cursor: pointer; transition: all 0.2s; }
        .api-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
        .links-container { display: flex; flex-direction: column; gap: 10px; }
        .link-row { display: flex; gap: 10px; align-items: center; }
        .link-row select { width: 120px; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-tertiary); color: var(--text-primary); font-size: 0.8rem; }
        .link-row input { flex: 1; padding: 10px 14px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-tertiary); color: var(--text-primary); font-size: 0.8rem; }
        .link-row input::placeholder { color: var(--text-muted); }
        .link-action-btn { width: 36px; height: 36px; border-radius: 8px; border: 1px solid var(--border-color); background: transparent; color: var(--text-secondary); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
        .link-action-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
        .link-action-btn.danger:hover { background: rgba(239, 68, 68, 0.15); color: var(--error); border-color: var(--error); }
        .add-link-btn { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px; border-radius: 10px; border: 1px dashed var(--border-color); background: transparent; color: var(--text-muted); font-size: 0.8rem; cursor: pointer; width: 100%; margin-top: 8px; transition: all 0.2s; }
        .add-link-btn:hover { border-color: var(--border-active); color: var(--text-primary); }
        .webhook-box { display: flex; align-items: center; gap: 12px; padding: 16px; background: var(--bg-tertiary); border-radius: 12px; }
        .webhook-icon { width: 44px; height: 44px; background: rgba(139, 92, 246, 0.15); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; }
        .webhook-info { flex: 1; }
        .webhook-info h4 { font-size: 0.875rem; font-weight: 600; margin: 0 0 2px 0; }
        .webhook-info p { font-size: 0.75rem; color: var(--text-muted); margin: 0; }
        .webhook-btn { padding: 10px 16px; border-radius: 8px; border: 1px solid var(--border-color); background: transparent; color: var(--text-secondary); font-size: 0.8rem; font-weight: 500; cursor: pointer; transition: all 0.2s; }
        .webhook-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
        .view-leads-btn { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 14px; border-radius: 10px; border: 1px solid var(--accent-teal); background: rgba(20, 184, 166, 0.1); color: var(--accent-teal); font-size: 0.875rem; font-weight: 600; cursor: pointer; width: 100%; margin-top: 16px; transition: all 0.2s; }
        .view-leads-btn:hover { background: rgba(20, 184, 166, 0.2); }
        .channel-toggles { display: flex; gap: 12px; margin-bottom: 24px; }
        .channel-toggle { flex: 1; display: flex; align-items: center; justify-content: center; gap: 10px; padding: 14px; border-radius: 12px; border: 2px solid var(--border-color); background: var(--bg-tertiary); color: var(--text-secondary); font-size: 0.875rem; font-weight: 600; cursor: pointer; transition: all 0.2s; }
        .channel-toggle.active { border-color: var(--accent-teal); background: rgba(20, 184, 166, 0.15); color: var(--accent-teal); }
        .channel-toggle input { display: none; }
        .channel-config { background: var(--bg-tertiary); border-radius: 12px; padding: 20px; margin-bottom: 16px; display: none; }
        .channel-config.active { display: block; }
        .channel-config-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid var(--border-color); }
        .channel-config-title { display: flex; align-items: center; gap: 10px; font-size: 0.9rem; font-weight: 600; }
        .channel-status { font-size: 0.75rem; color: var(--success); display: flex; align-items: center; gap: 4px; }
        .config-form-group { margin-bottom: 16px; }
        .config-form-group:last-child { margin-bottom: 0; }
        .config-label { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
        .config-label span { font-size: 0.8rem; font-weight: 500; color: var(--text-secondary); }
        .ai-generate-btn { display: flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 6px; border: none; background: rgba(139, 92, 246, 0.15); color: var(--accent-secondary); font-size: 0.7rem; font-weight: 600; cursor: pointer; transition: all 0.2s; }
        .ai-generate-btn:hover { background: rgba(139, 92, 246, 0.25); }
        .config-input { width: 100%; padding: 12px 14px; border-radius: 10px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); font-size: 0.875rem; }
        .config-input::placeholder { color: var(--text-muted); }
        .config-textarea { width: 100%; padding: 12px 14px; border-radius: 10px; border: 1px solid var(--border-color); background: var(--bg-secondary); color: var(--text-primary); font-size: 0.875rem; resize: vertical; min-height: 100px; font-family: inherit; }
        .config-textarea::placeholder { color: var(--text-muted); }
        .char-count { font-size: 0.7rem; color: var(--text-muted); }
        .image-option { display: flex; align-items: center; gap: 12px; margin-top: 12px; padding: 12px; background: var(--bg-secondary); border-radius: 10px; }
        .image-checkbox { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 0.8rem; color: var(--text-secondary); }
        .image-checkbox input { width: 18px; height: 18px; accent-color: var(--accent-teal); }
        .image-actions { display: flex; gap: 8px; margin-left: auto; }
        .image-action-btn { padding: 8px 12px; border-radius: 8px; border: 1px solid var(--border-color); background: transparent; color: var(--text-secondary); font-size: 0.75rem; cursor: pointer; transition: all 0.2s; }
        .image-action-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
        .preview-header { padding: 20px; border-bottom: 1px solid var(--border-color); }
        .preview-title { font-size: 1rem; font-weight: 600; margin-bottom: 16px; }
        .preview-tabs { display: flex; gap: 8px; }
        .preview-tab { flex: 1; padding: 10px; border-radius: 8px; border: 1px solid var(--border-color); background: transparent; color: var(--text-secondary); font-size: 0.8rem; font-weight: 500; cursor: pointer; transition: all 0.2s; }
        .preview-tab.active { border-color: var(--accent-teal); background: rgba(20, 184, 166, 0.15); color: var(--accent-teal); }
        .preview-content { flex: 1; padding: 24px; display: flex; flex-direction: column; align-items: center; justify-content: center; }
        .email-preview { width: 100%; max-width: 340px; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3); }
        .email-header { display: flex; align-items: center; gap: 12px; padding: 16px; background: #f8f9fa; border-bottom: 1px solid #e9ecef; }
        .email-avatar { width: 40px; height: 40px; background: var(--teal-gradient); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: 600; }
        .email-sender-info { flex: 1; }
        .email-sender-name { font-size: 0.875rem; font-weight: 600; color: #1a1a2e; }
        .email-time { font-size: 0.7rem; color: #6c757d; }
        .email-image-badge { padding: 4px 8px; background: rgba(20, 184, 166, 0.1); color: var(--accent-teal); font-size: 0.65rem; font-weight: 600; border-radius: 4px; }
        .email-body { padding: 20px; }
        .email-subject { font-size: 1rem; font-weight: 600; color: #1a1a2e; margin-bottom: 12px; }
        .email-text { font-size: 0.875rem; color: #495057; line-height: 1.6; white-space: pre-wrap; }
        .email-actions { display: flex; gap: 8px; padding: 12px 20px; background: #f8f9fa; border-top: 1px solid #e9ecef; }
        .email-action-btn { padding: 8px 16px; border-radius: 6px; border: 1px solid #dee2e6; background: white; color: #495057; font-size: 0.75rem; cursor: pointer; }
        .phone-mockup { width: 280px; background: #1a1a2e; border-radius: 36px; padding: 12px; box-shadow: 0 4px 30px rgba(0, 0, 0, 0.4); }
        .phone-screen { background: #0d0d15; border-radius: 28px; overflow: hidden; }
        .phone-status-bar { display: flex; justify-content: space-between; padding: 12px 20px 8px; font-size: 0.7rem; color: white; }
        .phone-message-header { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.1); }
        .phone-back-arrow { color: var(--info); font-size: 1.25rem; }
        .phone-contact-avatar { width: 36px; height: 36px; background: var(--success); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1rem; }
        .phone-contact-name { font-size: 0.9rem; font-weight: 600; color: white; }
        .phone-messages { padding: 16px; min-height: 300px; }
        .message-bubble { max-width: 85%; padding: 12px 16px; background: var(--success); border-radius: 18px 18px 4px 18px; color: white; font-size: 0.875rem; line-height: 1.4; margin-bottom: 8px; }
        .message-bubble.mms { padding: 8px; }
        .message-image-placeholder { width: 100%; height: 120px; background: rgba(255,255,255,0.2); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 2rem; margin-bottom: 8px; }
        .mms-text { padding: 4px 8px; }
        .preview-stats { display: flex; gap: 24px; padding: 16px 24px; background: var(--bg-tertiary); border-top: 1px solid var(--border-color); }
        .preview-stat { text-align: center; }
        .preview-stat-label { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px; }
        .preview-stat-value { font-size: 0.9rem; font-weight: 600; color: var(--text-secondary); }
        .send-actions { padding: 20px; background: var(--bg-tertiary); border-top: 1px solid var(--border-color); }
        .send-buttons { display: flex; gap: 12px; }
        .test-btn { flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 14px; border-radius: 10px; border: 1px solid var(--border-color); background: transparent; color: var(--text-secondary); font-size: 0.875rem; font-weight: 600; cursor: pointer; transition: all 0.2s; }
        .test-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
        .send-btn { flex: 2; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 14px; border-radius: 10px; border: none; background: var(--teal-gradient); color: white; font-size: 0.875rem; font-weight: 600; cursor: pointer; transition: all 0.2s; }
        .send-btn:hover { opacity: 0.9; }
        .send-status { text-align: center; margin-top: 12px; font-size: 0.8rem; color: var(--text-muted); }
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.7); display: flex; align-items: center; justify-content: center; z-index: 1000; opacity: 0; visibility: hidden; transition: all 0.3s; }
        .modal-overlay.active { opacity: 1; visibility: visible; }
        .modal { background: var(--bg-secondary); border-radius: 16px; border: 1px solid var(--border-color); width: 90%; max-width: 600px; max-height: 90vh; overflow: hidden; display: flex; flex-direction: column; transform: translateY(20px); transition: transform 0.3s; }
        .modal-overlay.active .modal { transform: translateY(0); }
        .modal.large { max-width: 900px; }
        .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px; border-bottom: 1px solid var(--border-color); }
        .modal-title { display: flex; align-items: center; gap: 12px; font-size: 1.125rem; font-weight: 600; }
        .modal-badge { background: var(--accent-primary); color: white; font-size: 0.7rem; font-weight: 600; padding: 4px 10px; border-radius: 20px; }
        .modal-search { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 8px; border: 1px solid var(--border-color); background: var(--bg-tertiary); margin-right: 16px; }
        .modal-search input { border: none; background: transparent; color: var(--text-primary); font-size: 0.8rem; outline: none; width: 180px; }
        .modal-search input::placeholder { color: var(--text-muted); }
        .modal-close { width: 36px; height: 36px; border-radius: 8px; border: 1px solid var(--border-color); background: transparent; color: var(--text-secondary); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; transition: all 0.2s; }
        .modal-close:hover { background: var(--bg-hover); color: var(--text-primary); }
        .modal-filters { display: flex; gap: 8px; padding: 16px 24px; border-bottom: 1px solid var(--border-color); flex-wrap: wrap; }
        .filter-btn { padding: 8px 16px; border-radius: 20px; border: 1px solid var(--border-color); background: transparent; color: var(--text-secondary); font-size: 0.8rem; font-weight: 500; cursor: pointer; transition: all 0.2s; }
        .filter-btn.active { border-color: var(--accent-teal); background: rgba(20, 184, 166, 0.15); color: var(--accent-teal); }
        .filter-btn:hover:not(.active) { background: var(--bg-hover); }
        .filter-select { padding: 8px 16px; border-radius: 20px; border: 1px solid var(--border-color); background: var(--bg-tertiary); color: var(--text-primary); font-size: 0.8rem; }
        .modal-body { flex: 1; overflow-y: auto; padding: 0; }
        .modal-content { padding: 24px; }
        .modal-form-group { margin-bottom: 20px; }
        .modal-label { display: block; font-size: 0.8rem; font-weight: 500; color: var(--text-secondary); margin-bottom: 8px; }
        .modal-input { width: 100%; padding: 12px 16px; border-radius: 10px; border: 1px solid var(--border-color); background: var(--bg-tertiary); color: var(--text-primary); font-size: 0.875rem; }
        .modal-input::placeholder { color: var(--text-muted); }
        .modal-actions { display: flex; flex-direction: column; gap: 12px; }
        .modal-btn { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 14px; border-radius: 10px; font-size: 0.875rem; font-weight: 600; cursor: pointer; transition: all 0.2s; }
        .modal-btn.primary { border: none; background: var(--teal-gradient); color: white; }
        .modal-btn.primary:hover { opacity: 0.9; }
        .modal-btn.secondary { border: 1px solid var(--border-color); background: transparent; color: var(--text-secondary); }
        .modal-btn.secondary:hover { background: var(--bg-hover); color: var(--text-primary); }
        .leads-table { width: 100%; border-collapse: collapse; }
        .leads-table th, .leads-table td { padding: 14px 16px; text-align: left; border-bottom: 1px solid var(--border-color); }
        .leads-table th { background: var(--bg-tertiary); font-size: 0.7rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; position: sticky; top: 0; }
        .leads-table td { font-size: 0.8rem; }
        .leads-table tr:hover td { background: var(--bg-hover); }
        .lead-checkbox { width: 18px; height: 18px; accent-color: var(--accent-teal); }
        .lead-name { font-weight: 500; }
        .lead-email { color: var(--text-secondary); }
        .lead-source { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 20px; font-size: 0.7rem; font-weight: 500; }
        .lead-source.hubspot { background: rgba(249, 115, 22, 0.15); color: #f97316; }
        .lead-source.apollo { background: rgba(139, 92, 246, 0.15); color: #8b5cf6; }
        .lead-source.leadfeeder { background: rgba(249, 115, 22, 0.15); color: #f97316; }
        .lead-source.csv { background: rgba(107, 114, 128, 0.15); color: #6b7280; }
        .lead-source.zoominfo { background: rgba(16, 185, 129, 0.15); color: #10b981; }
        .lead-source.salesforce { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
        .lead-score { display: flex; align-items: center; gap: 8px; }
        .score-bar { width: 60px; height: 6px; background: var(--bg-hover); border-radius: 3px; overflow: hidden; }
        .score-fill { height: 100%; border-radius: 3px; }
        .score-fill.hot { background: var(--error); }
        .score-fill.warm { background: var(--warning); }
        .score-fill.cold { background: var(--info); }
        .score-value { font-size: 0.75rem; font-weight: 600; }
        .lead-actions { display: flex; gap: 6px; }
        .lead-action-btn { width: 28px; height: 28px; border-radius: 6px; border: 1px solid var(--border-color); background: transparent; color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 0.8rem; transition: all 0.2s; }
        .lead-action-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
        .modal-pagination { display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; border-top: 1px solid var(--border-color); }
        .pagination-info { font-size: 0.8rem; color: var(--text-muted); }
        .pagination-buttons { display: flex; gap: 4px; }
        .pagination-btn { padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-color); background: transparent; color: var(--text-secondary); font-size: 0.8rem; cursor: pointer; transition: all 0.2s; }
        .pagination-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
        .pagination-btn.active { background: var(--accent-primary); border-color: var(--accent-primary); color: white; }
        .supported-formats { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
        .format-tag { padding: 6px 12px; background: var(--bg-tertiary); border-radius: 6px; font-family: monospace; font-size: 0.75rem; color: var(--text-secondary); }
        .paste-textarea { width: 100%; min-height: 200px; padding: 16px; border-radius: 10px; border: 1px solid var(--border-color); background: var(--bg-tertiary); color: var(--text-primary); font-family: monospace; font-size: 0.8rem; resize: vertical; margin-bottom: 16px; }
        .paste-textarea::placeholder { color: var(--text-muted); }
        .skip-header-option { display: flex; align-items: center; gap: 8px; margin-bottom: 20px; font-size: 0.8rem; color: var(--text-secondary); }
        .paste-preview { background: var(--bg-tertiary); border-radius: 10px; padding: 16px; margin-bottom: 20px; }
        .paste-preview-title { font-size: 0.75rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; margin-bottom: 12px; }
        .paste-preview-item { display: flex; gap: 16px; padding: 8px 0; border-bottom: 1px solid var(--border-color); font-size: 0.8rem; }
        .paste-preview-item:last-child { border-bottom: none; }
        .api-key-section { margin-bottom: 24px; }
        .api-key-row { display: flex; gap: 8px; align-items: center; }
        .api-key-input { flex: 1; padding: 12px 16px; border-radius: 10px; border: 1px solid var(--border-color); background: var(--bg-tertiary); color: var(--text-primary); font-family: monospace; font-size: 0.8rem; }
        .api-key-btn { width: 40px; height: 40px; border-radius: 8px; border: 1px solid var(--border-color); background: transparent; color: var(--text-secondary); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
        .api-key-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
        .api-endpoints { display: flex; flex-direction: column; gap: 8px; margin-top: 24px; }
        .api-endpoint { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: var(--bg-tertiary); border-radius: 8px; font-family: monospace; font-size: 0.8rem; }
        .api-endpoint-method { padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: 600; }
        .api-endpoint-method.post { background: rgba(16, 185, 129, 0.15); color: var(--success); }
        .api-endpoint-method.get { background: rgba(59, 130, 246, 0.15); color: var(--info); }
        .api-endpoint-method.put { background: rgba(245, 158, 11, 0.15); color: var(--warning); }
        .api-endpoint-method.delete { background: rgba(239, 68, 68, 0.15); color: var(--error); }
        .modal-docs-link { display: flex; align-items: center; justify-content: center; gap: 8px; color: var(--accent-primary); font-size: 0.8rem; text-decoration: none; margin-top: 8px; }
        .modal-docs-link:hover { text-decoration: underline; }
        .make-instructions { background: var(--bg-tertiary); border-radius: 10px; padding: 20px; margin-bottom: 24px; }
        .make-instructions-title { font-size: 0.875rem; font-weight: 600; margin-bottom: 12px; }
        .make-instructions ol { padding-left: 20px; font-size: 0.8rem; color: var(--text-secondary); line-height: 1.8; }
        .make-test-section { background: var(--bg-tertiary); border-radius: 10px; padding: 20px; }
        .modal-status {
          padding: 12px;
          border-radius: 8px;
          font-size: 0.8rem;
          text-align: center;
          margin-top: 16px;
        }

        .modal-status.success {
          background: rgba(16, 185, 129, 0.15);
          color: var(--success);
        }

        .modal-status.error {
          background: rgba(239, 68, 68, 0.15);
          color: var(--error);
        }

        .modal-description {
          font-size: 0.875rem;
          color: var(--text-secondary);
          margin-bottom: 24px;
          line-height: 1.6;
        }

        .make-test-result {
          margin-top: 12px;
          padding: 12px;
          border-radius: 8px;
          font-size: 0.8rem;
          text-align: center;
        }

        .make-test-result.success {
          background: rgba(16, 185, 129, 0.15);
          color: var(--success);
        }

        .make-test-result.error {
          background: rgba(239, 68, 68, 0.15);
          color: var(--error);
        }

        .hidden { display: none !important; }

        /* ========== ENHANCED IPHONE PREVIEW STYLES ========== */
        .iphone-frame {
          position: relative;
          width: 300px;
          height: 620px;
          background: linear-gradient(135deg, #1a1a2e 0%, #0d0d15 100%);
          border-radius: 50px;
          padding: 12px;
          box-shadow: 0 25px 80px rgba(0, 0, 0, 0.5), inset 0 0 0 2px rgba(255,255,255,0.1);
        }
        .iphone-notch {
          position: absolute;
          top: 12px;
          left: 50%;
          transform: translateX(-50%);
          width: 120px;
          height: 28px;
          background: #000;
          border-radius: 20px;
          z-index: 10;
        }
        .iphone-notch::before {
          content: '';
          position: absolute;
          top: 50%;
          left: 20px;
          transform: translateY(-50%);
          width: 8px;
          height: 8px;
          background: #1a1a2e;
          border-radius: 50%;
        }
        .iphone-screen {
          width: 100%;
          height: 100%;
          background: #000;
          border-radius: 40px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .iphone-status-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px 24px 8px;
          font-size: 14px;
          font-weight: 600;
          color: white;
        }
        .iphone-status-bar .time { font-weight: 600; }
        .iphone-status-bar .icons { display: flex; gap: 4px; align-items: center; }
        .iphone-status-bar .icons span { font-size: 12px; }
        
        .iphone-header {
          display: flex;
          align-items: center;
          padding: 8px 16px 12px;
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .iphone-back { color: #007AFF; font-size: 24px; margin-right: 8px; }
        .iphone-avatar {
          width: 40px;
          height: 40px;
          background: var(--teal-gradient);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          margin-right: 12px;
        }
        .iphone-contact-info { flex: 1; }
        .iphone-contact-name { font-size: 16px; font-weight: 600; color: white; }
        .iphone-contact-status { font-size: 12px; color: #8e8e93; }
        
        .iphone-messages {
          flex: 1;
          padding: 16px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .iphone-bubble {
          max-width: 80%;
          padding: 10px 14px;
          border-radius: 18px;
          font-size: 15px;
          line-height: 1.4;
          word-wrap: break-word;
        }
        .iphone-bubble.sent {
          align-self: flex-end;
          background: #007AFF;
          color: white;
          border-bottom-right-radius: 4px;
        }
        .iphone-bubble.received {
          align-self: flex-start;
          background: #3a3a3c;
          color: white;
          border-bottom-left-radius: 4px;
        }
        .iphone-bubble.mms-bubble {
          padding: 4px;
          background: #007AFF;
        }
        .iphone-bubble.mms-bubble img,
        .iphone-bubble.mms-bubble .mms-placeholder {
          width: 200px;
          height: 150px;
          border-radius: 14px;
          object-fit: cover;
          background: rgba(255,255,255,0.1);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 40px;
        }
        .iphone-bubble.mms-bubble .mms-caption {
          padding: 8px 10px 4px;
          font-size: 15px;
        }
        
        .iphone-input-bar {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px 24px;
          background: #1c1c1e;
        }
        .iphone-input-bar input {
          flex: 1;
          padding: 10px 16px;
          border-radius: 20px;
          border: none;
          background: #3a3a3c;
          color: white;
          font-size: 15px;
        }
        .iphone-input-bar input::placeholder { color: #8e8e93; }
        .iphone-send-btn {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: #007AFF;
          border: none;
          color: white;
          font-size: 16px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        /* Cost Estimation Panel */
        .cost-panel {
          background: var(--bg-tertiary);
          border-radius: 12px;
          padding: 16px;
          margin-top: 16px;
        }
        .cost-panel-title {
          font-size: 0.875rem;
          font-weight: 600;
          margin-bottom: 12px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .cost-breakdown {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .cost-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 12px;
          background: var(--bg-secondary);
          border-radius: 8px;
          font-size: 0.8rem;
        }
        .cost-row .channel-name {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .cost-row .channel-count {
          color: var(--text-muted);
          font-size: 0.75rem;
        }
        .cost-row .channel-cost {
          font-weight: 600;
          color: var(--accent-teal);
        }
        .cost-total {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px;
          background: var(--teal-gradient);
          border-radius: 8px;
          margin-top: 8px;
          color: white;
        }
        .cost-total .label { font-weight: 500; }
        .cost-total .amount { font-size: 1.25rem; font-weight: 700; }

        /* Patient Source Section */
        .patient-source-section {
          background: var(--bg-tertiary);
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 16px;
        }
        .patient-source-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }
        .patient-source-title {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 0.875rem;
          font-weight: 600;
        }
        .patient-source-title .icon {
          width: 36px;
          height: 36px;
          background: rgba(20, 184, 166, 0.15);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.1rem;
        }
        .patient-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-bottom: 16px;
        }
        .patient-stat-card {
          background: var(--bg-secondary);
          border-radius: 10px;
          padding: 12px;
          text-align: center;
        }
        .patient-stat-value {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--accent-teal);
        }
        .patient-stat-label {
          font-size: 0.7rem;
          color: var(--text-muted);
          text-transform: uppercase;
          margin-top: 4px;
        }
        .patient-filters {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .patient-filter-btn {
          padding: 8px 14px;
          border-radius: 20px;
          border: 1px solid var(--border-color);
          background: transparent;
          color: var(--text-secondary);
          font-size: 0.75rem;
          cursor: pointer;
          transition: all 0.2s;
        }
        .patient-filter-btn:hover {
          background: var(--bg-hover);
        }
        .patient-filter-btn.active {
          background: var(--accent-teal);
          border-color: var(--accent-teal);
          color: white;
        }
        .connect-medazon-btn {
          width: 100%;
          padding: 14px;
          border-radius: 10px;
          border: 2px dashed var(--accent-teal);
          background: rgba(20, 184, 166, 0.1);
          color: var(--accent-teal);
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 0.2s;
        }
        .connect-medazon-btn:hover {
          background: rgba(20, 184, 166, 0.2);
        }

        /* Patients Modal */
        .patients-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 12px;
          padding: 16px;
        }
        .patient-card {
          background: var(--bg-tertiary);
          border-radius: 12px;
          padding: 16px;
          border: 1px solid var(--border-color);
          transition: all 0.2s;
        }
        .patient-card:hover {
          border-color: var(--accent-teal);
        }
        .patient-card.selected {
          border-color: var(--accent-teal);
          background: rgba(20, 184, 166, 0.1);
        }
        .patient-card-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 12px;
        }
        .patient-avatar {
          width: 44px;
          height: 44px;
          background: var(--accent-gradient);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 600;
          font-size: 1rem;
        }
        .patient-name {
          font-weight: 600;
          font-size: 0.9rem;
        }
        .patient-email {
          font-size: 0.75rem;
          color: var(--text-muted);
        }
        .patient-contact-info {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 12px;
        }
        .patient-contact-row {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.8rem;
          color: var(--text-secondary);
        }
        .patient-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .patient-tag {
          padding: 4px 10px;
          background: var(--bg-secondary);
          border-radius: 12px;
          font-size: 0.7rem;
          color: var(--text-muted);
        }
        .patient-opt-ins {
          display: flex;
          gap: 8px;
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid var(--border-color);
        }
        .opt-in-badge {
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 0.7rem;
          font-weight: 500;
        }
        .opt-in-badge.active {
          background: rgba(16, 185, 129, 0.15);
          color: var(--success);
        }
        .opt-in-badge.inactive {
          background: rgba(107, 114, 128, 0.15);
          color: #6b7280;
        }
        @media (max-width: 1200px) { .campaign-builder { grid-template-columns: 1fr 340px; } }
        @media (max-width: 992px) { .campaign-builder { grid-template-columns: 1fr; } .campaign-preview { display: none; } }
        @media (max-width: 768px) { .channel-toggles { flex-direction: column; } .bulk-upload-row { flex-direction: column; } }
      `}</style>

      <div className="campaign-page">
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
            <button className="header-btn primary" onClick={() => setSendStatus('✓ Campaign scheduled!')}><span>📅</span><span>Schedule</span></button>
          </div>
        </header>

        <div className="campaign-builder">
          <div className="campaign-main">
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
                  <span className="panel-badge">1,247 leads</span>
                  <button className="panel-toggle">▼</button>
                </div>
              </div>
              <div className="panel-content">
                {/* Medazon Health Patient Source */}
                <div className="patient-source-section">
                  <div className="patient-source-header">
                    <div className="patient-source-title">
                      <div className="icon">🏥</div>
                      <div>
                        <div>Medazon Health Patients</div>
                        <div style={{fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 'normal'}}>Connect to patient database for campaigns</div>
                      </div>
                    </div>
                    <button 
                      className={`patient-filter-btn ${recipientSource === 'patients' ? 'active' : ''}`}
                      onClick={() => {
                        setRecipientSource('patients');
                        fetchPatients();
                      }}
                    >
                      {recipientSource === 'patients' ? '✓ Connected' : 'Connect'}
                    </button>
                  </div>
                  
                  {recipientSource === 'patients' && (
                    <>
                      <div className="patient-stats">
                        <div className="patient-stat-card">
                          <div className="patient-stat-value">{patientStats.total}</div>
                          <div className="patient-stat-label">Total Patients</div>
                        </div>
                        <div className="patient-stat-card">
                          <div className="patient-stat-value">{patientStats.emailOptIn}</div>
                          <div className="patient-stat-label">Email Opt-In</div>
                        </div>
                        <div className="patient-stat-card">
                          <div className="patient-stat-value">{patientStats.smsOptIn}</div>
                          <div className="patient-stat-label">SMS Opt-In</div>
                        </div>
                        <div className="patient-stat-card">
                          <div className="patient-stat-value">{patientStats.mmsOptIn}</div>
                          <div className="patient-stat-label">MMS Opt-In</div>
                        </div>
                      </div>
                      
                      <div className="patient-filters">
                        <button 
                          className={`patient-filter-btn ${patientSegment === 'all' ? 'active' : ''}`}
                          onClick={() => { setPatientSegment('all'); fetchPatients(); }}
                        >All Patients</button>
                        <button 
                          className={`patient-filter-btn ${patientSegment === 'telehealth' ? 'active' : ''}`}
                          onClick={() => { setPatientSegment('telehealth'); fetchPatients('telehealth'); }}
                        >Telehealth</button>
                        <button 
                          className={`patient-filter-btn ${patientSegment === 'new-patient' ? 'active' : ''}`}
                          onClick={() => { setPatientSegment('new-patient'); fetchPatients('new-patient'); }}
                        >New Patients</button>
                        <button 
                          className={`patient-filter-btn ${patientSegment === 'follow-up' ? 'active' : ''}`}
                          onClick={() => { setPatientSegment('follow-up'); fetchPatients('follow-up'); }}
                        >Follow-Up</button>
                        <button 
                          className={`patient-filter-btn ${patientSegment === 'senior' ? 'active' : ''}`}
                          onClick={() => { setPatientSegment('senior'); fetchPatients('senior'); }}
                        >Seniors (65+)</button>
                      </div>
                      
                      <button 
                        className="view-leads-btn" 
                        style={{marginTop: '16px'}}
                        onClick={() => openModal('patientsModal')}
                      >
                        <span>👁️</span>
                        <span>View & Select Patients ({patients.length})</span>
                      </button>
                    </>
                  )}
                  
                  {recipientSource !== 'patients' && (
                    <button 
                      className="connect-medazon-btn"
                      onClick={() => {
                        setRecipientSource('patients');
                        fetchPatients();
                      }}
                    >
                      <span>🔗</span>
                      <span>Connect Medazon Health Patient Database</span>
                    </button>
                  )}
                </div>

                {/* Divider */}
                <div style={{borderTop: '1px solid var(--border-color)', margin: '16px 0'}}></div>

                <div className="leads-section">
                  <div className="leads-section-title"><span>📤</span><span>Bulk Upload</span></div>
                  <div className="bulk-upload-row">
                    <label className="upload-btn"><span>📄</span><span>Upload CSV</span><input type="file" accept=".csv" onChange={() => handleBulkUpload('csv')} /></label>
                    <label className="upload-btn"><span>📊</span><span>Upload Excel</span><input type="file" accept=".xlsx,.xls" onChange={() => handleBulkUpload('excel')} /></label>
                    <button className="upload-btn" onClick={() => openModal('pasteModal')}><span>📋</span><span>Paste Import</span></button>
                  </div>
                </div>
                <div className="leads-section">
                  <div className="leads-section-title"><span>🔗</span><span>API Endpoint</span></div>
                  <div className="api-endpoint-box">
                    <span className="api-endpoint-url">https://api.dropshippro.io/v1/leads</span>
                    <button className="api-btn" onClick={copyApiEndpoint}>📋 Copy</button>
                    <button className="api-btn" onClick={() => openModal('apiKeysModal')}>🔑 Keys</button>
                  </div>
                </div>
                <div className="leads-section">
                  <div className="leads-section-title"><span>🔗</span><span>Links &amp; Tracking URLs</span></div>
                  <div className="links-container">
                    {links.map((link, index) => (
                      <div key={index} className="link-row">
                        <select value={link.type} onChange={(e) => updateLink(index, 'type', e.target.value)}>
                          <option>Landing Page</option><option>CTA</option><option>Offer</option><option>Tracking</option>
                        </select>
                        <input type="text" placeholder="https://..." value={link.url} onChange={(e) => updateLink(index, 'url', e.target.value)} />
                        <button className="link-action-btn" onClick={() => testLink(link.url)}>🔗</button>
                        <button className="link-action-btn danger" onClick={() => removeLink(index)}>✕</button>
                      </div>
                    ))}
                  </div>
                  <button className="add-link-btn" onClick={addLinkField}><span>➕</span><span>Add Link</span></button>
                </div>
                <div className="leads-section">
                  <div className="leads-section-title"><span>⚡</span><span>Webhook Integration</span></div>
                  <div className="webhook-box">
                    <div className="webhook-icon">⚡</div>
                    <div className="webhook-info"><h4>Make.com Integration</h4><p>Connect to automate workflows with incoming leads</p></div>
                    <button className="webhook-btn" onClick={() => openModal('makeModal')}>Configure</button>
                  </div>
                </div>
                <button className="view-leads-btn" onClick={() => openModal('leadsModal')}><span>👁️</span><span>View All 1,247 Leads</span></button>
              </div>
            </div>

            <div className={`panel ${collapsedPanels['configPanel'] ? 'collapsed' : ''}`}>
              <div className="panel-header" onClick={() => togglePanel('configPanel')}>
                <div className="panel-header-left">
                  <div className="panel-icon config">⚙️</div>
                  <div className="panel-title-section">
                    <h3>Campaign Configuration</h3>
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
                <div className="channel-toggles">
                  <label className={`channel-toggle ${channels.email ? 'active' : ''}`} onClick={() => toggleChannel('email')}><input type="checkbox" checked={channels.email} readOnly /><span>📧</span><span>Email</span></label>
                  <label className={`channel-toggle ${channels.sms ? 'active' : ''}`} onClick={() => toggleChannel('sms')}><input type="checkbox" checked={channels.sms} readOnly /><span>💬</span><span>SMS</span></label>
                  <label className={`channel-toggle ${channels.mms ? 'active' : ''}`} onClick={() => toggleChannel('mms')}><input type="checkbox" checked={channels.mms} readOnly /><span>🖼️</span><span>MMS</span></label>
                </div>
                <div className={`channel-config ${channels.email ? 'active' : ''}`}>
                  <div className="channel-config-header">
                    <div className="channel-config-title"><span>📧</span><span>Email Configuration</span></div>
                    <div className="channel-status"><span>●</span><span>Active</span></div>
                  </div>
                  <div className="config-form-group">
                    <div className="config-label"><span>Subject Line</span><button className="ai-generate-btn" onClick={() => generateWithAI('subject')}><span>✨</span><span>AI Generate</span></button></div>
                    <input type="text" className="config-input" placeholder="Enter subject line... Use [Name] for personalization" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} />
                  </div>
                  <div className="config-form-group">
                    <div className="config-label"><span>Email Body</span><button className="ai-generate-btn" onClick={() => generateWithAI('body')}><span>✨</span><span>AI Generate</span></button></div>
                    <textarea className="config-textarea" placeholder="Write your email content here... Use [Name], [Company] for personalization" value={emailBody} onChange={(e) => setEmailBody(e.target.value)} />
                  </div>
                  <div className="image-option">
                    <label className="image-checkbox"><input type="checkbox" checked={sendAsImage} onChange={(e) => setSendAsImage(e.target.checked)} /><span>📷 Send as Image</span></label>
                    <div className="image-actions"><button className="image-action-btn">Select Brand Image</button><input type="text" className="config-input" style={{width:'200px'}} placeholder="Or Image URL" /></div>
                  </div>
                  <div className="config-form-group" style={{marginTop:'16px'}}><div className="config-label"><span>🔗 Landing Page</span></div><input type="text" className="config-input" placeholder="https://yoursite.com/landing" /></div>
                </div>
                <div className={`channel-config ${channels.sms ? 'active' : ''}`}>
                  <div className="channel-config-header">
                    <div className="channel-config-title"><span>💬</span><span>SMS Configuration</span></div>
                    <div className="channel-status"><span>●</span><span>Active</span></div>
                  </div>
                  <div className="config-form-group">
                    <div className="config-label"><span>Message</span><span className="char-count"><span>{smsMessage.length}</span>/160</span></div>
                    <textarea className="config-textarea" maxLength={160} placeholder="Enter your SMS message..." value={smsMessage} onChange={(e) => setSmsMessage(e.target.value)} />
                  </div>
                </div>
                <div className={`channel-config ${channels.mms ? 'active' : ''}`}>
                  <div className="channel-config-header">
                    <div className="channel-config-title"><span>🖼️</span><span>MMS Configuration</span></div>
                    <div className="channel-status"><span>●</span><span>Active</span></div>
                  </div>
                  <div className="config-form-group">
                    <div className="config-label"><span>Message</span><span className="char-count"><span>{mmsMessage.length}</span>/160</span></div>
                    <textarea className="config-textarea" maxLength={160} placeholder="Enter your MMS message..." value={mmsMessage} onChange={(e) => setMmsMessage(e.target.value)} />
                  </div>
                  <div className="config-form-group">
                    <div className="config-label"><span>🖼️ Media</span></div>
                    <div style={{display:'flex',gap:'12px'}}><button className="image-action-btn" style={{flex:1,padding:'12px'}}>🖼️ Select Image</button><input type="text" className="config-input" style={{flex:2}} placeholder="Or paste image URL" /></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="campaign-preview">
            <div className="preview-header">
              <h3 className="preview-title">📱 Live Preview</h3>
              <div className="preview-tabs">
                <button className={`preview-tab ${currentPreview === 'email' ? 'active' : ''}`} onClick={() => switchPreview('email')}>Email</button>
                <button className={`preview-tab ${currentPreview === 'sms' ? 'active' : ''}`} onClick={() => switchPreview('sms')}>SMS</button>
                <button className={`preview-tab ${currentPreview === 'mms' ? 'active' : ''}`} onClick={() => switchPreview('mms')}>MMS</button>
              </div>
            </div>
            <div className="preview-content">
              {/* Email Preview */}
              {currentPreview === 'email' && (
                <div className="email-preview">
                  <div className="email-header">
                    <div className="email-avatar">M</div>
                    <div className="email-sender-info">
                      <div className="email-sender-name">Medazon Health</div>
                      <div className="email-time">Just now</div>
                    </div>
                    {sendAsImage && <span className="email-image-badge">🖼️ Image</span>}
                  </div>
                  <div className="email-body">
                    <div className="email-subject">{emailSubject || 'Your subject line here'}</div>
                    <div className="email-text">{emailBody || 'Your email body will appear here as you type.\n\nUse personalization variables like [Name] to customize your message for each patient.'}</div>
                  </div>
                  <div className="email-actions">
                    <button className="email-action-btn">Reply</button>
                    <button className="email-action-btn">Forward</button>
                  </div>
                </div>
              )}
              
              {/* Enhanced iPhone SMS Preview */}
              {currentPreview === 'sms' && (
                <div className="iphone-frame">
                  <div className="iphone-notch"></div>
                  <div className="iphone-screen">
                    <div className="iphone-status-bar">
                      <span className="time">9:41</span>
                      <span className="icons">
                        <span>📶</span>
                        <span>📡</span>
                        <span>🔋</span>
                      </span>
                    </div>
                    <div className="iphone-header">
                      <span className="iphone-back">‹</span>
                      <div className="iphone-avatar">🏥</div>
                      <div className="iphone-contact-info">
                        <div className="iphone-contact-name">Medazon Health</div>
                        <div className="iphone-contact-status">iMessage</div>
                      </div>
                    </div>
                    <div className="iphone-messages">
                      <div className="iphone-bubble sent">
                        {smsMessage || 'Hi [Name], this is a reminder about your upcoming appointment at Medazon Health. Reply CONFIRM to confirm or call us to reschedule.'}
                      </div>
                    </div>
                    <div className="iphone-input-bar">
                      <input type="text" placeholder="Text Message" readOnly />
                      <button className="iphone-send-btn">↑</button>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Enhanced iPhone MMS Preview */}
              {currentPreview === 'mms' && (
                <div className="iphone-frame">
                  <div className="iphone-notch"></div>
                  <div className="iphone-screen">
                    <div className="iphone-status-bar">
                      <span className="time">9:41</span>
                      <span className="icons">
                        <span>📶</span>
                        <span>📡</span>
                        <span>🔋</span>
                      </span>
                    </div>
                    <div className="iphone-header">
                      <span className="iphone-back">‹</span>
                      <div className="iphone-avatar">🏥</div>
                      <div className="iphone-contact-info">
                        <div className="iphone-contact-name">Medazon Health</div>
                        <div className="iphone-contact-status">MMS</div>
                      </div>
                    </div>
                    <div className="iphone-messages">
                      <div className="iphone-bubble mms-bubble sent">
                        <div className="mms-placeholder">🖼️</div>
                        <div className="mms-caption">
                          {mmsMessage || 'Hi [Name]! Check out our latest telehealth services. Book your virtual appointment today!'}
                        </div>
                      </div>
                    </div>
                    <div className="iphone-input-bar">
                      <input type="text" placeholder="Text Message" readOnly />
                      <button className="iphone-send-btn">↑</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {/* Cost Estimation Panel */}
            <div className="cost-panel">
              <div className="cost-panel-title">
                <span>💰</span>
                <span>Estimated Campaign Cost</span>
              </div>
              <div className="cost-breakdown">
                {channels.email && (
                  <div className="cost-row">
                    <div className="channel-name">
                      <span>📧</span>
                      <span>Email</span>
                      <span className="channel-count">({costEstimate.email.count} recipients × ${costEstimate.email.unitCost})</span>
                    </div>
                    <span className="channel-cost">${costEstimate.email.total}</span>
                  </div>
                )}
                {channels.sms && (
                  <div className="cost-row">
                    <div className="channel-name">
                      <span>💬</span>
                      <span>SMS</span>
                      <span className="channel-count">({costEstimate.sms.count} recipients × ${costEstimate.sms.unitCost})</span>
                    </div>
                    <span className="channel-cost">${costEstimate.sms.total}</span>
                  </div>
                )}
                {channels.mms && (
                  <div className="cost-row">
                    <div className="channel-name">
                      <span>🖼️</span>
                      <span>MMS</span>
                      <span className="channel-count">({costEstimate.mms.count} recipients × ${costEstimate.mms.unitCost})</span>
                    </div>
                    <span className="channel-cost">${costEstimate.mms.total}</span>
                  </div>
                )}
                <div className="cost-total">
                  <span className="label">Total Estimated Cost</span>
                  <span className="amount">${costEstimate.combined.total}</span>
                </div>
              </div>
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
                <button className="send-btn" onClick={sendCampaign}>
                  <span>▶</span>
                  <span>Send to {recipientSource === 'patients' ? (selectedPatients.size > 0 ? selectedPatients.size : patients.length) : sampleLeads.length} Recipients</span>
                </button>
              </div>
              <div className="send-status">{sendStatus}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Patients Modal */}
      <div className={`modal-overlay ${activeModal === 'patientsModal' ? 'active' : ''}`} onClick={closeModal}>
        <div className="modal large" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div className="modal-title">
              <span>🏥</span>
              <span>Medazon Health Patients</span>
              <span className="modal-badge">{patients.length} patients</span>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
              <button 
                className="modal-btn secondary" 
                style={{padding:'8px 16px'}}
                onClick={selectAllPatients}
              >
                {selectedPatients.size === patients.length ? 'Deselect All' : 'Select All'}
              </button>
              <button className="modal-close" onClick={closeModal}>✕</button>
            </div>
          </div>
          <div className="modal-filters">
            <button className={`filter-btn ${patientSegment === 'all' ? 'active' : ''}`} onClick={() => { setPatientSegment('all'); fetchPatients(); }}>All</button>
            <button className={`filter-btn ${patientSegment === 'telehealth' ? 'active' : ''}`} onClick={() => { setPatientSegment('telehealth'); fetchPatients('telehealth'); }}>Telehealth</button>
            <button className={`filter-btn ${patientSegment === 'new-patient' ? 'active' : ''}`} onClick={() => { setPatientSegment('new-patient'); fetchPatients('new-patient'); }}>New Patients</button>
            <button className={`filter-btn ${patientSegment === 'follow-up' ? 'active' : ''}`} onClick={() => { setPatientSegment('follow-up'); fetchPatients('follow-up'); }}>Follow-Up</button>
            <span style={{marginLeft:'auto',fontSize:'0.8rem',color:'var(--text-muted)'}}>
              {selectedPatients.size} selected
            </span>
          </div>
          <div className="modal-body" style={{padding:'16px'}}>
            {loadingPatients ? (
              <div style={{textAlign:'center',padding:'40px',color:'var(--text-muted)'}}>
                <div style={{fontSize:'2rem',marginBottom:'12px'}}>⏳</div>
                Loading patients...
              </div>
            ) : (
              <div className="patients-grid">
                {patients.map((patient) => (
                  <div 
                    key={patient.id} 
                    className={`patient-card ${selectedPatients.has(patient.id) ? 'selected' : ''}`}
                    onClick={() => togglePatientSelection(patient.id)}
                    style={{cursor:'pointer'}}
                  >
                    <div className="patient-card-header">
                      <div className="patient-avatar">
                        {getInitials(patient.first_name, patient.last_name)}
                      </div>
                      <div>
                        <div className="patient-name">{patient.first_name} {patient.last_name}</div>
                        <div className="patient-email">{patient.email}</div>
                      </div>
                      {selectedPatients.has(patient.id) && (
                        <span style={{marginLeft:'auto',color:'var(--accent-teal)',fontSize:'1.25rem'}}>✓</span>
                      )}
                    </div>
                    <div className="patient-contact-info">
                      {patient.phone && (
                        <div className="patient-contact-row">
                          <span>📱</span>
                          <span>{patient.phone}</span>
                        </div>
                      )}
                      {patient.city && patient.state && (
                        <div className="patient-contact-row">
                          <span>📍</span>
                          <span>{patient.city}, {patient.state}</span>
                        </div>
                      )}
                      {patient.last_visit && (
                        <div className="patient-contact-row">
                          <span>📅</span>
                          <span>Last visit: {new Date(patient.last_visit).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>
                    {patient.tags && patient.tags.length > 0 && (
                      <div className="patient-tags">
                        {patient.tags.slice(0, 3).map((tag, idx) => (
                          <span key={idx} className="patient-tag">{tag}</span>
                        ))}
                      </div>
                    )}
                    <div className="patient-opt-ins">
                      <span className={`opt-in-badge ${patient.email_opt_in ? 'active' : 'inactive'}`}>
                        📧 {patient.email_opt_in ? 'Email' : 'No Email'}
                      </span>
                      <span className={`opt-in-badge ${patient.sms_opt_in ? 'active' : 'inactive'}`}>
                        💬 {patient.sms_opt_in ? 'SMS' : 'No SMS'}
                      </span>
                      <span className={`opt-in-badge ${patient.mms_opt_in ? 'active' : 'inactive'}`}>
                        🖼️ {patient.mms_opt_in ? 'MMS' : 'No MMS'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="modal-pagination">
            <div className="pagination-info">
              {selectedPatients.size > 0 
                ? `${selectedPatients.size} patients selected for campaign`
                : `${patients.length} patients available`
              }
            </div>
            <button 
              className="modal-btn primary" 
              style={{padding:'10px 24px'}}
              onClick={() => {
                updateCostEstimate();
                closeModal();
              }}
            >
              <span>✓</span>
              <span>Confirm Selection</span>
            </button>
          </div>
        </div>
      </div>

      {/* Leads Manager Modal */}
      <div className={`modal-overlay ${activeModal === 'leadsModal' ? 'active' : ''}`} onClick={closeModal}>
        <div className="modal large" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div className="modal-title"><span>👥</span><span>Leads Manager</span><span className="modal-badge">1,247 leads</span></div>
            <div style={{display:'flex',alignItems:'center'}}>
              <div className="modal-search"><span>🔍</span><input type="text" placeholder="Search leads..." value={leadsSearch} onChange={(e) => setLeadsSearch(e.target.value)} /></div>
              <button className="modal-close" onClick={closeModal}>✕</button>
            </div>
          </div>
          <div className="modal-filters">
            <button className="filter-btn active">All</button>
            <button className="filter-btn">Hot (234)</button>
            <button className="filter-btn">Warm (567)</button>
            <button className="filter-btn">Cold (446)</button>
            <select className="filter-select"><option>Source: All</option><option>HubSpot</option><option>Leadfeeder</option><option>Apollo</option><option>CSV Import</option></select>
          </div>
          <div className="modal-body">
            <table className="leads-table">
              <thead><tr><th><input type="checkbox" className="lead-checkbox" /></th><th>Name</th><th>Email</th><th>Company</th><th>Source</th><th>Score</th><th>Actions</th></tr></thead>
              <tbody>
                {sampleLeads.map((lead) => (
                  <tr key={lead.id}>
                    <td><input type="checkbox" className="lead-checkbox" /></td>
                    <td className="lead-name">{lead.name}</td>
                    <td className="lead-email">{lead.email}</td>
                    <td>{lead.company}</td>
                    <td><span className={`lead-source ${lead.source}`}>{lead.source}</span></td>
                    <td><div className="lead-score"><div className="score-bar"><div className={`score-fill ${getScoreClass(lead.score)}`} style={{width:`${lead.score}%`}}></div></div><span className="score-value">{lead.score}</span></div></td>
                    <td><div className="lead-actions"><button className="lead-action-btn">✏️</button><button className="lead-action-btn">📧</button><button className="lead-action-btn">🗑️</button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="modal-pagination">
            <div className="pagination-info">Showing 1-50 of 1,247</div>
            <div className="pagination-buttons">
              <button className="pagination-btn">← Prev</button>
              <button className="pagination-btn active">1</button>
              <button className="pagination-btn">2</button>
              <button className="pagination-btn">3</button>
              <button className="pagination-btn">...</button>
              <button className="pagination-btn">25</button>
              <button className="pagination-btn">Next →</button>
            </div>
          </div>
        </div>
      </div>

      {/* Paste Leads Modal */}
      <div className={`modal-overlay ${activeModal === 'pasteModal' ? 'active' : ''}`} onClick={closeModal}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div className="modal-title"><span>📋</span><span>Paste Leads</span></div>
            <button className="modal-close" onClick={closeModal}>✕</button>
          </div>
          <div className="modal-content">
            <div className="supported-formats">
              <span className="format-tag">email,name,company</span>
              <span className="format-tag">email,first_name,last_name,company</span>
              <span className="format-tag">One email per line</span>
            </div>
            <textarea className="paste-textarea" placeholder="john@example.com,John,Smith,Acme Inc&#10;jane@company.com,Jane,Doe,Tech Corp&#10;mike@business.com,Mike,Chen,Enterprise Co" value={pasteText} onChange={(e) => setPasteText(e.target.value)} />
            <div className="skip-header-option"><input type="checkbox" checked={skipHeader} onChange={(e) => setSkipHeader(e.target.checked)} /><span>First row is header (skip it)</span></div>
            <div className="paste-preview">
              <div className="paste-preview-title">Preview</div>
              <div className="paste-preview-item"><span>john@example.com</span><span>John Smith</span><span>Acme Inc</span></div>
              <div className="paste-preview-item"><span>jane@company.com</span><span>Jane Doe</span><span>Tech Corp</span></div>
              <div className="paste-preview-item"><span>mike@business.com</span><span>Mike Chen</span><span>Enterprise Co</span></div>
            </div>
            <div className="modal-actions">
              <button className="modal-btn primary" onClick={importPastedLeads}><span>📥</span><span>Import Leads</span></button>
              <button className="modal-btn secondary" onClick={previewPastedLeads}><span>👁️</span><span>Preview</span></button>
            </div>
          </div>
        </div>
      </div>

      {/* API Keys Modal */}
      <div className={`modal-overlay ${activeModal === 'apiKeysModal' ? 'active' : ''}`} onClick={closeModal}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div className="modal-title"><span>🔑</span><span>API Keys</span></div>
            <button className="modal-close" onClick={closeModal}>✕</button>
          </div>
          <div className="modal-content">
            <div className="api-key-section">
              <label className="modal-label">Live API Key</label>
              <div className="api-key-row">
                <input type="text" className="api-key-input" value="sk_live_************************" readOnly />
                <button className="api-key-btn" onClick={() => copyApiKey('live')}>📋</button>
                <button className="api-key-btn" onClick={() => regenerateApiKey('live')}>🔄</button>
              </div>
            </div>
            <div className="api-key-section">
              <label className="modal-label">Test API Key</label>
              <div className="api-key-row">
                <input type="text" className="api-key-input" value="sk_test_************************" readOnly />
                <button className="api-key-btn" onClick={() => copyApiKey('test')}>📋</button>
                <button className="api-key-btn" onClick={() => regenerateApiKey('test')}>🔄</button>
              </div>
            </div>
            <div className="api-endpoints">
              <div className="api-endpoint"><span className="api-endpoint-method post">POST</span><span>/v1/leads - Create lead</span></div>
              <div className="api-endpoint"><span className="api-endpoint-method get">GET</span><span>/v1/leads - List leads</span></div>
              <div className="api-endpoint"><span className="api-endpoint-method put">PUT</span><span>/v1/leads/:id - Update lead</span></div>
              <div className="api-endpoint"><span className="api-endpoint-method delete">DELETE</span><span>/v1/leads/:id - Delete lead</span></div>
            </div>
            <a href="#" className="modal-docs-link" style={{marginTop:'24px'}}><span>📚</span><span>View Full API Documentation →</span></a>
          </div>
        </div>
      </div>

      {/* Make.com Modal */}
      <div className={`modal-overlay ${activeModal === 'makeModal' ? 'active' : ''}`} onClick={closeModal}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div className="modal-title"><span>⚡</span><span>Make.com Integration</span></div>
            <button className="modal-close" onClick={closeModal}>✕</button>
          </div>
          <div className="modal-content">
            <div className="modal-form-group">
              <label className="modal-label">Webhook URL</label>
              <input type="text" className="modal-input" placeholder="https://hook.make.com/your-webhook-url" value={makeWebhook} onChange={(e) => setMakeWebhook(e.target.value)} />
              <p style={{fontSize:'0.75rem',color:'var(--text-muted)',marginTop:'8px'}}>Paste your Make.com Custom Webhook URL here</p>
            </div>
            <div className="make-instructions">
              <div className="make-instructions-title">How to get your Webhook URL:</div>
              <ol>
                <li>Go to Make.com → Create new scenario</li>
                <li>Add &quot;Webhooks&quot; → &quot;Custom webhook&quot; module</li>
                <li>Click &quot;Add&quot; to create a new webhook</li>
                <li>Copy the URL and paste it above</li>
              </ol>
            </div>
            <div className="make-test-section">
              <label className="modal-label">Test Connection</label>
              <button className="modal-btn secondary" style={{width:'100%'}} onClick={testMakeConnection}><span>🔗</span><span>Test Webhook Connection</span></button>
            </div>
            <div className="modal-actions" style={{marginTop:'24px'}}>
              <button className="modal-btn primary" onClick={saveMakeSettings}><span>💾</span><span>Save Settings</span></button>
              <button className="modal-btn secondary" onClick={closeModal}><span>Cancel</span></button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

