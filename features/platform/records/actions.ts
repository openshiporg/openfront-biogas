'use server';

import { revalidatePath } from 'next/cache';
import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';

type Kind = 'text' | 'int' | 'money' | 'bool' | 'decimal' | 'json' | 'date' | 'relation' | 'relations';

/**
 * Plain records the dashboard edits directly (suppliers, products, settings, content). None of these is a status: status
 * changes always go through the named staff operations in actions/commands.ts. Each list names the fields a screen may
 * write and how a form value turns into a GraphQL value; Keystone's list access rules still decide who may write.
 */
const LISTS: Record<string, { create: string; update: string; input: string; fields: Record<string, Kind> }> = {
  Product: { create: 'createProduct', update: 'updateProduct', input: 'Product', fields: {
    name: 'text', slug: 'text', sku: 'text', type: 'text', description: 'text', imageUrl: 'text', priceAmount: 'money', compareAtAmount: 'money', taxable: 'bool',
    isPublished: 'bool', isSerialized: 'bool', sellOnline: 'bool', requiresInstallation: 'bool', requiresSurvey: 'bool', installFeeAmount: 'money',
    weightKg: 'decimal', warrantyMonths: 'int', unitCostAmount: 'money', category: 'relation', compatibleWith: 'relations',
  } },
  DigesterSpec: { create: 'createDigesterSpec', update: 'updateDigesterSpec', input: 'DigesterSpec', fields: {
    product: 'relation', capacityM3: 'decimal', technology: 'text', feedstockTypes: 'json', minDailyFeedKg: 'decimal', maxDailyFeedKg: 'decimal', dailyGasM3: 'decimal',
    cookingHoursPerDay: 'decimal', servesPeople: 'int', footprintLengthM: 'decimal', footprintWidthM: 'decimal', waterPerDayL: 'decimal',
    reactorWarrantyMonths: 'int', partsWarrantyMonths: 'int', installHours: 'decimal', surveyKind: 'text', isPublished: 'bool',
  } },
  KitComponent: { create: 'createKitComponent', update: 'updateKitComponent', input: 'KitComponent', fields: { kit: 'relation', component: 'relation', quantity: 'int', isPublished: 'bool' } },
  Customer: { create: 'createCustomer', update: 'updateCustomer', input: 'Customer', fields: {
    type: 'text', name: 'text', organisationName: 'text', phone: 'text', altPhone: 'text', email: 'text', preferredLanguage: 'text', preferredContact: 'text', notes: 'text',
  } },
  CustomerContact: { create: 'createCustomerContact', update: 'updateCustomerContact', input: 'CustomerContact', fields: { customer: 'relation', name: 'text', role: 'text', phone: 'text', email: 'text', isPrimary: 'bool' } },
  Site: { create: 'createSite', update: 'updateSite', input: 'Site', fields: {
    customer: 'relation', label: 'text', addressLine: 'text', city: 'text', region: 'text', country: 'text', postcode: 'text', lat: 'decimal', lng: 'decimal', directions: 'text', siteType: 'text',
  } },
  CompanySettings: { create: 'createCompanySettings', update: 'updateCompanySettings', input: 'CompanySettings', fields: {
    name: 'text', legalName: 'text', country: 'text', timezone: 'text', units: 'text', phone: 'text', whatsappNumber: 'text', email: 'text', address: 'text',
    taxRatePercent: 'decimal', taxLabel: 'text', taxInclusive: 'bool', quoteValidDays: 'int', coolingOffDays: 'int', restockingFeePercent: 'decimal', surveyFeeAmount: 'money',
    surveyRequiredByDefault: 'bool', visitCancelCutoffHours: 'int', slotsPerTechnicianPerDay: 'int', leadResponseWorkingDays: 'int', serviceResponseTargetDays: 'int',
    instalmentGraceDays: 'int', defaultAfterDays: 'int', payBeforeServiceWork: 'bool', keepFeeOnLateCancel: 'bool', returnWindowDays: 'int', referralRewardAmount: 'money',
    waivePlanFeeOnPayoff: 'bool', commissionClawbackDays: 'int', incentiveRejectionPolicy: 'text', followUpScheduleDays: 'json', heroText: 'text', about: 'text',
  } },
  Branch: { create: 'createBranch', update: 'updateBranch', input: 'Branch', fields: { name: 'text', code: 'text', address: 'text', phone: 'text', lat: 'decimal', lng: 'decimal', isActive: 'bool' } },
  ServiceArea: { create: 'createServiceArea', update: 'updateServiceArea', input: 'ServiceArea', fields: { name: 'text', country: 'text', region: 'text', postcodes: 'json', deliveryFeeAmount: 'money', installSurchargeAmount: 'money', isActive: 'bool', branch: 'relation' } },
  PaymentProvider: { create: 'createPaymentProvider', update: 'updatePaymentProvider', input: 'PaymentProvider', fields: { name: 'text', code: 'text', isEnabled: 'bool', instructions: 'text', sortOrder: 'int' } },
  PaymentPlanTemplate: { create: 'createPaymentPlanTemplate', update: 'updatePaymentPlanTemplate', input: 'PaymentPlanTemplate', fields: { name: 'text', kind: 'text', depositPercent: 'decimal', instalmentCount: 'int', frequency: 'text', planFeePercent: 'decimal', minOrderAmount: 'money', isActive: 'bool', sortOrder: 'int' } },
  ServicePlan: { create: 'createServicePlan', update: 'updateServicePlan', input: 'ServicePlan', fields: { name: 'text', slug: 'text', description: 'text', priceAmount: 'money', billing: 'text', visitsPerYear: 'int', partsDiscountPercent: 'decimal', priorityResponse: 'bool', includedItems: 'json', isPublished: 'bool' } },
  IncentiveProgram: { create: 'createIncentiveProgram', update: 'updateIncentiveProgram', input: 'IncentiveProgram', fields: { name: 'text', country: 'text', kind: 'text', amountType: 'text', amountValue: 'text', capAmount: 'money', treatment: 'text', requiredDocuments: 'json', isActive: 'bool', infoUrl: 'text' } },
  CommissionRule: { create: 'createCommissionRule', update: 'updateCommissionRule', input: 'CommissionRule', fields: { name: 'text', type: 'text', value: 'text', isActive: 'bool' } },
  ChecklistTemplate: { create: 'createChecklistTemplate', update: 'updateChecklistTemplate', input: 'ChecklistTemplate', fields: { name: 'text', kind: 'text', isActive: 'bool' } },
  ChecklistItem: { create: 'createChecklistItem', update: 'updateChecklistItem', input: 'ChecklistItem', fields: { template: 'relation', prompt: 'text', helpText: 'text', inputType: 'text', choices: 'json', unit: 'text', isRequired: 'bool', sortOrder: 'int' } },
  Story: { create: 'createStory', update: 'updateStory', input: 'Story', fields: { title: 'text', slug: 'text', customerName: 'text', location: 'text', body: 'text', imageUrl: 'text', savingsText: 'text', isPublished: 'bool' } },
  Faq: { create: 'createFaq', update: 'updateFaq', input: 'Faq', fields: { question: 'text', answer: 'text', category: 'text', sortOrder: 'int', isPublished: 'bool' } },
  TroubleshootingGuide: { create: 'createTroubleshootingGuide', update: 'updateTroubleshootingGuide', input: 'TroubleshootingGuide', fields: { title: 'text', slug: 'text', symptomCategory: 'text', stepsText: 'text', language: 'text', isPublished: 'bool' } },
  Resource: { create: 'createResource', update: 'updateResource', input: 'Resource', fields: { title: 'text', kind: 'text', url: 'text', language: 'text', isPublished: 'bool' } },
  Role: { create: 'createRole', update: 'updateRole', input: 'Role', fields: {
    name: 'text', canAccessDashboard: 'bool', canManageSettings: 'bool', canManageUsers: 'bool', canManageOnboarding: 'bool', canManageCatalog: 'bool', canManageInventory: 'bool',
    canManageLeads: 'bool', canSeeAllLeads: 'bool', canManageQuotes: 'bool', canApproveDiscounts: 'bool', canManageOrders: 'bool', canManageVisits: 'bool', canDoFieldWork: 'bool',
    canManageSystems: 'bool', canManageTickets: 'bool', canManagePlans: 'bool', canReadPayments: 'bool', canManagePayments: 'bool', canIssueRefunds: 'bool',
    canManageIncentives: 'bool', canManageCommissions: 'bool', canReadReports: 'bool', discountLimitPercent: 'decimal',
  } },
  User: { create: 'createUser', update: 'updateUser', input: 'User', fields: { name: 'text', email: 'text', password: 'text', phone: 'text', isActive: 'bool', role: 'relation', branch: 'relation' } },
  WebhookEndpoint: { create: 'createWebhookEndpoint', update: 'updateWebhookEndpoint', input: 'WebhookEndpoint', fields: { url: 'text', events: 'json', isActive: 'bool' } },
  Supplier: { create: 'createSupplier', update: 'updateSupplier', input: 'Supplier', fields: { name: 'text', contact: 'text', phone: 'text', email: 'text', country: 'text', leadTimeDays: 'int' } },
};

function value(kind: Kind, raw: unknown): unknown {
  if (raw === undefined) return undefined;
  const s = typeof raw === 'string' ? raw.trim() : raw;
  switch (kind) {
    case 'text': return String(s ?? '');
    case 'int': return s === '' || s === null ? null : Math.trunc(Number(s));
    case 'money': return s === '' || s === null ? null : Number(s);
    case 'bool': return s === true || s === 'true' || s === 'on' || s === 'yes';
    case 'decimal': return s === '' || s === null ? null : String(s);
    case 'json': return typeof s === 'string' ? (s ? JSON.parse(s) : null) : s;
    case 'date': return s ? new Date(String(s)).toISOString() : null;
    case 'relation': return s ? { connect: { id: String(s) } } : undefined;
    case 'relations': return { set: (Array.isArray(s) ? s : String(s ?? '').split(',')).map(x => String(x).trim()).filter(Boolean).map(id => ({ id })) };
  }
}

/** Remove one plain record the list allows deleting (a kit line). */
const DELETABLE: Record<string, string> = { KitComponent: 'deleteKitComponent', ChecklistItem: 'deleteChecklistItem', Faq: 'deleteFaq', WebhookEndpoint: 'deleteWebhookEndpoint' };
export async function deleteRecord(list: string, id: string, paths: string[] = []) {
  const op = DELETABLE[list];
  if (!op) return { ok: false as const, error: 'This record is not removed here.' };
  const res = await keystoneClient(`mutation Del($id: ID!) { ${op}(where: { id: $id }) { id } }`, { id });
  if (!res.success) return { ok: false as const, error: res.error || 'Could not remove.' };
  for (const p of paths) revalidatePath(p);
  return { ok: true as const };
}

/** Upload a product photo (Product.image). */
export async function uploadProductImage(form: FormData) {
  const id = String(form.get('productId') ?? '');
  const file = form.get('file');
  if (!id || !(file instanceof File) || !file.size) return { ok: false as const, error: 'Choose a photo.' };
  if (file.size > 10 * 1024 * 1024) return { ok: false as const, error: 'The photo is over 10 MB.' };
  const res = await keystoneClient(`mutation Img($id: ID!, $data: ProductUpdateInput!) { updateProduct(where: { id: $id }, data: $data) { id } }`, { id, data: { image: { upload: file } } });
  if (!res.success) return { ok: false as const, error: res.error || 'Could not upload.' };
  revalidatePath('/dashboard/platform/catalogue');
  return { ok: true as const };
}

export async function saveRecord(list: string, id: string | null, data: Record<string, unknown>, paths: string[] = []) {
  const spec = LISTS[list];
  if (!spec) return { ok: false as const, error: 'Unknown record' };
  const out: Record<string, unknown> = {};
  if (list === 'WebhookEndpoint' && Array.isArray(data.events) && !data.events.length) data = { ...data, events: ['*'] };
  if (list === 'Role' && Array.isArray(data.flags)) {
    const on = new Set(data.flags as string[]);
    for (const [k, kind] of Object.entries(spec.fields)) if (kind === 'bool' && k.startsWith('can')) out[k] = on.has(k);
  }
  try {
    for (const [k, v] of Object.entries(data)) {
      const kind = spec.fields[k];
      if (!kind) continue;
      const val = value(kind, v);
      if (val === undefined) continue;
      if (k === 'password' && !val) continue;
      // A blank number on a new record keeps the field's default (non-nullable money and counts would reject null).
      if (!id && val === null) continue;
      if (kind === 'int' && val !== null && !Number.isFinite(val as number)) return { ok: false as const, error: `${k}: enter a whole number.` };
      out[k] = val;
    }
  } catch {
    return { ok: false as const, error: 'A field has the wrong format.' };
  }
  const res = id
    ? await keystoneClient(`mutation Save($id: ID!, $data: ${spec.input}UpdateInput!) { r: ${spec.update}(where: { id: $id }, data: $data) { id } }`, { id, data: out })
    : await keystoneClient(`mutation Save($data: ${spec.input}CreateInput!) { r: ${spec.create}(data: $data) { id } }`, { data: out });
  if (!res.success) return { ok: false as const, error: res.error || 'Could not save.' };
  for (const p of paths) revalidatePath(p);
  return { ok: true as const, id: (res.data as any)?.r?.id as string };
}
