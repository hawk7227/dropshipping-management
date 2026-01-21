// app/api/social/route.ts
// Social & Marketing API - posts, campaigns, templates, contacts, AI content generation

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  generateSocialPost,
  generateMultiPlatformContent,
  generateEmailContent,
  generateSMS,
  generateHashtags,
  createSocialPost,
  getSocialPosts,
  updateSocialPost,
  deleteSocialPost,
  publishToInstagram,
  publishToFacebook,
  sendEmail,
  sendBulkEmails,
  sendSMS,
  sendBulkSMS,
  createCampaign,
  getCampaigns,
  executeCampaign,
  getTemplates,
  createTemplate,
  getContacts,
  upsertContact,
} from '@/lib/social-marketing';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET /api/social
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'posts';

    switch (action) {
      case 'posts': {
        const platform = searchParams.get('platform') || undefined;
        const status = searchParams.get('status') as 'draft' | 'scheduled' | 'published' | 'failed' | undefined;
        const page = parseInt(searchParams.get('page') || '1');
        const pageSize = parseInt(searchParams.get('pageSize') || '20');

        const result = await getSocialPosts({ platform, status, page, pageSize });

        return NextResponse.json({
          success: true,
          data: result.posts,
          pagination: {
            page,
            pageSize,
            total: result.total,
            totalPages: Math.ceil(result.total / pageSize),
          },
        });
      }

      case 'post': {
        const id = searchParams.get('id');
        if (!id) {
          return NextResponse.json(
            { success: false, error: 'Post ID required' },
            { status: 400 }
          );
        }

        const { data, error } = await supabase
          .from('social_posts')
          .select('*')
          .eq('id', id)
          .single();

        if (error) throw error;

        return NextResponse.json({ success: true, data });
      }

      case 'campaigns': {
        const status = searchParams.get('status') || undefined;
        const type = searchParams.get('type') || undefined;
        const page = parseInt(searchParams.get('page') || '1');
        const pageSize = parseInt(searchParams.get('pageSize') || '20');

        const result = await getCampaigns({ status, type, page, pageSize });

        return NextResponse.json({
          success: true,
          data: result.campaigns,
          pagination: {
            page,
            pageSize,
            total: result.total,
            totalPages: Math.ceil(result.total / pageSize),
          },
        });
      }

      case 'campaign': {
        const id = searchParams.get('id');
        if (!id) {
          return NextResponse.json(
            { success: false, error: 'Campaign ID required' },
            { status: 400 }
          );
        }

        const { data, error } = await supabase
          .from('marketing_campaigns')
          .select('*')
          .eq('id', id)
          .single();

        if (error) throw error;

        return NextResponse.json({ success: true, data });
      }

      case 'templates': {
        const type = searchParams.get('type') || undefined;

        const templates = await getTemplates(type);

        return NextResponse.json({ success: true, data: templates });
      }

      case 'contacts': {
        const tags = searchParams.get('tags')?.split(',') || undefined;
        const search = searchParams.get('search') || undefined;
        const page = parseInt(searchParams.get('page') || '1');
        const pageSize = parseInt(searchParams.get('pageSize') || '50');

        const result = await getContacts({ tags, search, page, pageSize });

        return NextResponse.json({
          success: true,
          data: result.contacts,
          pagination: {
            page,
            pageSize,
            total: result.total,
            totalPages: Math.ceil(result.total / pageSize),
          },
        });
      }

      case 'contact-tags': {
        const { data } = await supabase
          .from('marketing_contacts')
          .select('tags');

        const allTags = new Set<string>();
        (data || []).forEach(c => {
          (c.tags || []).forEach((t: string) => allTags.add(t));
        });

        return NextResponse.json({
          success: true,
          data: Array.from(allTags).sort(),
        });
      }

      case 'stats': {
        // Posts stats
        const { count: totalPosts } = await supabase
          .from('social_posts')
          .select('*', { count: 'exact', head: true });

        const { count: publishedPosts } = await supabase
          .from('social_posts')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'published');

        const { count: scheduledPosts } = await supabase
          .from('social_posts')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'scheduled');

        // Campaign stats
        const { count: totalCampaigns } = await supabase
          .from('marketing_campaigns')
          .select('*', { count: 'exact', head: true });

        const { count: activeCampaigns } = await supabase
          .from('marketing_campaigns')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'active');

        // Contact stats
        const { count: totalContacts } = await supabase
          .from('marketing_contacts')
          .select('*', { count: 'exact', head: true });

        const { count: subscribedContacts } = await supabase
          .from('marketing_contacts')
          .select('*', { count: 'exact', head: true })
          .eq('is_subscribed', true);

        return NextResponse.json({
          success: true,
          data: {
            posts: {
              total: totalPosts || 0,
              published: publishedPosts || 0,
              scheduled: scheduledPosts || 0,
            },
            campaigns: {
              total: totalCampaigns || 0,
              active: activeCampaigns || 0,
            },
            contacts: {
              total: totalContacts || 0,
              subscribed: subscribedContacts || 0,
            },
          },
        });
      }

      case 'platforms': {
        const platforms = [
          {
            id: 'instagram',
            name: 'Instagram',
            configured: !!process.env.META_ACCESS_TOKEN,
            maxLength: 2200,
          },
          {
            id: 'facebook',
            name: 'Facebook',
            configured: !!(process.env.META_ACCESS_TOKEN && process.env.META_PAGE_ID),
            maxLength: 63206,
          },
          {
            id: 'twitter',
            name: 'Twitter/X',
            configured: false,
            maxLength: 280,
          },
          {
            id: 'tiktok',
            name: 'TikTok',
            configured: !!process.env.TIKTOK_ACCESS_TOKEN,
            maxLength: 2200,
          },
        ];

        return NextResponse.json({ success: true, data: platforms });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[Social API] GET error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// POST /api/social
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'create-post';
    const body = await request.json();

    switch (action) {
      // ==================== POSTS ====================
      case 'create-post': {
        const { platform, content, mediaUrls, scheduledFor, productId } = body;

        if (!platform || !content) {
          return NextResponse.json(
            { success: false, error: 'Platform and content required' },
            { status: 400 }
          );
        }

        const post = await createSocialPost({
          platform,
          content,
          media_urls: mediaUrls,
          scheduled_for: scheduledFor,
          product_id: productId,
          status: scheduledFor ? 'scheduled' : 'draft',
        });

        return NextResponse.json({ success: true, data: post });
      }

      case 'generate-post': {
        const { productId, platform, tone, includeHashtags, includeEmoji, customPrompt } = body;

        if (!productId) {
          return NextResponse.json(
            { success: false, error: 'Product ID required' },
            { status: 400 }
          );
        }

        // Get product
        const { data: product } = await supabase
          .from('products')
          .select('title, description, vendor, product_type, images')
          .eq('id', productId)
          .single();

        if (!product) {
          return NextResponse.json(
            { success: false, error: 'Product not found' },
            { status: 404 }
          );
        }

        const content = await generateSocialPost(product, {
          platform: platform || 'instagram',
          tone: tone || 'engaging',
          includeHashtags: includeHashtags !== false,
          includeEmoji: includeEmoji !== false,
          customPrompt,
        });

        return NextResponse.json({
          success: true,
          data: {
            content,
            platform: platform || 'instagram',
            productId,
          },
        });
      }

      case 'generate-multi-platform': {
        const { productId, platforms, tone } = body;

        if (!productId) {
          return NextResponse.json(
            { success: false, error: 'Product ID required' },
            { status: 400 }
          );
        }

        const { data: product } = await supabase
          .from('products')
          .select('title, description, vendor, product_type, images')
          .eq('id', productId)
          .single();

        if (!product) {
          return NextResponse.json(
            { success: false, error: 'Product not found' },
            { status: 404 }
          );
        }

        const content = await generateMultiPlatformContent(
          product,
          platforms || ['instagram', 'facebook', 'twitter'],
          tone
        );

        return NextResponse.json({ success: true, data: content });
      }

      case 'generate-hashtags': {
        const { productId, count } = body;

        if (!productId) {
          return NextResponse.json(
            { success: false, error: 'Product ID required' },
            { status: 400 }
          );
        }

        const { data: product } = await supabase
          .from('products')
          .select('title, description, vendor, product_type')
          .eq('id', productId)
          .single();

        if (!product) {
          return NextResponse.json(
            { success: false, error: 'Product not found' },
            { status: 404 }
          );
        }

        const hashtags = await generateHashtags(product, count || 15);

        return NextResponse.json({ success: true, data: hashtags });
      }

      case 'publish-post': {
        const { postId } = body;

        if (!postId) {
          return NextResponse.json(
            { success: false, error: 'Post ID required' },
            { status: 400 }
          );
        }

        const { data: post } = await supabase
          .from('social_posts')
          .select('*')
          .eq('id', postId)
          .single();

        if (!post) {
          return NextResponse.json(
            { success: false, error: 'Post not found' },
            { status: 404 }
          );
        }

        let result;
        if (post.platform === 'instagram') {
          result = await publishToInstagram(post.content, post.media_urls?.[0]);
        } else if (post.platform === 'facebook') {
          result = await publishToFacebook(post.content, post.media_urls?.[0]);
        } else {
          return NextResponse.json(
            { success: false, error: `Publishing to ${post.platform} not supported` },
            { status: 400 }
          );
        }

        // Update post status
        await updateSocialPost(postId, {
          status: 'published',
          published_at: new Date().toISOString(),
          platform_post_id: result.id,
        });

        return NextResponse.json({
          success: true,
          data: { postId, platformPostId: result.id },
        });
      }

      // ==================== CAMPAIGNS ====================
      case 'create-campaign': {
        const {
          name,
          type,
          subject,
          content,
          templateId,
          audienceTags,
          scheduledFor,
        } = body;

        if (!name || !type) {
          return NextResponse.json(
            { success: false, error: 'Name and type required' },
            { status: 400 }
          );
        }

        const campaign = await createCampaign({
          name,
          type,
          subject,
          content,
          template_id: templateId,
          audience_filter: audienceTags ? { tags: audienceTags } : undefined,
          scheduled_for: scheduledFor,
          status: 'draft',
        });

        return NextResponse.json({ success: true, data: campaign });
      }

      case 'execute-campaign': {
        const { campaignId } = body;

        if (!campaignId) {
          return NextResponse.json(
            { success: false, error: 'Campaign ID required' },
            { status: 400 }
          );
        }

        const result = await executeCampaign(campaignId);

        return NextResponse.json({ success: true, data: result });
      }

      case 'generate-email': {
        const { productId, purpose, tone, includeUnsubscribe } = body;

        if (!productId) {
          return NextResponse.json(
            { success: false, error: 'Product ID required' },
            { status: 400 }
          );
        }

        const { data: product } = await supabase
          .from('products')
          .select('title, description, vendor, product_type, images')
          .eq('id', productId)
          .single();

        if (!product) {
          return NextResponse.json(
            { success: false, error: 'Product not found' },
            { status: 404 }
          );
        }

        const content = await generateEmailContent(product, {
          purpose: purpose || 'promotion',
          tone: tone || 'professional',
          includeUnsubscribe: includeUnsubscribe !== false,
        });

        return NextResponse.json({ success: true, data: content });
      }

      case 'generate-sms': {
        const { productId, includeLink } = body;

        if (!productId) {
          return NextResponse.json(
            { success: false, error: 'Product ID required' },
            { status: 400 }
          );
        }

        const { data: product } = await supabase
          .from('products')
          .select('title, description, handle')
          .eq('id', productId)
          .single();

        if (!product) {
          return NextResponse.json(
            { success: false, error: 'Product not found' },
            { status: 404 }
          );
        }

        const link = includeLink
          ? `${process.env.NEXT_PUBLIC_STORE_URL}/products/${product.handle}`
          : undefined;

        const content = await generateSMS(product, link);

        return NextResponse.json({ success: true, data: content });
      }

      case 'send-email': {
        const { to, subject, html, text } = body;

        if (!to || !subject || (!html && !text)) {
          return NextResponse.json(
            { success: false, error: 'To, subject, and content required' },
            { status: 400 }
          );
        }

        const result = await sendEmail(to, subject, html || '', text);

        return NextResponse.json({ success: true, data: result });
      }

      case 'send-bulk-emails': {
        const { recipients, subject, html, text, personalize } = body;

        if (!Array.isArray(recipients) || recipients.length === 0) {
          return NextResponse.json(
            { success: false, error: 'Recipients array required' },
            { status: 400 }
          );
        }

        const result = await sendBulkEmails(recipients, subject, html, text, personalize);

        return NextResponse.json({ success: true, data: result });
      }

      case 'send-sms': {
        const { to, message } = body;

        if (!to || !message) {
          return NextResponse.json(
            { success: false, error: 'To and message required' },
            { status: 400 }
          );
        }

        const result = await sendSMS(to, message);

        return NextResponse.json({ success: true, data: result });
      }

      case 'send-bulk-sms': {
        const { recipients, message, personalize } = body;

        if (!Array.isArray(recipients) || recipients.length === 0) {
          return NextResponse.json(
            { success: false, error: 'Recipients array required' },
            { status: 400 }
          );
        }

        const result = await sendBulkSMS(recipients, message, personalize);

        return NextResponse.json({ success: true, data: result });
      }

      // ==================== TEMPLATES ====================
      case 'create-template': {
        const { name, type, subject, content, variables } = body;

        if (!name || !type || !content) {
          return NextResponse.json(
            { success: false, error: 'Name, type, and content required' },
            { status: 400 }
          );
        }

        const template = await createTemplate({
          name,
          type,
          subject,
          content,
          variables,
        });

        return NextResponse.json({ success: true, data: template });
      }

      // ==================== CONTACTS ====================
      case 'upsert-contact': {
        const { email, phone, firstName, lastName, tags, metadata, isSubscribed } = body;

        if (!email && !phone) {
          return NextResponse.json(
            { success: false, error: 'Email or phone required' },
            { status: 400 }
          );
        }

        const contact = await upsertContact({
          email,
          phone,
          first_name: firstName,
          last_name: lastName,
          tags,
          metadata,
          is_subscribed: isSubscribed,
        });

        return NextResponse.json({ success: true, data: contact });
      }

      case 'import-contacts': {
        const { contacts } = body;

        if (!Array.isArray(contacts) || contacts.length === 0) {
          return NextResponse.json(
            { success: false, error: 'Contacts array required' },
            { status: 400 }
          );
        }

        const results: { email?: string; phone?: string; success: boolean; error?: string }[] = [];

        for (const contact of contacts) {
          try {
            await upsertContact({
              email: contact.email,
              phone: contact.phone,
              first_name: contact.firstName,
              last_name: contact.lastName,
              tags: contact.tags,
              is_subscribed: contact.isSubscribed !== false,
            });
            results.push({
              email: contact.email,
              phone: contact.phone,
              success: true,
            });
          } catch (error) {
            results.push({
              email: contact.email,
              phone: contact.phone,
              success: false,
              error: String(error),
            });
          }
        }

        const successful = results.filter(r => r.success).length;

        return NextResponse.json({
          success: true,
          data: {
            total: contacts.length,
            successful,
            failed: contacts.length - successful,
            results,
          },
        });
      }

      case 'tag-contacts': {
        const { contactIds, tags, action: tagAction } = body;

        if (!Array.isArray(contactIds) || contactIds.length === 0 || !Array.isArray(tags)) {
          return NextResponse.json(
            { success: false, error: 'Contact IDs and tags required' },
            { status: 400 }
          );
        }

        // Get existing contacts
        const { data: contacts } = await supabase
          .from('marketing_contacts')
          .select('id, tags')
          .in('id', contactIds);

        for (const contact of contacts || []) {
          let newTags = contact.tags || [];

          if (tagAction === 'remove') {
            newTags = newTags.filter((t: string) => !tags.includes(t));
          } else {
            newTags = [...new Set([...newTags, ...tags])];
          }

          await supabase
            .from('marketing_contacts')
            .update({ tags: newTags, updated_at: new Date().toISOString() })
            .eq('id', contact.id);
        }

        return NextResponse.json({
          success: true,
          message: `Updated tags for ${contacts?.length || 0} contacts`,
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[Social API] POST error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// PUT /api/social
export async function PUT(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'update-post';
    const body = await request.json();

    switch (action) {
      case 'update-post': {
        const { id, content, mediaUrls, scheduledFor, status } = body;

        if (!id) {
          return NextResponse.json(
            { success: false, error: 'Post ID required' },
            { status: 400 }
          );
        }

        const updates: Record<string, any> = {};
        if (content !== undefined) updates.content = content;
        if (mediaUrls !== undefined) updates.media_urls = mediaUrls;
        if (scheduledFor !== undefined) updates.scheduled_for = scheduledFor;
        if (status !== undefined) updates.status = status;

        const post = await updateSocialPost(id, updates);

        return NextResponse.json({ success: true, data: post });
      }

      case 'update-campaign': {
        const { id, name, subject, content, audienceTags, scheduledFor, status } = body;

        if (!id) {
          return NextResponse.json(
            { success: false, error: 'Campaign ID required' },
            { status: 400 }
          );
        }

        const updates: Record<string, any> = { updated_at: new Date().toISOString() };
        if (name !== undefined) updates.name = name;
        if (subject !== undefined) updates.subject = subject;
        if (content !== undefined) updates.content = content;
        if (audienceTags !== undefined) updates.audience_filter = { tags: audienceTags };
        if (scheduledFor !== undefined) updates.scheduled_for = scheduledFor;
        if (status !== undefined) updates.status = status;

        const { data, error } = await supabase
          .from('marketing_campaigns')
          .update(updates)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;

        return NextResponse.json({ success: true, data });
      }

      case 'update-template': {
        const { id, name, subject, content, variables } = body;

        if (!id) {
          return NextResponse.json(
            { success: false, error: 'Template ID required' },
            { status: 400 }
          );
        }

        const updates: Record<string, any> = { updated_at: new Date().toISOString() };
        if (name !== undefined) updates.name = name;
        if (subject !== undefined) updates.subject = subject;
        if (content !== undefined) updates.content = content;
        if (variables !== undefined) updates.variables = variables;

        const { data, error } = await supabase
          .from('message_templates')
          .update(updates)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;

        return NextResponse.json({ success: true, data });
      }

      case 'update-contact': {
        const { id, email, phone, firstName, lastName, tags, isSubscribed } = body;

        if (!id) {
          return NextResponse.json(
            { success: false, error: 'Contact ID required' },
            { status: 400 }
          );
        }

        const updates: Record<string, any> = { updated_at: new Date().toISOString() };
        if (email !== undefined) updates.email = email;
        if (phone !== undefined) updates.phone = phone;
        if (firstName !== undefined) updates.first_name = firstName;
        if (lastName !== undefined) updates.last_name = lastName;
        if (tags !== undefined) updates.tags = tags;
        if (isSubscribed !== undefined) updates.is_subscribed = isSubscribed;

        const { data, error } = await supabase
          .from('marketing_contacts')
          .update(updates)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;

        return NextResponse.json({ success: true, data });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[Social API] PUT error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}

// DELETE /api/social
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'delete-post';
    const id = searchParams.get('id');

    switch (action) {
      case 'delete-post': {
        if (!id) {
          return NextResponse.json(
            { success: false, error: 'Post ID required' },
            { status: 400 }
          );
        }

        await deleteSocialPost(id);

        return NextResponse.json({
          success: true,
          message: 'Post deleted successfully',
        });
      }

      case 'delete-campaign': {
        if (!id) {
          return NextResponse.json(
            { success: false, error: 'Campaign ID required' },
            { status: 400 }
          );
        }

        const { error } = await supabase
          .from('marketing_campaigns')
          .delete()
          .eq('id', id);

        if (error) throw error;

        return NextResponse.json({
          success: true,
          message: 'Campaign deleted successfully',
        });
      }

      case 'delete-template': {
        if (!id) {
          return NextResponse.json(
            { success: false, error: 'Template ID required' },
            { status: 400 }
          );
        }

        const { error } = await supabase
          .from('message_templates')
          .delete()
          .eq('id', id);

        if (error) throw error;

        return NextResponse.json({
          success: true,
          message: 'Template deleted successfully',
        });
      }

      case 'delete-contact': {
        if (!id) {
          return NextResponse.json(
            { success: false, error: 'Contact ID required' },
            { status: 400 }
          );
        }

        const { error } = await supabase
          .from('marketing_contacts')
          .delete()
          .eq('id', id);

        if (error) throw error;

        return NextResponse.json({
          success: true,
          message: 'Contact deleted successfully',
        });
      }

      case 'bulk-delete-contacts': {
        const body = await request.json();
        const { contactIds } = body;

        if (!Array.isArray(contactIds) || contactIds.length === 0) {
          return NextResponse.json(
            { success: false, error: 'Contact IDs required' },
            { status: 400 }
          );
        }

        const { error } = await supabase
          .from('marketing_contacts')
          .delete()
          .in('id', contactIds);

        if (error) throw error;

        return NextResponse.json({
          success: true,
          message: `Deleted ${contactIds.length} contacts`,
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('[Social API] DELETE error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
