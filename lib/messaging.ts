// lib/messaging.ts
// Email and SMS marketing integrations

import OpenAI from 'openai';

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

// SendGrid for email
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'noreply@store.com';

// Twilio for SMS
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

interface EmailParams {
  template?: 'price_drop' | 'new_arrival' | 'back_in_stock' | 'custom';
  segment?: 'all' | 'members' | 'vip' | 'inactive';
  subject: string;
  products?: any[];
  html_content?: string;
  ai_generate?: boolean;
}

interface SMSParams {
  message: string;
  segment?: 'all' | 'members' | 'vip';
  ai_generate?: boolean;
  product?: any;
}

/**
 * Generate email content using AI
 */
async function generateEmailContent(
  template: string,
  products: any[]
): Promise<{ subject: string; html: string }> {
  const prompt = `Generate email marketing content for a ${template} campaign.

Products:
${products.slice(0, 5).map(p => `- ${p.title}: $${p.price}`).join('\n')}

Requirements:
- Subject line: Catchy, under 60 chars, avoid spam triggers
- HTML content: Clean, mobile-responsive, include product images and CTAs
- Include unsubscribe link placeholder: {{unsubscribe_url}}
- Include view in browser link: {{view_in_browser}}

Respond in JSON:
{
  "subject": "...",
  "html": "full HTML email content..."
}`;

  const response = await getOpenAI().chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.7
  });

  return JSON.parse(response.choices[0].message.content || '{}');
}

/**
 * Send email campaign via SendGrid
 */
export async function sendEmailCampaign(params: EmailParams): Promise<{
  success: boolean;
  sent_count?: number;
  campaign_id?: string;
  error?: string;
}> {
  if (!SENDGRID_API_KEY) {
    return { success: false, error: 'SendGrid not configured' };
  }

  try {
    // Generate content if needed
    let htmlContent = params.html_content || '';
    let subject = params.subject;

    if (params.ai_generate && params.products) {
      const generated = await generateEmailContent(
        params.template || 'custom',
        params.products
      );
      htmlContent = generated.html;
      subject = generated.subject;
    }

    // For production, you'd use SendGrid's marketing campaigns API
    // This is a simplified single-send example
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: 'subscribers@list.com' }], // Would be dynamic list
          subject
        }],
        from: { email: SENDGRID_FROM_EMAIL },
        content: [{ type: 'text/html', value: htmlContent }]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error };
    }

    return {
      success: true,
      sent_count: 1, // Would be actual count from marketing API
      campaign_id: response.headers.get('x-message-id') || undefined
    };

  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Generate SMS content using AI
 */
async function generateSMSContent(
  product: any,
  type: 'promo' | 'alert' | 'reminder'
): Promise<string> {
  const prompt = `Generate an SMS marketing message (max 160 chars) for:
Product: ${product.title}
Price: $${product.price}
Type: ${type}

Rules:
- Include shop link placeholder: {{shop_url}}
- Clear call to action
- No spam trigger words
- Under 160 characters

Return only the message text, nothing else.`;

  const response = await getOpenAI().chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7
  });

  return response.choices[0].message.content || '';
}

/**
 * Send SMS campaign via Twilio
 */
export async function sendSMS(params: SMSParams): Promise<{
  success: boolean;
  sent_count?: number;
  error?: string;
}> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    return { success: false, error: 'Twilio not configured' };
  }

  try {
    let message = params.message;

    if (params.ai_generate && params.product) {
      message = await generateSMSContent(params.product, 'promo');
    }

    // Ensure message fits SMS limit
    if (message.length > 160) {
      message = message.substring(0, 157) + '...';
    }

    // For production, you'd loop through subscriber list
    // This is a simplified single-send example
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          From: TWILIO_PHONE_NUMBER!,
          To: '+1234567890', // Would be dynamic
          Body: message
        })
      }
    );

    const result = await response.json();

    if (result.error_code) {
      return { success: false, error: result.error_message };
    }

    return {
      success: true,
      sent_count: 1
    };

  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Email templates for common campaigns
 */
export const EMAIL_TEMPLATES = {
  price_drop: {
    name: 'Price Drop Alert',
    subject: '🔥 Prices Just Dropped!',
    preheader: 'Save big on your favorites'
  },
  new_arrival: {
    name: 'New Arrivals',
    subject: '✨ Just In: New Products You\'ll Love',
    preheader: 'Be the first to shop'
  },
  back_in_stock: {
    name: 'Back in Stock',
    subject: '🎉 It\'s Back! The Item You Wanted',
    preheader: 'Don\'t miss out this time'
  },
  member_exclusive: {
    name: 'Member Exclusive',
    subject: '👑 Members Only: Special Access',
    preheader: 'Exclusive deals just for you'
  },
  abandoned_cart: {
    name: 'Abandoned Cart',
    subject: 'You left something behind...',
    preheader: 'Your cart is waiting'
  }
};

/**
 * SMS templates for common messages
 */
export const SMS_TEMPLATES = {
  flash_sale: (discount: number, hours: number) =>
    `🔥 FLASH SALE! ${discount}% off everything for ${hours}hrs only. Shop now: {{shop_url}} Reply STOP to opt out`,
  price_drop: (product: string, newPrice: number) =>
    `Price drop alert! ${product} now just $${newPrice}. Limited time: {{shop_url}} Reply STOP to opt out`,
  back_in_stock: (product: string) =>
    `${product} is BACK! Sold out before? Get it now: {{shop_url}} Reply STOP to opt out`,
  order_shipped: (orderNum: string) =>
    `Your order #${orderNum} has shipped! Track it here: {{tracking_url}}`
};
