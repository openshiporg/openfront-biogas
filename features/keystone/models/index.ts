import { User, Role, CompanySettings, Branch, ServiceArea, Sequence, CommandReceipt, AuditEvent, ContactLog, Media, WebhookEndpoint, WebhookEvent } from './platform'
import { ProductCategory, Product, DigesterSpec, KitComponent, Supplier, StockLocation, StockLevel, StockMovement, SerializedUnit, PurchaseOrder, PurchaseOrderLine } from './catalogue'
import { Customer, CustomerContact, Site, SizingAssessment, Lead, LeadActivity, Quote, QuoteOption, QuoteLine, PaymentPlanTemplate, QuotePlanOffer, IncentiveProgram, IncentiveApplication } from './sales'
import { Cart, CartLine, Order, OrderLine, OrderChange, PaymentProvider, PaymentSession, Payment, PaymentAllocation, Refund, PaymentWebhookEvent, PaymentPlan, Installment, Invoice } from './orders'
import { ChecklistTemplate, ChecklistItem, Visit, VisitSlotUsage, TechnicianTimeOff, SiteSurvey, Installation, SitePrepTask, TrainingRecord, PartUsage } from './field'
import { InstalledSystem, WarrantyCoverage, SystemReading, ServiceTicket, TicketEvent, ServicePlan, ServicePlanSubscription, TroubleshootingGuide, Resource, Referral, Commission, CommissionRule, Story, Faq } from './service'
import { OAuthApp } from './OAuthApp'
import { OAuthToken } from './OAuthToken'

export const models = {
  // 5.1 Platform
  User, Role, CompanySettings, Branch, ServiceArea, Sequence, CommandReceipt, AuditEvent, ContactLog, Media, WebhookEndpoint, WebhookEvent,
  // 5.2 Catalogue and stock
  ProductCategory, Product, DigesterSpec, KitComponent, Supplier, StockLocation, StockLevel, StockMovement, SerializedUnit, PurchaseOrder, PurchaseOrderLine,
  // 5.3 Customers and sales
  Customer, CustomerContact, Site, SizingAssessment, Lead, LeadActivity, Quote, QuoteOption, QuoteLine, PaymentPlanTemplate, QuotePlanOffer, IncentiveProgram, IncentiveApplication,
  // 5.4 Cart, orders and money
  Cart, CartLine, Order, OrderLine, OrderChange, PaymentProvider, PaymentSession, Payment, PaymentAllocation, Refund, PaymentWebhookEvent, PaymentPlan, Installment, Invoice,
  // 5.5 Field work
  ChecklistTemplate, ChecklistItem, Visit, VisitSlotUsage, TechnicianTimeOff, SiteSurvey, Installation, SitePrepTask, TrainingRecord, PartUsage,
  // 5.6–5.7 Installed base, service, growth
  InstalledSystem, WarrantyCoverage, SystemReading, ServiceTicket, TicketEvent, ServicePlan, ServicePlanSubscription, TroubleshootingGuide, Resource, Referral, Commission, CommissionRule, Story, Faq,
  // MCP OAuth (starter)
  OAuthApp, OAuthToken,
}

export default models
