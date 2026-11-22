import { graphql, list } from '@keystone-6/core'
import { checkbox, image, integer, json, relationship, text, timestamp, virtual } from '@keystone-6/core/fields'
import { document } from '@keystone-6/fields-document'
import { anyOf, has } from '../access'
import { choice, currency, governed, managed, money, published, qty, ro, serverKey, serverText, status, version } from './fields'
import { trackingFields } from './trackingFields'

export const ProductCategory = list({
  access: published('canManageCatalog', 'isPublished'),
  fields: {
    name: text({ validation: { isRequired: true } }),
    slug: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    description: text({ ui: { displayMode: 'textarea' } }),
    sortOrder: integer({ defaultValue: 0 }),
    image: image({ storage: 'biogas_images' }),
    isPublished: checkbox({ defaultValue: true }),
    products: relationship({ ref: 'Product.category', many: true }),
    ...trackingFields,
  },
})

export const PRODUCT_TYPES = ['digester_kit', 'appliance', 'part', 'consumable', 'service'] as const

export const Product = list({
  access: published('canManageCatalog'),
  ui: { listView: { initialColumns: ['name', 'sku', 'type', 'priceAmount', 'isPublished'] } },
  fields: {
    name: text({ validation: { isRequired: true } }),
    slug: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    sku: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    type: choice(PRODUCT_TYPES, 'part'),
    description: text({ ui: { displayMode: 'textarea' } }),
    image: image({ storage: 'biogas_images' }),
    imageUrl: text(),
    priceAmount: money(),
    compareAtAmount: money({ nullable: true }),
    currencyCode: currency(),
    taxable: checkbox({ defaultValue: true }),
    isPublished: checkbox({ defaultValue: false }),
    isSerialized: checkbox({ defaultValue: false }),
    sellOnline: checkbox({ defaultValue: true }),
    requiresInstallation: checkbox({ defaultValue: false }),
    requiresSurvey: checkbox({ defaultValue: false }),
    installFeeAmount: money(),
    weightKg: qty(),
    warrantyMonths: integer({ defaultValue: 12 }),
    unitCostAmount: money({ nullable: true }),
    category: relationship({ ref: 'ProductCategory.products' }),
    digesterSpec: relationship({ ref: 'DigesterSpec.product' }),
    kitComponents: relationship({ ref: 'KitComponent.kit', many: true }),
    usedInKits: relationship({ ref: 'KitComponent.component', many: true }),
    compatibleWith: relationship({ ref: 'Product.fitsParts', many: true, ui: { description: 'Kits this part fits' } }),
    fitsParts: relationship({ ref: 'Product.compatibleWith', many: true, ui: { description: 'Parts that fit this kit' } }),
    stockLevels: relationship({ ref: 'StockLevel.product', many: true, ...ro }),
    /** Units that can be sold now (on hand less reserved, warehouses and branches; a kit counts its bill of materials). */
    availableQuantity: virtual({
      field: graphql.field({
        type: graphql.Int,
        resolve: async (item, _a, context) => {
          const { stockUnits, availableQuantity } = await import('../services/stock')
          const tx = context.prisma as never
          const units = await stockUnits(tx, String((item as { id: string }).id), 1)
          if (!units.length) return null
          const each = await Promise.all(units.map(async u => Math.floor((await availableQuantity(tx, u.productId)) / u.quantity)))
          return Math.min(...each)
        },
      }),
    }),
    media: relationship({ ref: 'Media.product', many: true }),
    resources: relationship({ ref: 'Resource.products', many: true }),
    guides: relationship({ ref: 'TroubleshootingGuide.appliesTo', many: true }),
    ...trackingFields,
  },
})

export const DigesterSpec = list({
  access: published('canManageCatalog', 'isPublished'),
  fields: {
    isPublished: checkbox({ defaultValue: true }),
    capacityM3: qty(),
    technology: choice(['prefab_bag', 'prefab_tube', 'prefab_tank', 'fixed_dome', 'floating_drum', 'container'], 'prefab_bag'),
    feedstockTypes: json({ defaultValue: ['cattle'] }),
    minDailyFeedKg: qty(),
    maxDailyFeedKg: qty(),
    dailyGasM3: qty(),
    cookingHoursPerDay: qty(),
    servesPeople: integer(),
    minAnimals: json({ defaultValue: {} }),
    footprintLengthM: qty(),
    footprintWidthM: qty(),
    waterPerDayL: qty(),
    reactorWarrantyMonths: integer({ defaultValue: 60 }),
    partsWarrantyMonths: integer({ defaultValue: 12 }),
    installHours: qty(),
    surveyKind: choice(['survey_farm', 'survey_kitchen'], 'survey_farm'),
    preInstallTemplate: relationship({ ref: 'ChecklistTemplate' }),
    installTemplate: relationship({ ref: 'ChecklistTemplate' }),
    product: relationship({ ref: 'Product.digesterSpec' }),
    ...trackingFields,
  },
})

export const KitComponent = list({
  access: published('canManageCatalog', 'isPublished'),
  fields: {
    isPublished: checkbox({ defaultValue: true }),
    quantity: integer({ defaultValue: 1, validation: { isRequired: true, min: 1 } }),
    kit: relationship({ ref: 'Product.kitComponents' }),
    component: relationship({ ref: 'Product.usedInKits' }),
    ...trackingFields,
  },
})

export const Supplier = list({
  access: managed(['canManageInventory', 'canReadReports'], 'canManageInventory'),
  fields: {
    name: text({ validation: { isRequired: true } }),
    contact: text(),
    phone: text(),
    email: text(),
    country: text(),
    leadTimeDays: integer({ defaultValue: 14 }),
    purchaseOrders: relationship({ ref: 'PurchaseOrder.supplier', many: true, ...ro }),
    ...trackingFields,
  },
})

export const StockLocation = list({
  access: managed('canAccessDashboard', 'canManageInventory'),
  fields: {
    name: text({ validation: { isRequired: true } }),
    type: choice(['warehouse', 'branch', 'van'], 'warehouse'),
    isActive: checkbox({ defaultValue: true }),
    branch: relationship({ ref: 'Branch.stockLocations' }),
    technician: relationship({ ref: 'User.van' }),
    levels: relationship({ ref: 'StockLevel.location', many: true, ...ro }),
    ...trackingFields,
  },
})

/** On hand and reserved change only with a StockMovement in the same transaction (section 4.14). */
export const StockLevel = list({
  db: { extendPrismaSchema: (schema: string) => schema.replace(/\}\s*$/, '  @@unique([productId, locationId])\n}') },
  access: {
    // Guests see availability through the product; the row itself is staff-only except for its counts.
    operation: { query: () => true, create: () => false, update: anyOf('canManageInventory'), delete: () => false },
  },
  ui: { listView: { initialColumns: ['product', 'location', 'onHand', 'reserved', 'reorderPoint'] } },
  fields: {
    onHand: integer({ defaultValue: 0, validation: { isRequired: true }, ...ro }),
    reserved: integer({ defaultValue: 0, validation: { isRequired: true }, ...ro }),
    reorderPoint: integer({ defaultValue: 0, validation: { isRequired: true } }),
    product: relationship({ ref: 'Product.stockLevels', ...ro }),
    location: relationship({ ref: 'StockLocation.levels', ...ro }),
    ...trackingFields,
  },
})

export const StockMovement = list({
  access: governed('canManageInventory'),
  ui: { listView: { initialColumns: ['createdAt', 'type', 'product', 'location', 'quantity', 'refType'] } },
  fields: {
    type: status(['receipt', 'reserve', 'release', 'pick', 'consume', 'transfer_out', 'transfer_in', 'return', 'adjust']),
    quantity: integer({ validation: { isRequired: true }, ...ro }),
    unitCostAmount: money({ readOnly: true }),
    reason: serverText(),
    refType: serverText(),
    refId: serverText(),
    product: relationship({ ref: 'Product', ...ro }),
    location: relationship({ ref: 'StockLocation', ...ro }),
    user: relationship({ ref: 'User', ...ro }),
    ...trackingFields,
  },
})

export const SerializedUnit = list({
  access: { operation: { query: ({ session }) => has(session, 'canAccessDashboard'), create: anyOf('canManageInventory'), update: () => false, delete: () => false } },
  ui: { labelField: 'serialNumber' },
  fields: {
    serialNumber: text({ isIndexed: 'unique', validation: { isRequired: true } }),
    status: status(['in_stock', 'reserved', 'installed', 'returned', 'scrapped']),
    product: relationship({ ref: 'Product' }),
    location: relationship({ ref: 'StockLocation' }),
    order: relationship({ ref: 'Order.serializedUnits', ...ro }),
    installedSystem: relationship({ ref: 'InstalledSystem.serializedUnit', ...ro }),
    ...trackingFields,
  },
})

export const PurchaseOrder = list({
  access: { operation: { query: anyOf('canManageInventory', 'canReadReports'), create: anyOf('canManageInventory'), update: anyOf('canManageInventory'), delete: () => false } },
  ui: { labelField: 'number' },
  fields: {
    number: serverKey(),
    status: status(['draft', 'sent', 'partially_received', 'received', 'closed', 'cancelled']),
    version: version(),
    expectedAt: timestamp(),
    notes: text({ ui: { displayMode: 'textarea' } }),
    totalAmount: money({ readOnly: true }),
    currencyCode: currency(),
    supplier: relationship({ ref: 'Supplier.purchaseOrders' }),
    location: relationship({ ref: 'StockLocation', ui: { description: 'Where the goods arrive' } }),
    lines: relationship({ ref: 'PurchaseOrderLine.purchaseOrder', many: true }),
    ...trackingFields,
  },
})

export const PurchaseOrderLine = list({
  access: { operation: { query: anyOf('canManageInventory', 'canReadReports'), create: anyOf('canManageInventory'), update: anyOf('canManageInventory'), delete: anyOf('canManageInventory') } },
  fields: {
    quantity: integer({ defaultValue: 1, validation: { isRequired: true, min: 1 } }),
    receivedQuantity: integer({ defaultValue: 0, ...ro }),
    unitCostAmount: money(),
    purchaseOrder: relationship({ ref: 'PurchaseOrder.lines' }),
    product: relationship({ ref: 'Product' }),
    ...trackingFields,
  },
})

export const contentDocument = () => document({ formatting: true, links: true, dividers: true })
export { serverText }
