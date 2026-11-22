-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "password" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "preferredLanguage" TEXT NOT NULL DEFAULT 'en',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "onboardingStatus" TEXT DEFAULT 'not_started',
    "role" TEXT,
    "branch" TEXT,
    "lastLeadAssignedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "passwordResetToken" TEXT,
    "passwordResetIssuedAt" TIMESTAMP(3),
    "passwordResetRedeemedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "canAccessDashboard" BOOLEAN NOT NULL DEFAULT false,
    "canManageSettings" BOOLEAN NOT NULL DEFAULT false,
    "canManageUsers" BOOLEAN NOT NULL DEFAULT false,
    "canManageOnboarding" BOOLEAN NOT NULL DEFAULT false,
    "canManageCatalog" BOOLEAN NOT NULL DEFAULT false,
    "canManageInventory" BOOLEAN NOT NULL DEFAULT false,
    "canManageLeads" BOOLEAN NOT NULL DEFAULT false,
    "canSeeAllLeads" BOOLEAN NOT NULL DEFAULT false,
    "canManageQuotes" BOOLEAN NOT NULL DEFAULT false,
    "canApproveDiscounts" BOOLEAN NOT NULL DEFAULT false,
    "canManageOrders" BOOLEAN NOT NULL DEFAULT false,
    "canManageVisits" BOOLEAN NOT NULL DEFAULT false,
    "canDoFieldWork" BOOLEAN NOT NULL DEFAULT false,
    "canManageSystems" BOOLEAN NOT NULL DEFAULT false,
    "canManageTickets" BOOLEAN NOT NULL DEFAULT false,
    "canManagePlans" BOOLEAN NOT NULL DEFAULT false,
    "canReadPayments" BOOLEAN NOT NULL DEFAULT false,
    "canManagePayments" BOOLEAN NOT NULL DEFAULT false,
    "canIssueRefunds" BOOLEAN NOT NULL DEFAULT false,
    "canManageIncentives" BOOLEAN NOT NULL DEFAULT false,
    "canManageCommissions" BOOLEAN NOT NULL DEFAULT false,
    "canReadReports" BOOLEAN NOT NULL DEFAULT false,
    "discountLimitPercent" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanySettings" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Biogas company',
    "legalName" TEXT NOT NULL DEFAULT '',
    "logo_id" TEXT,
    "logo_filesize" INTEGER,
    "logo_width" INTEGER,
    "logo_height" INTEGER,
    "logo_extension" TEXT,
    "country" TEXT NOT NULL DEFAULT 'US',
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "timezone" TEXT NOT NULL DEFAULT 'America/Chicago',
    "units" TEXT NOT NULL DEFAULT 'metric',
    "phone" TEXT NOT NULL DEFAULT '',
    "whatsappNumber" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "taxRatePercent" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "taxLabel" TEXT NOT NULL DEFAULT 'Sales tax',
    "taxInclusive" BOOLEAN NOT NULL DEFAULT false,
    "quoteValidDays" INTEGER NOT NULL DEFAULT 30,
    "coolingOffDays" INTEGER NOT NULL DEFAULT 3,
    "restockingFeePercent" DECIMAL(6,2) NOT NULL DEFAULT 10,
    "surveyFeeAmount" INTEGER NOT NULL DEFAULT 0,
    "surveyRequiredByDefault" BOOLEAN NOT NULL DEFAULT true,
    "visitCancelCutoffHours" INTEGER NOT NULL DEFAULT 24,
    "slotsPerTechnicianPerDay" INTEGER NOT NULL DEFAULT 4,
    "leadResponseWorkingDays" INTEGER NOT NULL DEFAULT 1,
    "serviceResponseTargetDays" INTEGER NOT NULL DEFAULT 5,
    "instalmentGraceDays" INTEGER NOT NULL DEFAULT 5,
    "defaultAfterDays" INTEGER NOT NULL DEFAULT 60,
    "payBeforeServiceWork" BOOLEAN NOT NULL DEFAULT false,
    "keepFeeOnLateCancel" BOOLEAN NOT NULL DEFAULT true,
    "returnWindowDays" INTEGER NOT NULL DEFAULT 30,
    "referralRewardAmount" INTEGER NOT NULL DEFAULT 0,
    "waivePlanFeeOnPayoff" BOOLEAN NOT NULL DEFAULT true,
    "commissionClawbackDays" INTEGER NOT NULL DEFAULT 90,
    "incentiveRejectionPolicy" TEXT NOT NULL DEFAULT 'absorb',
    "followUpScheduleDays" JSONB DEFAULT '[7,30,90,365]',
    "offlinePaymentInstructions" JSONB DEFAULT '{}',
    "heroText" TEXT NOT NULL DEFAULT '',
    "about" TEXT NOT NULL DEFAULT '',
    "impactNumbers" JSONB DEFAULT '[]',
    "onboardingAnswers" JSONB,
    "onboardedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanySettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "lat" DECIMAL(9,6),
    "lng" DECIMAL(9,6),
    "phone" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceArea" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT '',
    "region" TEXT NOT NULL DEFAULT '',
    "postcodes" JSONB DEFAULT '[]',
    "deliveryFeeAmount" INTEGER NOT NULL DEFAULT 0,
    "installSurchargeAmount" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "branch" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sequence" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT '',
    "nextValue" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommandReceipt" (
    "id" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL DEFAULT '',
    "actorId" TEXT NOT NULL DEFAULT '',
    "operation" TEXT NOT NULL DEFAULT '',
    "requestFingerprint" TEXT NOT NULL DEFAULT '',
    "resultJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommandReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL DEFAULT '',
    "entityType" TEXT NOT NULL DEFAULT '',
    "entityId" TEXT NOT NULL DEFAULT '',
    "actor" TEXT,
    "actorLabel" TEXT NOT NULL DEFAULT '',
    "fromStatus" TEXT NOT NULL DEFAULT '',
    "toStatus" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "dataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactLog" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "customer" TEXT,
    "user" TEXT,
    "relatedType" TEXT NOT NULL DEFAULT '',
    "relatedId" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Media" (
    "id" TEXT NOT NULL,
    "image_id" TEXT,
    "image_filesize" INTEGER,
    "image_width" INTEGER,
    "image_height" INTEGER,
    "image_extension" TEXT,
    "file_filesize" INTEGER,
    "file_filename" TEXT,
    "url" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'photo',
    "caption" TEXT NOT NULL DEFAULT '',
    "takenAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "lat" DECIMAL(9,6),
    "lng" DECIMAL(9,6),
    "visit" TEXT,
    "site" TEXT,
    "ticket" TEXT,
    "installation" TEXT,
    "product" TEXT,
    "incentiveApplication" TEXT,
    "sitePrepTask" TEXT,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL DEFAULT '',
    "events" JSONB DEFAULT '["*"]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "secret" TEXT NOT NULL DEFAULT '',
    "lastTriggered" TIMESTAMP(3),
    "failureCount" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL DEFAULT '',
    "resourceType" TEXT NOT NULL DEFAULT '',
    "resourceId" TEXT NOT NULL DEFAULT '',
    "payload" JSONB,
    "deliveryAttempts" INTEGER DEFAULT 0,
    "delivered" BOOLEAN NOT NULL DEFAULT false,
    "responseStatus" INTEGER,
    "responseBody" TEXT NOT NULL DEFAULT '',
    "lastAttempt" TIMESTAMP(3),
    "endpoint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "slug" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER DEFAULT 0,
    "image_id" TEXT,
    "image_filesize" INTEGER,
    "image_width" INTEGER,
    "image_height" INTEGER,
    "image_extension" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "slug" TEXT NOT NULL DEFAULT '',
    "sku" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL DEFAULT 'part',
    "description" TEXT NOT NULL DEFAULT '',
    "image_id" TEXT,
    "image_filesize" INTEGER,
    "image_width" INTEGER,
    "image_height" INTEGER,
    "image_extension" TEXT,
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "priceAmount" INTEGER NOT NULL DEFAULT 0,
    "compareAtAmount" INTEGER,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "isSerialized" BOOLEAN NOT NULL DEFAULT false,
    "sellOnline" BOOLEAN NOT NULL DEFAULT true,
    "requiresInstallation" BOOLEAN NOT NULL DEFAULT false,
    "requiresSurvey" BOOLEAN NOT NULL DEFAULT false,
    "installFeeAmount" INTEGER NOT NULL DEFAULT 0,
    "weightKg" DECIMAL(12,3),
    "warrantyMonths" INTEGER DEFAULT 12,
    "unitCostAmount" INTEGER,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DigesterSpec" (
    "id" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "capacityM3" DECIMAL(12,3),
    "technology" TEXT NOT NULL DEFAULT 'prefab_bag',
    "feedstockTypes" JSONB DEFAULT '["cattle"]',
    "minDailyFeedKg" DECIMAL(12,3),
    "maxDailyFeedKg" DECIMAL(12,3),
    "dailyGasM3" DECIMAL(12,3),
    "cookingHoursPerDay" DECIMAL(12,3),
    "servesPeople" INTEGER,
    "minAnimals" JSONB DEFAULT '{}',
    "footprintLengthM" DECIMAL(12,3),
    "footprintWidthM" DECIMAL(12,3),
    "waterPerDayL" DECIMAL(12,3),
    "reactorWarrantyMonths" INTEGER DEFAULT 60,
    "partsWarrantyMonths" INTEGER DEFAULT 12,
    "installHours" DECIMAL(12,3),
    "surveyKind" TEXT NOT NULL DEFAULT 'survey_farm',
    "preInstallTemplate" TEXT,
    "installTemplate" TEXT,
    "product" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DigesterSpec_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KitComponent" (
    "id" TEXT NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "kit" TEXT,
    "component" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KitComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "contact" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT '',
    "leadTimeDays" INTEGER DEFAULT 14,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLocation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL DEFAULT 'warehouse',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "branch" TEXT,
    "technician" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLevel" (
    "id" TEXT NOT NULL,
    "onHand" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "reorderPoint" INTEGER NOT NULL DEFAULT 0,
    "product" TEXT,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'receipt',
    "quantity" INTEGER NOT NULL,
    "unitCostAmount" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL DEFAULT '',
    "refType" TEXT NOT NULL DEFAULT '',
    "refId" TEXT NOT NULL DEFAULT '',
    "product" TEXT,
    "location" TEXT,
    "user" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SerializedUnit" (
    "id" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'in_stock',
    "product" TEXT,
    "location" TEXT,
    "order" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SerializedUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "number" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 0,
    "expectedAt" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "supplier" TEXT,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderLine" (
    "id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "receivedQuantity" INTEGER DEFAULT 0,
    "unitCostAmount" INTEGER NOT NULL DEFAULT 0,
    "purchaseOrder" TEXT,
    "product" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "number" TEXT,
    "type" TEXT NOT NULL DEFAULT 'household',
    "name" TEXT NOT NULL DEFAULT '',
    "organisationName" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "altPhone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "preferredLanguage" TEXT NOT NULL DEFAULT 'en',
    "preferredContact" TEXT NOT NULL DEFAULT 'whatsapp',
    "contactConsent" BOOLEAN NOT NULL DEFAULT false,
    "consentAt" TIMESTAMP(3),
    "storeCreditAmount" INTEGER NOT NULL DEFAULT 0,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "notes" TEXT NOT NULL DEFAULT '',
    "referralCode" TEXT,
    "user" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerContact" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "customer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Home',
    "addressLine" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "region" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT '',
    "postcode" TEXT NOT NULL DEFAULT '',
    "lat" DECIMAL(9,6),
    "lng" DECIMAL(9,6),
    "directions" TEXT NOT NULL DEFAULT '',
    "siteType" TEXT NOT NULL DEFAULT 'home',
    "animals" JSONB DEFAULT '{}',
    "kitchenWasteKgPerDay" DECIMAL(12,3),
    "peopleServed" INTEGER,
    "waterSource" TEXT NOT NULL DEFAULT '',
    "waterDistanceM" DECIMAL(12,3),
    "currentFuels" JSONB DEFAULT '[]',
    "monthlyFuelSpendAmount" INTEGER NOT NULL DEFAULT 0,
    "kitchenDistanceM" DECIMAL(12,3),
    "customer" TEXT,
    "serviceArea" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Site_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SizingAssessment" (
    "id" TEXT NOT NULL,
    "inputs" JSONB,
    "dailyFeedKg" DECIMAL(12,3),
    "estimatedGasM3" DECIMAL(12,3),
    "cookingHours" DECIMAL(12,3),
    "fuelSavedAmountPerMonth" INTEGER NOT NULL DEFAULT 0,
    "paybackMonths" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'public',
    "resultJson" JSONB,
    "recommendedProduct" TEXT,
    "lead" TEXT,
    "site" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SizingAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "number" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "version" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'website',
    "interest" TEXT NOT NULL DEFAULT 'home',
    "message" TEXT NOT NULL DEFAULT '',
    "firstResponseDueAt" TIMESTAMP(3),
    "firstContactAt" TIMESTAMP(3),
    "lostReason" TEXT NOT NULL DEFAULT '',
    "utm" JSONB DEFAULT '{}',
    "customer" TEXT,
    "site" TEXT,
    "assignedTo" TEXT,
    "branch" TEXT,
    "referral" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadActivity" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'call',
    "summary" TEXT NOT NULL DEFAULT '',
    "outcome" TEXT NOT NULL DEFAULT '',
    "at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "lead" TEXT,
    "user" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "casVersion" INTEGER NOT NULL DEFAULT 0,
    "kind" TEXT NOT NULL DEFAULT 'sale',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "publicCode" TEXT,
    "validUntil" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "terms" TEXT NOT NULL DEFAULT '',
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "subtotalAmount" INTEGER NOT NULL DEFAULT 0,
    "discountAmount" INTEGER NOT NULL DEFAULT 0,
    "taxAmount" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "signedName" TEXT NOT NULL DEFAULT '',
    "signedAt" TIMESTAMP(3),
    "signedIp" TEXT NOT NULL DEFAULT '',
    "sentAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "declinedReason" TEXT NOT NULL DEFAULT '',
    "isLatest" BOOLEAN NOT NULL DEFAULT true,
    "latestKey" TEXT,
    "lead" TEXT,
    "customer" TEXT,
    "site" TEXT,
    "preparedBy" TEXT,
    "approvedBy" TEXT,
    "acceptedOption" TEXT,
    "acceptedPlanOffer" TEXT,
    "ticket" TEXT,
    "previous" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteOption" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER DEFAULT 0,
    "isRecommended" BOOLEAN NOT NULL DEFAULT false,
    "subtotalAmount" INTEGER NOT NULL DEFAULT 0,
    "discountAmount" INTEGER NOT NULL DEFAULT 0,
    "taxAmount" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "quote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteLine" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'product',
    "description" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER DEFAULT 1,
    "unitAmount" INTEGER NOT NULL DEFAULT 0,
    "taxAmount" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "snapshot" JSONB,
    "option" TEXT,
    "product" TEXT,
    "incentiveProgram" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentPlanTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'instalments',
    "depositPercent" DECIMAL(6,2) NOT NULL DEFAULT 20,
    "instalmentCount" INTEGER NOT NULL DEFAULT 0,
    "frequency" TEXT NOT NULL DEFAULT 'monthly',
    "planFeePercent" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "minOrderAmount" INTEGER NOT NULL DEFAULT 0,
    "milestones" JSONB DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentPlanTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuotePlanOffer" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "depositAmount" INTEGER NOT NULL DEFAULT 0,
    "instalmentAmount" INTEGER NOT NULL DEFAULT 0,
    "instalmentCount" INTEGER DEFAULT 0,
    "frequency" TEXT NOT NULL DEFAULT '',
    "planFeeAmount" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "schedule" JSONB,
    "option" TEXT,
    "template" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuotePlanOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncentiveProgram" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'subsidy',
    "amountType" TEXT NOT NULL DEFAULT 'fixed',
    "amountValue" TEXT NOT NULL DEFAULT '0',
    "capacityTable" JSONB DEFAULT '[]',
    "capAmount" INTEGER,
    "treatment" TEXT NOT NULL DEFAULT 'off_price_now',
    "requiredDocuments" JSONB DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "infoUrl" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncentiveProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncentiveApplication" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 0,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "treatment" TEXT NOT NULL DEFAULT '',
    "reference" TEXT NOT NULL DEFAULT '',
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "rejectionHandling" TEXT NOT NULL DEFAULT '',
    "program" TEXT,
    "order" TEXT,
    "customer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncentiveApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cart" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "fulfilment" TEXT NOT NULL DEFAULT 'delivery',
    "address" JSONB,
    "deliveryFeeAmount" INTEGER NOT NULL DEFAULT 0,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "name" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3),
    "customer" TEXT,
    "pickupBranch" TEXT,
    "serviceArea" TEXT,
    "createdBy" TEXT,
    "order" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartLine" (
    "id" TEXT NOT NULL,
    "quantity" INTEGER DEFAULT 1,
    "unitAmount" INTEGER NOT NULL DEFAULT 0,
    "cart" TEXT,
    "product" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CartLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "number" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending_payment',
    "version" INTEGER NOT NULL DEFAULT 0,
    "channel" TEXT NOT NULL DEFAULT 'quote',
    "publicCode" TEXT,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "subtotalAmount" INTEGER NOT NULL DEFAULT 0,
    "discountAmount" INTEGER NOT NULL DEFAULT 0,
    "deliveryAmount" INTEGER NOT NULL DEFAULT 0,
    "taxAmount" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "paidAmount" INTEGER NOT NULL DEFAULT 0,
    "refundedAmount" INTEGER NOT NULL DEFAULT 0,
    "surveyFeeCreditAmount" INTEGER NOT NULL DEFAULT 0,
    "fulfilment" TEXT NOT NULL DEFAULT 'install',
    "shippingAddress" JSONB,
    "trackingNumber" TEXT NOT NULL DEFAULT '',
    "carrier" TEXT NOT NULL DEFAULT '',
    "cancelReason" TEXT NOT NULL DEFAULT '',
    "cancelledAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "pickedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "customer" TEXT,
    "site" TEXT,
    "quote" TEXT,
    "branch" TEXT,
    "salesAgent" TEXT,
    "plan" TEXT,
    "referral" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'product',
    "name" TEXT NOT NULL DEFAULT '',
    "sku" TEXT NOT NULL DEFAULT '',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitAmount" INTEGER NOT NULL DEFAULT 0,
    "taxAmount" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "warrantyMonths" INTEGER NOT NULL DEFAULT 0,
    "snapshot" JSONB,
    "fulfilledQuantity" INTEGER NOT NULL DEFAULT 0,
    "returnedQuantity" INTEGER NOT NULL DEFAULT 0,
    "requiresInstallation" BOOLEAN NOT NULL DEFAULT false,
    "order" TEXT,
    "product" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderChange" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "version" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL DEFAULT '',
    "differenceAmount" INTEGER DEFAULT 0,
    "linesJson" JSONB,
    "order" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "code" TEXT NOT NULL DEFAULT '',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "instructions" TEXT NOT NULL DEFAULT '',
    "credentialEnv" JSONB DEFAULT '{}',
    "sortOrder" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentSession" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "version" INTEGER NOT NULL DEFAULT 0,
    "publicCode" TEXT,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "purpose" TEXT NOT NULL DEFAULT 'deposit',
    "description" TEXT NOT NULL DEFAULT '',
    "providerRef" TEXT NOT NULL DEFAULT '',
    "clientSecret" TEXT NOT NULL DEFAULT '',
    "idempotencyKeyHash" TEXT,
    "expiresAt" TIMESTAMP(3),
    "capturedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "providerStatus" TEXT NOT NULL DEFAULT '',
    "provider" TEXT,
    "order" TEXT,
    "subscription" TEXT,
    "ticket" TEXT,
    "quote" TEXT,
    "visit" TEXT,
    "orderChange" TEXT,
    "customer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'submitted',
    "version" INTEGER NOT NULL DEFAULT 0,
    "method" TEXT NOT NULL DEFAULT 'card',
    "amount" INTEGER NOT NULL DEFAULT 0,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "reference" TEXT NOT NULL DEFAULT '',
    "referenceKey" TEXT,
    "payerPhone" TEXT NOT NULL DEFAULT '',
    "receivedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "receiptNumber" TEXT,
    "rejectReason" TEXT NOT NULL DEFAULT '',
    "refundedAmount" INTEGER NOT NULL DEFAULT 0,
    "allocatedAmount" INTEGER NOT NULL DEFAULT 0,
    "provider" TEXT,
    "session" TEXT,
    "order" TEXT,
    "customer" TEXT,
    "verifiedBy" TEXT,
    "collectedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "kind" TEXT NOT NULL DEFAULT 'order',
    "payment" TEXT,
    "order" TEXT,
    "installment" TEXT,
    "subscription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "version" INTEGER NOT NULL DEFAULT 0,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "reason" TEXT NOT NULL DEFAULT '',
    "providerRef" TEXT NOT NULL DEFAULT '',
    "payoutReference" TEXT NOT NULL DEFAULT '',
    "payment" TEXT,
    "order" TEXT,
    "issuedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentWebhookEvent" (
    "id" TEXT NOT NULL,
    "providerEventId" TEXT,
    "type" TEXT NOT NULL DEFAULT '',
    "payloadHash" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'received',
    "processedAt" TIMESTAMP(3),
    "error" TEXT NOT NULL DEFAULT '',
    "provider" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentPlan" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "version" INTEGER NOT NULL DEFAULT 0,
    "kind" TEXT NOT NULL DEFAULT 'instalments',
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "principalAmount" INTEGER NOT NULL DEFAULT 0,
    "planFeeAmount" INTEGER NOT NULL DEFAULT 0,
    "depositAmount" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "paidAmount" INTEGER NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3),
    "frequency" TEXT NOT NULL DEFAULT '',
    "nextDueAt" TIMESTAMP(3),
    "customer" TEXT,
    "template" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Installment" (
    "id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "label" TEXT NOT NULL DEFAULT '',
    "dueDate" TIMESTAMP(3),
    "amount" INTEGER NOT NULL DEFAULT 0,
    "paidAmount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "version" INTEGER NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMP(3),
    "waivedReason" TEXT NOT NULL DEFAULT '',
    "trigger" TEXT NOT NULL DEFAULT 'date',
    "remindedAt" TIMESTAMP(3),
    "plan" TEXT,
    "invoice" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Installment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "number" TEXT,
    "status" TEXT NOT NULL DEFAULT 'issued',
    "version" INTEGER NOT NULL DEFAULT 0,
    "issuedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "totalAmount" INTEGER NOT NULL DEFAULT 0,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "linesJson" JSONB,
    "order" TEXT,
    "customer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'survey_farm',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChecklistTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL,
    "prompt" TEXT NOT NULL DEFAULT '',
    "helpText" TEXT NOT NULL DEFAULT '',
    "inputType" TEXT NOT NULL DEFAULT 'yes_no',
    "choices" JSONB DEFAULT '[]',
    "unit" TEXT NOT NULL DEFAULT '',
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER DEFAULT 0,
    "template" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visit" (
    "id" TEXT NOT NULL,
    "number" TEXT,
    "type" TEXT NOT NULL DEFAULT 'survey',
    "status" TEXT NOT NULL DEFAULT 'requested',
    "version" INTEGER NOT NULL DEFAULT 0,
    "scheduledDate" DATE,
    "slotIndex" INTEGER,
    "windowStart" TIMESTAMP(3),
    "windowEnd" TIMESTAMP(3),
    "checkInAt" TIMESTAMP(3),
    "checkInLat" DECIMAL(9,6),
    "checkInLng" DECIMAL(9,6),
    "checkOutAt" TIMESTAMP(3),
    "checklistAnswers" JSONB,
    "outcome" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "customerSignature" TEXT NOT NULL DEFAULT '',
    "signedName" TEXT NOT NULL DEFAULT '',
    "publicCode" TEXT,
    "cancelReason" TEXT NOT NULL DEFAULT '',
    "cancelledBy" TEXT NOT NULL DEFAULT '',
    "feeAmount" INTEGER NOT NULL DEFAULT 0,
    "feePaid" BOOLEAN NOT NULL DEFAULT false,
    "dueAt" TIMESTAMP(3),
    "customer" TEXT,
    "site" TEXT,
    "lead" TEXT,
    "installation" TEXT,
    "ticket" TEXT,
    "system" TEXT,
    "subscription" TEXT,
    "branch" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitSlotUsage" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "slotIndex" INTEGER NOT NULL,
    "technician" TEXT,
    "visit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitSlotUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TechnicianTimeOff" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "technician" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TechnicianTimeOff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteSurvey" (
    "id" TEXT NOT NULL,
    "feasibility" TEXT NOT NULL DEFAULT 'feasible',
    "measuredFeedKgPerDay" DECIMAL(12,3),
    "waterOk" BOOLEAN NOT NULL DEFAULT false,
    "spaceOk" BOOLEAN NOT NULL DEFAULT false,
    "soilType" TEXT NOT NULL DEFAULT '',
    "floodRisk" TEXT NOT NULL DEFAULT '',
    "pipeRunM" DECIMAL(12,3),
    "pumpNeeded" BOOLEAN NOT NULL DEFAULT false,
    "extraWork" JSONB,
    "notes" TEXT NOT NULL DEFAULT '',
    "visit" TEXT,
    "site" TEXT,
    "recommendedProduct" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteSurvey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Installation" (
    "id" TEXT NOT NULL,
    "number" TEXT,
    "status" TEXT NOT NULL DEFAULT 'awaiting_site_prep',
    "version" INTEGER NOT NULL DEFAULT 0,
    "targetDate" DATE,
    "holdReason" TEXT NOT NULL DEFAULT '',
    "heldFrom" TEXT NOT NULL DEFAULT '',
    "overrideReason" TEXT NOT NULL DEFAULT '',
    "order" TEXT,
    "site" TEXT,
    "customer" TEXT,
    "product" TEXT,
    "system" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Installation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SitePrepTask" (
    "id" TEXT NOT NULL,
    "prompt" TEXT NOT NULL DEFAULT '',
    "helpText" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "version" INTEGER NOT NULL DEFAULT 0,
    "doneAt" TIMESTAMP(3),
    "doneBy" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "installation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SitePrepTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingRecord" (
    "id" TEXT NOT NULL,
    "traineeName" TEXT NOT NULL DEFAULT '',
    "relationToOwner" TEXT NOT NULL DEFAULT '',
    "topics" JSONB,
    "language" TEXT NOT NULL DEFAULT '',
    "at" TIMESTAMP(3),
    "visit" TEXT,
    "system" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartUsage" (
    "id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitAmount" INTEGER NOT NULL DEFAULT 0,
    "chargeable" BOOLEAN NOT NULL DEFAULT false,
    "visit" TEXT,
    "product" TEXT,
    "fromLocation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstalledSystem" (
    "id" TEXT NOT NULL,
    "number" TEXT,
    "publicCode" TEXT,
    "status" TEXT NOT NULL DEFAULT 'commissioned',
    "version" INTEGER NOT NULL DEFAULT 0,
    "statusReason" TEXT NOT NULL DEFAULT '',
    "installedAt" TIMESTAMP(3),
    "commissionedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "lastCheckResult" TEXT NOT NULL DEFAULT '',
    "nextCheckDueAt" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "customer" TEXT,
    "site" TEXT,
    "product" TEXT,
    "serializedUnit" TEXT,
    "order" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstalledSystem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarrantyCoverage" (
    "id" TEXT NOT NULL,
    "component" TEXT NOT NULL DEFAULT 'reactor',
    "version" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "terms" TEXT NOT NULL DEFAULT '',
    "isVoid" BOOLEAN NOT NULL DEFAULT false,
    "voidReason" TEXT NOT NULL DEFAULT '',
    "system" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarrantyCoverage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemReading" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'customer',
    "working" BOOLEAN NOT NULL DEFAULT true,
    "cookingHours" DECIMAL(12,3),
    "pressureKpa" DECIMAL(12,3),
    "feedKg" DECIMAL(12,3),
    "waterL" DECIMAL(12,3),
    "slurryUsed" BOOLEAN NOT NULL DEFAULT false,
    "problem" TEXT NOT NULL DEFAULT '',
    "system" TEXT,
    "visit" TEXT,
    "recordedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceTicket" (
    "id" TEXT NOT NULL,
    "number" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "version" INTEGER NOT NULL DEFAULT 0,
    "channel" TEXT NOT NULL DEFAULT 'portal',
    "category" TEXT NOT NULL DEFAULT 'no_gas',
    "severity" TEXT NOT NULL DEFAULT 'normal',
    "description" TEXT NOT NULL DEFAULT '',
    "callbackPhone" TEXT NOT NULL DEFAULT '',
    "responseDueAt" TIMESTAMP(3),
    "firstResponseAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "resolution" TEXT NOT NULL DEFAULT '',
    "warrantyDecision" TEXT NOT NULL DEFAULT 'pending',
    "warrantyNote" TEXT NOT NULL DEFAULT '',
    "supplierClaim" BOOLEAN NOT NULL DEFAULT false,
    "partReplaced" TEXT NOT NULL DEFAULT '',
    "customerConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "system" TEXT,
    "customer" TEXT,
    "assignedTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'note',
    "body" TEXT NOT NULL DEFAULT '',
    "isCustomerVisible" BOOLEAN NOT NULL DEFAULT false,
    "ticket" TEXT,
    "user" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServicePlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "slug" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "priceAmount" INTEGER NOT NULL DEFAULT 0,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "billing" TEXT NOT NULL DEFAULT 'yearly',
    "visitsPerYear" INTEGER DEFAULT 1,
    "partsDiscountPercent" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "priorityResponse" BOOLEAN NOT NULL DEFAULT false,
    "includedItems" JSONB DEFAULT '[]',
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServicePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServicePlanSubscription" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_payment',
    "version" INTEGER NOT NULL DEFAULT 0,
    "priceAmount" INTEGER NOT NULL DEFAULT 0,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "billing" TEXT NOT NULL DEFAULT '',
    "startedAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "visitsUsed" INTEGER DEFAULT 0,
    "autoRenew" BOOLEAN NOT NULL DEFAULT true,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT NOT NULL DEFAULT '',
    "refundAmount" INTEGER NOT NULL DEFAULT 0,
    "plan" TEXT,
    "system" TEXT,
    "customer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServicePlanSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TroubleshootingGuide" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "slug" TEXT NOT NULL DEFAULT '',
    "symptomCategory" TEXT NOT NULL DEFAULT 'other',
    "steps" JSONB NOT NULL DEFAULT '[{"type":"paragraph","children":[{"text":""}]}]',
    "stepsText" TEXT NOT NULL DEFAULT '',
    "language" TEXT NOT NULL DEFAULT 'en',
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TroubleshootingGuide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resource" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'manual',
    "file_filesize" INTEGER,
    "file_filename" TEXT,
    "url" TEXT NOT NULL DEFAULT '',
    "language" TEXT NOT NULL DEFAULT 'en',
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "version" INTEGER NOT NULL DEFAULT 0,
    "rewardAmount" INTEGER NOT NULL DEFAULT 0,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "rewardKind" TEXT NOT NULL DEFAULT '',
    "qualifiedAt" TIMESTAMP(3),
    "rewardedAt" TIMESTAMP(3),
    "voidReason" TEXT NOT NULL DEFAULT '',
    "referrer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commission" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'accrued',
    "version" INTEGER NOT NULL DEFAULT 0,
    "basisAmount" INTEGER NOT NULL DEFAULT 0,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "rule" JSONB,
    "approvedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "clawedBackAt" TIMESTAMP(3),
    "agent" TEXT,
    "order" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Commission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL DEFAULT 'percent_of_order',
    "value" TEXT NOT NULL DEFAULT '0',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Story" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "slug" TEXT NOT NULL DEFAULT '',
    "customerName" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT NOT NULL DEFAULT '',
    "savingsText" TEXT NOT NULL DEFAULT '',
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Faq" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL DEFAULT '',
    "answer" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'general',
    "sortOrder" INTEGER DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Faq_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthApp" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "clientId" TEXT NOT NULL DEFAULT '',
    "clientSecret" TEXT NOT NULL DEFAULT '',
    "tokenEndpointAuthMethod" TEXT DEFAULT 'client_secret_post',
    "redirectUris" JSONB DEFAULT '[]',
    "scopes" JSONB DEFAULT '["mcp:read","mcp:write"]',
    "webhookUrl" TEXT NOT NULL DEFAULT '',
    "status" TEXT DEFAULT 'active',
    "installUrl" TEXT NOT NULL DEFAULT '',
    "uninstallUrl" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB DEFAULT '{}',
    "developerEmail" TEXT NOT NULL DEFAULT '',
    "privacyPolicyUrl" TEXT NOT NULL DEFAULT '',
    "termsOfServiceUrl" TEXT NOT NULL DEFAULT '',
    "supportUrl" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthApp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthToken" (
    "id" TEXT NOT NULL,
    "tokenType" TEXT NOT NULL,
    "token" TEXT NOT NULL DEFAULT '',
    "clientId" TEXT NOT NULL DEFAULT '',
    "user" TEXT,
    "scopes" JSONB DEFAULT '[]',
    "redirectUri" TEXT NOT NULL DEFAULT '',
    "resource" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3),
    "isRevoked" TEXT DEFAULT 'false',
    "authorizationCode" TEXT NOT NULL DEFAULT '',
    "refreshToken" TEXT NOT NULL DEFAULT '',
    "accessToken" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL DEFAULT '',
    "codeChallenge" TEXT NOT NULL DEFAULT '',
    "codeChallengeMethod" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_User_visits" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_Product_compatibleWith" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_Product_resources" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_Product_guides" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_Installment_sessions" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_branch_idx" ON "User"("branch");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_code_key" ON "Branch"("code");

-- CreateIndex
CREATE INDEX "ServiceArea_branch_idx" ON "ServiceArea"("branch");

-- CreateIndex
CREATE UNIQUE INDEX "Sequence_key_key" ON "Sequence"("key");

-- CreateIndex
CREATE UNIQUE INDEX "CommandReceipt_keyHash_key" ON "CommandReceipt"("keyHash");

-- CreateIndex
CREATE INDEX "AuditEvent_action_idx" ON "AuditEvent"("action");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_idx" ON "AuditEvent"("entityType");

-- CreateIndex
CREATE INDEX "AuditEvent_entityId_idx" ON "AuditEvent"("entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_actor_idx" ON "AuditEvent"("actor");

-- CreateIndex
CREATE INDEX "ContactLog_customer_idx" ON "ContactLog"("customer");

-- CreateIndex
CREATE INDEX "ContactLog_user_idx" ON "ContactLog"("user");

-- CreateIndex
CREATE INDEX "ContactLog_relatedId_idx" ON "ContactLog"("relatedId");

-- CreateIndex
CREATE INDEX "Media_visit_idx" ON "Media"("visit");

-- CreateIndex
CREATE INDEX "Media_site_idx" ON "Media"("site");

-- CreateIndex
CREATE INDEX "Media_ticket_idx" ON "Media"("ticket");

-- CreateIndex
CREATE INDEX "Media_installation_idx" ON "Media"("installation");

-- CreateIndex
CREATE INDEX "Media_product_idx" ON "Media"("product");

-- CreateIndex
CREATE INDEX "Media_incentiveApplication_idx" ON "Media"("incentiveApplication");

-- CreateIndex
CREATE INDEX "Media_sitePrepTask_idx" ON "Media"("sitePrepTask");

-- CreateIndex
CREATE INDEX "Media_uploadedBy_idx" ON "Media"("uploadedBy");

-- CreateIndex
CREATE INDEX "WebhookEvent_endpoint_idx" ON "WebhookEvent"("endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCategory_slug_key" ON "ProductCategory"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_category_idx" ON "Product"("category");

-- CreateIndex
CREATE UNIQUE INDEX "DigesterSpec_product_key" ON "DigesterSpec"("product");

-- CreateIndex
CREATE INDEX "DigesterSpec_preInstallTemplate_idx" ON "DigesterSpec"("preInstallTemplate");

-- CreateIndex
CREATE INDEX "DigesterSpec_installTemplate_idx" ON "DigesterSpec"("installTemplate");

-- CreateIndex
CREATE INDEX "KitComponent_kit_idx" ON "KitComponent"("kit");

-- CreateIndex
CREATE INDEX "KitComponent_component_idx" ON "KitComponent"("component");

-- CreateIndex
CREATE UNIQUE INDEX "StockLocation_technician_key" ON "StockLocation"("technician");

-- CreateIndex
CREATE INDEX "StockLocation_branch_idx" ON "StockLocation"("branch");

-- CreateIndex
CREATE INDEX "StockLevel_product_idx" ON "StockLevel"("product");

-- CreateIndex
CREATE INDEX "StockLevel_location_idx" ON "StockLevel"("location");

-- CreateIndex
CREATE UNIQUE INDEX "StockLevel_product_location_key" ON "StockLevel"("product", "location");

-- CreateIndex
CREATE INDEX "StockMovement_type_idx" ON "StockMovement"("type");

-- CreateIndex
CREATE INDEX "StockMovement_product_idx" ON "StockMovement"("product");

-- CreateIndex
CREATE INDEX "StockMovement_location_idx" ON "StockMovement"("location");

-- CreateIndex
CREATE INDEX "StockMovement_user_idx" ON "StockMovement"("user");

-- CreateIndex
CREATE UNIQUE INDEX "SerializedUnit_serialNumber_key" ON "SerializedUnit"("serialNumber");

-- CreateIndex
CREATE INDEX "SerializedUnit_status_idx" ON "SerializedUnit"("status");

-- CreateIndex
CREATE INDEX "SerializedUnit_product_idx" ON "SerializedUnit"("product");

-- CreateIndex
CREATE INDEX "SerializedUnit_location_idx" ON "SerializedUnit"("location");

-- CreateIndex
CREATE INDEX "SerializedUnit_order_idx" ON "SerializedUnit"("order");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_number_key" ON "PurchaseOrder"("number");

-- CreateIndex
CREATE INDEX "PurchaseOrder_status_idx" ON "PurchaseOrder"("status");

-- CreateIndex
CREATE INDEX "PurchaseOrder_supplier_idx" ON "PurchaseOrder"("supplier");

-- CreateIndex
CREATE INDEX "PurchaseOrder_location_idx" ON "PurchaseOrder"("location");

-- CreateIndex
CREATE INDEX "PurchaseOrderLine_purchaseOrder_idx" ON "PurchaseOrderLine"("purchaseOrder");

-- CreateIndex
CREATE INDEX "PurchaseOrderLine_product_idx" ON "PurchaseOrderLine"("product");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_number_key" ON "Customer"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_referralCode_key" ON "Customer"("referralCode");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_user_key" ON "Customer"("user");

-- CreateIndex
CREATE INDEX "CustomerContact_customer_idx" ON "CustomerContact"("customer");

-- CreateIndex
CREATE INDEX "Site_customer_idx" ON "Site"("customer");

-- CreateIndex
CREATE INDEX "Site_serviceArea_idx" ON "Site"("serviceArea");

-- CreateIndex
CREATE INDEX "SizingAssessment_source_idx" ON "SizingAssessment"("source");

-- CreateIndex
CREATE INDEX "SizingAssessment_recommendedProduct_idx" ON "SizingAssessment"("recommendedProduct");

-- CreateIndex
CREATE INDEX "SizingAssessment_lead_idx" ON "SizingAssessment"("lead");

-- CreateIndex
CREATE INDEX "SizingAssessment_site_idx" ON "SizingAssessment"("site");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_number_key" ON "Lead"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_referral_key" ON "Lead"("referral");

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- CreateIndex
CREATE INDEX "Lead_customer_idx" ON "Lead"("customer");

-- CreateIndex
CREATE INDEX "Lead_site_idx" ON "Lead"("site");

-- CreateIndex
CREATE INDEX "Lead_assignedTo_idx" ON "Lead"("assignedTo");

-- CreateIndex
CREATE INDEX "Lead_branch_idx" ON "Lead"("branch");

-- CreateIndex
CREATE INDEX "LeadActivity_type_idx" ON "LeadActivity"("type");

-- CreateIndex
CREATE INDEX "LeadActivity_lead_idx" ON "LeadActivity"("lead");

-- CreateIndex
CREATE INDEX "LeadActivity_user_idx" ON "LeadActivity"("user");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_publicCode_key" ON "Quote"("publicCode");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_latestKey_key" ON "Quote"("latestKey");

-- CreateIndex
CREATE INDEX "Quote_number_idx" ON "Quote"("number");

-- CreateIndex
CREATE INDEX "Quote_kind_idx" ON "Quote"("kind");

-- CreateIndex
CREATE INDEX "Quote_status_idx" ON "Quote"("status");

-- CreateIndex
CREATE INDEX "Quote_lead_idx" ON "Quote"("lead");

-- CreateIndex
CREATE INDEX "Quote_customer_idx" ON "Quote"("customer");

-- CreateIndex
CREATE INDEX "Quote_site_idx" ON "Quote"("site");

-- CreateIndex
CREATE INDEX "Quote_preparedBy_idx" ON "Quote"("preparedBy");

-- CreateIndex
CREATE INDEX "Quote_approvedBy_idx" ON "Quote"("approvedBy");

-- CreateIndex
CREATE INDEX "Quote_acceptedOption_idx" ON "Quote"("acceptedOption");

-- CreateIndex
CREATE INDEX "Quote_acceptedPlanOffer_idx" ON "Quote"("acceptedPlanOffer");

-- CreateIndex
CREATE INDEX "Quote_ticket_idx" ON "Quote"("ticket");

-- CreateIndex
CREATE INDEX "Quote_previous_idx" ON "Quote"("previous");

-- CreateIndex
CREATE INDEX "QuoteOption_quote_idx" ON "QuoteOption"("quote");

-- CreateIndex
CREATE INDEX "QuoteLine_kind_idx" ON "QuoteLine"("kind");

-- CreateIndex
CREATE INDEX "QuoteLine_option_idx" ON "QuoteLine"("option");

-- CreateIndex
CREATE INDEX "QuoteLine_product_idx" ON "QuoteLine"("product");

-- CreateIndex
CREATE INDEX "QuoteLine_incentiveProgram_idx" ON "QuoteLine"("incentiveProgram");

-- CreateIndex
CREATE INDEX "QuotePlanOffer_option_idx" ON "QuotePlanOffer"("option");

-- CreateIndex
CREATE INDEX "QuotePlanOffer_template_idx" ON "QuotePlanOffer"("template");

-- CreateIndex
CREATE INDEX "IncentiveApplication_status_idx" ON "IncentiveApplication"("status");

-- CreateIndex
CREATE INDEX "IncentiveApplication_program_idx" ON "IncentiveApplication"("program");

-- CreateIndex
CREATE INDEX "IncentiveApplication_order_idx" ON "IncentiveApplication"("order");

-- CreateIndex
CREATE INDEX "IncentiveApplication_customer_idx" ON "IncentiveApplication"("customer");

-- CreateIndex
CREATE UNIQUE INDEX "Cart_tokenHash_key" ON "Cart"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "Cart_order_key" ON "Cart"("order");

-- CreateIndex
CREATE INDEX "Cart_status_idx" ON "Cart"("status");

-- CreateIndex
CREATE INDEX "Cart_fulfilment_idx" ON "Cart"("fulfilment");

-- CreateIndex
CREATE INDEX "Cart_customer_idx" ON "Cart"("customer");

-- CreateIndex
CREATE INDEX "Cart_pickupBranch_idx" ON "Cart"("pickupBranch");

-- CreateIndex
CREATE INDEX "Cart_serviceArea_idx" ON "Cart"("serviceArea");

-- CreateIndex
CREATE INDEX "Cart_createdBy_idx" ON "Cart"("createdBy");

-- CreateIndex
CREATE INDEX "CartLine_cart_idx" ON "CartLine"("cart");

-- CreateIndex
CREATE INDEX "CartLine_product_idx" ON "CartLine"("product");

-- CreateIndex
CREATE UNIQUE INDEX "Order_number_key" ON "Order"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Order_publicCode_key" ON "Order"("publicCode");

-- CreateIndex
CREATE UNIQUE INDEX "Order_quote_key" ON "Order"("quote");

-- CreateIndex
CREATE UNIQUE INDEX "Order_plan_key" ON "Order"("plan");

-- CreateIndex
CREATE UNIQUE INDEX "Order_referral_key" ON "Order"("referral");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Order_channel_idx" ON "Order"("channel");

-- CreateIndex
CREATE INDEX "Order_fulfilment_idx" ON "Order"("fulfilment");

-- CreateIndex
CREATE INDEX "Order_customer_idx" ON "Order"("customer");

-- CreateIndex
CREATE INDEX "Order_site_idx" ON "Order"("site");

-- CreateIndex
CREATE INDEX "Order_branch_idx" ON "Order"("branch");

-- CreateIndex
CREATE INDEX "Order_salesAgent_idx" ON "Order"("salesAgent");

-- CreateIndex
CREATE INDEX "OrderLine_kind_idx" ON "OrderLine"("kind");

-- CreateIndex
CREATE INDEX "OrderLine_order_idx" ON "OrderLine"("order");

-- CreateIndex
CREATE INDEX "OrderLine_product_idx" ON "OrderLine"("product");

-- CreateIndex
CREATE INDEX "OrderChange_status_idx" ON "OrderChange"("status");

-- CreateIndex
CREATE INDEX "OrderChange_order_idx" ON "OrderChange"("order");

-- CreateIndex
CREATE INDEX "OrderChange_createdBy_idx" ON "OrderChange"("createdBy");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentProvider_code_key" ON "PaymentProvider"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentSession_publicCode_key" ON "PaymentSession"("publicCode");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentSession_idempotencyKeyHash_key" ON "PaymentSession"("idempotencyKeyHash");

-- CreateIndex
CREATE INDEX "PaymentSession_status_idx" ON "PaymentSession"("status");

-- CreateIndex
CREATE INDEX "PaymentSession_purpose_idx" ON "PaymentSession"("purpose");

-- CreateIndex
CREATE INDEX "PaymentSession_provider_idx" ON "PaymentSession"("provider");

-- CreateIndex
CREATE INDEX "PaymentSession_order_idx" ON "PaymentSession"("order");

-- CreateIndex
CREATE INDEX "PaymentSession_subscription_idx" ON "PaymentSession"("subscription");

-- CreateIndex
CREATE INDEX "PaymentSession_ticket_idx" ON "PaymentSession"("ticket");

-- CreateIndex
CREATE INDEX "PaymentSession_quote_idx" ON "PaymentSession"("quote");

-- CreateIndex
CREATE INDEX "PaymentSession_visit_idx" ON "PaymentSession"("visit");

-- CreateIndex
CREATE INDEX "PaymentSession_orderChange_idx" ON "PaymentSession"("orderChange");

-- CreateIndex
CREATE INDEX "PaymentSession_customer_idx" ON "PaymentSession"("customer");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_referenceKey_key" ON "Payment"("referenceKey");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_receiptNumber_key" ON "Payment"("receiptNumber");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_method_idx" ON "Payment"("method");

-- CreateIndex
CREATE INDEX "Payment_provider_idx" ON "Payment"("provider");

-- CreateIndex
CREATE INDEX "Payment_session_idx" ON "Payment"("session");

-- CreateIndex
CREATE INDEX "Payment_order_idx" ON "Payment"("order");

-- CreateIndex
CREATE INDEX "Payment_customer_idx" ON "Payment"("customer");

-- CreateIndex
CREATE INDEX "Payment_verifiedBy_idx" ON "Payment"("verifiedBy");

-- CreateIndex
CREATE INDEX "Payment_collectedBy_idx" ON "Payment"("collectedBy");

-- CreateIndex
CREATE INDEX "PaymentAllocation_kind_idx" ON "PaymentAllocation"("kind");

-- CreateIndex
CREATE INDEX "PaymentAllocation_payment_idx" ON "PaymentAllocation"("payment");

-- CreateIndex
CREATE INDEX "PaymentAllocation_order_idx" ON "PaymentAllocation"("order");

-- CreateIndex
CREATE INDEX "PaymentAllocation_installment_idx" ON "PaymentAllocation"("installment");

-- CreateIndex
CREATE INDEX "PaymentAllocation_subscription_idx" ON "PaymentAllocation"("subscription");

-- CreateIndex
CREATE INDEX "Refund_status_idx" ON "Refund"("status");

-- CreateIndex
CREATE INDEX "Refund_payment_idx" ON "Refund"("payment");

-- CreateIndex
CREATE INDEX "Refund_order_idx" ON "Refund"("order");

-- CreateIndex
CREATE INDEX "Refund_issuedBy_idx" ON "Refund"("issuedBy");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentWebhookEvent_providerEventId_key" ON "PaymentWebhookEvent"("providerEventId");

-- CreateIndex
CREATE INDEX "PaymentWebhookEvent_status_idx" ON "PaymentWebhookEvent"("status");

-- CreateIndex
CREATE INDEX "PaymentWebhookEvent_provider_idx" ON "PaymentWebhookEvent"("provider");

-- CreateIndex
CREATE INDEX "PaymentPlan_status_idx" ON "PaymentPlan"("status");

-- CreateIndex
CREATE INDEX "PaymentPlan_kind_idx" ON "PaymentPlan"("kind");

-- CreateIndex
CREATE INDEX "PaymentPlan_customer_idx" ON "PaymentPlan"("customer");

-- CreateIndex
CREATE INDEX "PaymentPlan_template_idx" ON "PaymentPlan"("template");

-- CreateIndex
CREATE UNIQUE INDEX "Installment_invoice_key" ON "Installment"("invoice");

-- CreateIndex
CREATE INDEX "Installment_status_idx" ON "Installment"("status");

-- CreateIndex
CREATE INDEX "Installment_trigger_idx" ON "Installment"("trigger");

-- CreateIndex
CREATE INDEX "Installment_plan_idx" ON "Installment"("plan");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "Invoice_order_idx" ON "Invoice"("order");

-- CreateIndex
CREATE INDEX "Invoice_customer_idx" ON "Invoice"("customer");

-- CreateIndex
CREATE INDEX "ChecklistItem_template_idx" ON "ChecklistItem"("template");

-- CreateIndex
CREATE UNIQUE INDEX "Visit_number_key" ON "Visit"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Visit_publicCode_key" ON "Visit"("publicCode");

-- CreateIndex
CREATE INDEX "Visit_type_idx" ON "Visit"("type");

-- CreateIndex
CREATE INDEX "Visit_status_idx" ON "Visit"("status");

-- CreateIndex
CREATE INDEX "Visit_customer_idx" ON "Visit"("customer");

-- CreateIndex
CREATE INDEX "Visit_site_idx" ON "Visit"("site");

-- CreateIndex
CREATE INDEX "Visit_lead_idx" ON "Visit"("lead");

-- CreateIndex
CREATE INDEX "Visit_installation_idx" ON "Visit"("installation");

-- CreateIndex
CREATE INDEX "Visit_ticket_idx" ON "Visit"("ticket");

-- CreateIndex
CREATE INDEX "Visit_system_idx" ON "Visit"("system");

-- CreateIndex
CREATE INDEX "Visit_subscription_idx" ON "Visit"("subscription");

-- CreateIndex
CREATE INDEX "Visit_branch_idx" ON "Visit"("branch");

-- CreateIndex
CREATE INDEX "VisitSlotUsage_technician_idx" ON "VisitSlotUsage"("technician");

-- CreateIndex
CREATE INDEX "VisitSlotUsage_visit_idx" ON "VisitSlotUsage"("visit");

-- CreateIndex
CREATE UNIQUE INDEX "VisitSlotUsage_technician_date_slotIndex_key" ON "VisitSlotUsage"("technician", "date", "slotIndex");

-- CreateIndex
CREATE INDEX "TechnicianTimeOff_technician_idx" ON "TechnicianTimeOff"("technician");

-- CreateIndex
CREATE UNIQUE INDEX "SiteSurvey_visit_key" ON "SiteSurvey"("visit");

-- CreateIndex
CREATE INDEX "SiteSurvey_feasibility_idx" ON "SiteSurvey"("feasibility");

-- CreateIndex
CREATE INDEX "SiteSurvey_site_idx" ON "SiteSurvey"("site");

-- CreateIndex
CREATE INDEX "SiteSurvey_recommendedProduct_idx" ON "SiteSurvey"("recommendedProduct");

-- CreateIndex
CREATE UNIQUE INDEX "Installation_number_key" ON "Installation"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Installation_order_key" ON "Installation"("order");

-- CreateIndex
CREATE UNIQUE INDEX "Installation_system_key" ON "Installation"("system");

-- CreateIndex
CREATE INDEX "Installation_status_idx" ON "Installation"("status");

-- CreateIndex
CREATE INDEX "Installation_site_idx" ON "Installation"("site");

-- CreateIndex
CREATE INDEX "Installation_customer_idx" ON "Installation"("customer");

-- CreateIndex
CREATE INDEX "Installation_product_idx" ON "Installation"("product");

-- CreateIndex
CREATE INDEX "SitePrepTask_status_idx" ON "SitePrepTask"("status");

-- CreateIndex
CREATE INDEX "SitePrepTask_installation_idx" ON "SitePrepTask"("installation");

-- CreateIndex
CREATE INDEX "TrainingRecord_visit_idx" ON "TrainingRecord"("visit");

-- CreateIndex
CREATE INDEX "TrainingRecord_system_idx" ON "TrainingRecord"("system");

-- CreateIndex
CREATE INDEX "PartUsage_visit_idx" ON "PartUsage"("visit");

-- CreateIndex
CREATE INDEX "PartUsage_product_idx" ON "PartUsage"("product");

-- CreateIndex
CREATE INDEX "PartUsage_fromLocation_idx" ON "PartUsage"("fromLocation");

-- CreateIndex
CREATE UNIQUE INDEX "InstalledSystem_number_key" ON "InstalledSystem"("number");

-- CreateIndex
CREATE UNIQUE INDEX "InstalledSystem_publicCode_key" ON "InstalledSystem"("publicCode");

-- CreateIndex
CREATE UNIQUE INDEX "InstalledSystem_serializedUnit_key" ON "InstalledSystem"("serializedUnit");

-- CreateIndex
CREATE INDEX "InstalledSystem_status_idx" ON "InstalledSystem"("status");

-- CreateIndex
CREATE INDEX "InstalledSystem_customer_idx" ON "InstalledSystem"("customer");

-- CreateIndex
CREATE INDEX "InstalledSystem_site_idx" ON "InstalledSystem"("site");

-- CreateIndex
CREATE INDEX "InstalledSystem_product_idx" ON "InstalledSystem"("product");

-- CreateIndex
CREATE INDEX "InstalledSystem_order_idx" ON "InstalledSystem"("order");

-- CreateIndex
CREATE INDEX "WarrantyCoverage_component_idx" ON "WarrantyCoverage"("component");

-- CreateIndex
CREATE INDEX "WarrantyCoverage_system_idx" ON "WarrantyCoverage"("system");

-- CreateIndex
CREATE INDEX "SystemReading_source_idx" ON "SystemReading"("source");

-- CreateIndex
CREATE INDEX "SystemReading_system_idx" ON "SystemReading"("system");

-- CreateIndex
CREATE INDEX "SystemReading_visit_idx" ON "SystemReading"("visit");

-- CreateIndex
CREATE INDEX "SystemReading_recordedBy_idx" ON "SystemReading"("recordedBy");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceTicket_number_key" ON "ServiceTicket"("number");

-- CreateIndex
CREATE INDEX "ServiceTicket_status_idx" ON "ServiceTicket"("status");

-- CreateIndex
CREATE INDEX "ServiceTicket_channel_idx" ON "ServiceTicket"("channel");

-- CreateIndex
CREATE INDEX "ServiceTicket_category_idx" ON "ServiceTicket"("category");

-- CreateIndex
CREATE INDEX "ServiceTicket_severity_idx" ON "ServiceTicket"("severity");

-- CreateIndex
CREATE INDEX "ServiceTicket_warrantyDecision_idx" ON "ServiceTicket"("warrantyDecision");

-- CreateIndex
CREATE INDEX "ServiceTicket_system_idx" ON "ServiceTicket"("system");

-- CreateIndex
CREATE INDEX "ServiceTicket_customer_idx" ON "ServiceTicket"("customer");

-- CreateIndex
CREATE INDEX "ServiceTicket_assignedTo_idx" ON "ServiceTicket"("assignedTo");

-- CreateIndex
CREATE INDEX "TicketEvent_type_idx" ON "TicketEvent"("type");

-- CreateIndex
CREATE INDEX "TicketEvent_ticket_idx" ON "TicketEvent"("ticket");

-- CreateIndex
CREATE INDEX "TicketEvent_user_idx" ON "TicketEvent"("user");

-- CreateIndex
CREATE UNIQUE INDEX "ServicePlan_slug_key" ON "ServicePlan"("slug");

-- CreateIndex
CREATE INDEX "ServicePlanSubscription_status_idx" ON "ServicePlanSubscription"("status");

-- CreateIndex
CREATE INDEX "ServicePlanSubscription_plan_idx" ON "ServicePlanSubscription"("plan");

-- CreateIndex
CREATE INDEX "ServicePlanSubscription_system_idx" ON "ServicePlanSubscription"("system");

-- CreateIndex
CREATE INDEX "ServicePlanSubscription_customer_idx" ON "ServicePlanSubscription"("customer");

-- CreateIndex
CREATE UNIQUE INDEX "TroubleshootingGuide_slug_key" ON "TroubleshootingGuide"("slug");

-- CreateIndex
CREATE INDEX "Referral_status_idx" ON "Referral"("status");

-- CreateIndex
CREATE INDEX "Referral_referrer_idx" ON "Referral"("referrer");

-- CreateIndex
CREATE INDEX "Commission_status_idx" ON "Commission"("status");

-- CreateIndex
CREATE INDEX "Commission_agent_idx" ON "Commission"("agent");

-- CreateIndex
CREATE INDEX "Commission_order_idx" ON "Commission"("order");

-- CreateIndex
CREATE UNIQUE INDEX "Story_slug_key" ON "Story"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthApp_clientId_key" ON "OAuthApp"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthToken_token_key" ON "OAuthToken"("token");

-- CreateIndex
CREATE INDEX "OAuthToken_clientId_idx" ON "OAuthToken"("clientId");

-- CreateIndex
CREATE INDEX "OAuthToken_user_idx" ON "OAuthToken"("user");

-- CreateIndex
CREATE UNIQUE INDEX "_User_visits_AB_unique" ON "_User_visits"("A", "B");

-- CreateIndex
CREATE INDEX "_User_visits_B_index" ON "_User_visits"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_Product_compatibleWith_AB_unique" ON "_Product_compatibleWith"("A", "B");

-- CreateIndex
CREATE INDEX "_Product_compatibleWith_B_index" ON "_Product_compatibleWith"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_Product_resources_AB_unique" ON "_Product_resources"("A", "B");

-- CreateIndex
CREATE INDEX "_Product_resources_B_index" ON "_Product_resources"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_Product_guides_AB_unique" ON "_Product_guides"("A", "B");

-- CreateIndex
CREATE INDEX "_Product_guides_B_index" ON "_Product_guides"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_Installment_sessions_AB_unique" ON "_Installment_sessions"("A", "B");

-- CreateIndex
CREATE INDEX "_Installment_sessions_B_index" ON "_Installment_sessions"("B");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_role_fkey" FOREIGN KEY ("role") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_branch_fkey" FOREIGN KEY ("branch") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceArea" ADD CONSTRAINT "ServiceArea_branch_fkey" FOREIGN KEY ("branch") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actor_fkey" FOREIGN KEY ("actor") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactLog" ADD CONSTRAINT "ContactLog_customer_fkey" FOREIGN KEY ("customer") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactLog" ADD CONSTRAINT "ContactLog_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_visit_fkey" FOREIGN KEY ("visit") REFERENCES "Visit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_site_fkey" FOREIGN KEY ("site") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_ticket_fkey" FOREIGN KEY ("ticket") REFERENCES "ServiceTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_installation_fkey" FOREIGN KEY ("installation") REFERENCES "Installation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_product_fkey" FOREIGN KEY ("product") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_incentiveApplication_fkey" FOREIGN KEY ("incentiveApplication") REFERENCES "IncentiveApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_sitePrepTask_fkey" FOREIGN KEY ("sitePrepTask") REFERENCES "SitePrepTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_endpoint_fkey" FOREIGN KEY ("endpoint") REFERENCES "WebhookEndpoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_category_fkey" FOREIGN KEY ("category") REFERENCES "ProductCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigesterSpec" ADD CONSTRAINT "DigesterSpec_preInstallTemplate_fkey" FOREIGN KEY ("preInstallTemplate") REFERENCES "ChecklistTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigesterSpec" ADD CONSTRAINT "DigesterSpec_installTemplate_fkey" FOREIGN KEY ("installTemplate") REFERENCES "ChecklistTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigesterSpec" ADD CONSTRAINT "DigesterSpec_product_fkey" FOREIGN KEY ("product") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitComponent" ADD CONSTRAINT "KitComponent_kit_fkey" FOREIGN KEY ("kit") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KitComponent" ADD CONSTRAINT "KitComponent_component_fkey" FOREIGN KEY ("component") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLocation" ADD CONSTRAINT "StockLocation_branch_fkey" FOREIGN KEY ("branch") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLocation" ADD CONSTRAINT "StockLocation_technician_fkey" FOREIGN KEY ("technician") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_product_fkey" FOREIGN KEY ("product") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_location_fkey" FOREIGN KEY ("location") REFERENCES "StockLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_product_fkey" FOREIGN KEY ("product") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_location_fkey" FOREIGN KEY ("location") REFERENCES "StockLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerializedUnit" ADD CONSTRAINT "SerializedUnit_product_fkey" FOREIGN KEY ("product") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerializedUnit" ADD CONSTRAINT "SerializedUnit_location_fkey" FOREIGN KEY ("location") REFERENCES "StockLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerializedUnit" ADD CONSTRAINT "SerializedUnit_order_fkey" FOREIGN KEY ("order") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplier_fkey" FOREIGN KEY ("supplier") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_location_fkey" FOREIGN KEY ("location") REFERENCES "StockLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_purchaseOrder_fkey" FOREIGN KEY ("purchaseOrder") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_product_fkey" FOREIGN KEY ("product") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerContact" ADD CONSTRAINT "CustomerContact_customer_fkey" FOREIGN KEY ("customer") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_customer_fkey" FOREIGN KEY ("customer") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Site" ADD CONSTRAINT "Site_serviceArea_fkey" FOREIGN KEY ("serviceArea") REFERENCES "ServiceArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SizingAssessment" ADD CONSTRAINT "SizingAssessment_recommendedProduct_fkey" FOREIGN KEY ("recommendedProduct") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SizingAssessment" ADD CONSTRAINT "SizingAssessment_lead_fkey" FOREIGN KEY ("lead") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SizingAssessment" ADD CONSTRAINT "SizingAssessment_site_fkey" FOREIGN KEY ("site") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_customer_fkey" FOREIGN KEY ("customer") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_site_fkey" FOREIGN KEY ("site") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_branch_fkey" FOREIGN KEY ("branch") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_referral_fkey" FOREIGN KEY ("referral") REFERENCES "Referral"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_lead_fkey" FOREIGN KEY ("lead") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_lead_fkey" FOREIGN KEY ("lead") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_customer_fkey" FOREIGN KEY ("customer") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_site_fkey" FOREIGN KEY ("site") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_preparedBy_fkey" FOREIGN KEY ("preparedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_acceptedOption_fkey" FOREIGN KEY ("acceptedOption") REFERENCES "QuoteOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_acceptedPlanOffer_fkey" FOREIGN KEY ("acceptedPlanOffer") REFERENCES "QuotePlanOffer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_ticket_fkey" FOREIGN KEY ("ticket") REFERENCES "ServiceTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_previous_fkey" FOREIGN KEY ("previous") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteOption" ADD CONSTRAINT "QuoteOption_quote_fkey" FOREIGN KEY ("quote") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_option_fkey" FOREIGN KEY ("option") REFERENCES "QuoteOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_product_fkey" FOREIGN KEY ("product") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_incentiveProgram_fkey" FOREIGN KEY ("incentiveProgram") REFERENCES "IncentiveProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotePlanOffer" ADD CONSTRAINT "QuotePlanOffer_option_fkey" FOREIGN KEY ("option") REFERENCES "QuoteOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuotePlanOffer" ADD CONSTRAINT "QuotePlanOffer_template_fkey" FOREIGN KEY ("template") REFERENCES "PaymentPlanTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentiveApplication" ADD CONSTRAINT "IncentiveApplication_program_fkey" FOREIGN KEY ("program") REFERENCES "IncentiveProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentiveApplication" ADD CONSTRAINT "IncentiveApplication_order_fkey" FOREIGN KEY ("order") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncentiveApplication" ADD CONSTRAINT "IncentiveApplication_customer_fkey" FOREIGN KEY ("customer") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_customer_fkey" FOREIGN KEY ("customer") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_pickupBranch_fkey" FOREIGN KEY ("pickupBranch") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_serviceArea_fkey" FOREIGN KEY ("serviceArea") REFERENCES "ServiceArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_order_fkey" FOREIGN KEY ("order") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartLine" ADD CONSTRAINT "CartLine_cart_fkey" FOREIGN KEY ("cart") REFERENCES "Cart"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartLine" ADD CONSTRAINT "CartLine_product_fkey" FOREIGN KEY ("product") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customer_fkey" FOREIGN KEY ("customer") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_site_fkey" FOREIGN KEY ("site") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_quote_fkey" FOREIGN KEY ("quote") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_branch_fkey" FOREIGN KEY ("branch") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_salesAgent_fkey" FOREIGN KEY ("salesAgent") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_plan_fkey" FOREIGN KEY ("plan") REFERENCES "PaymentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_referral_fkey" FOREIGN KEY ("referral") REFERENCES "Referral"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_order_fkey" FOREIGN KEY ("order") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_product_fkey" FOREIGN KEY ("product") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderChange" ADD CONSTRAINT "OrderChange_order_fkey" FOREIGN KEY ("order") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderChange" ADD CONSTRAINT "OrderChange_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSession" ADD CONSTRAINT "PaymentSession_provider_fkey" FOREIGN KEY ("provider") REFERENCES "PaymentProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSession" ADD CONSTRAINT "PaymentSession_order_fkey" FOREIGN KEY ("order") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSession" ADD CONSTRAINT "PaymentSession_subscription_fkey" FOREIGN KEY ("subscription") REFERENCES "ServicePlanSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSession" ADD CONSTRAINT "PaymentSession_ticket_fkey" FOREIGN KEY ("ticket") REFERENCES "ServiceTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSession" ADD CONSTRAINT "PaymentSession_quote_fkey" FOREIGN KEY ("quote") REFERENCES "Quote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSession" ADD CONSTRAINT "PaymentSession_visit_fkey" FOREIGN KEY ("visit") REFERENCES "Visit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSession" ADD CONSTRAINT "PaymentSession_orderChange_fkey" FOREIGN KEY ("orderChange") REFERENCES "OrderChange"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSession" ADD CONSTRAINT "PaymentSession_customer_fkey" FOREIGN KEY ("customer") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_provider_fkey" FOREIGN KEY ("provider") REFERENCES "PaymentProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_session_fkey" FOREIGN KEY ("session") REFERENCES "PaymentSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_order_fkey" FOREIGN KEY ("order") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_customer_fkey" FOREIGN KEY ("customer") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_verifiedBy_fkey" FOREIGN KEY ("verifiedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_collectedBy_fkey" FOREIGN KEY ("collectedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_payment_fkey" FOREIGN KEY ("payment") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_order_fkey" FOREIGN KEY ("order") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_installment_fkey" FOREIGN KEY ("installment") REFERENCES "Installment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_subscription_fkey" FOREIGN KEY ("subscription") REFERENCES "ServicePlanSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_payment_fkey" FOREIGN KEY ("payment") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_order_fkey" FOREIGN KEY ("order") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_issuedBy_fkey" FOREIGN KEY ("issuedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentWebhookEvent" ADD CONSTRAINT "PaymentWebhookEvent_provider_fkey" FOREIGN KEY ("provider") REFERENCES "PaymentProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentPlan" ADD CONSTRAINT "PaymentPlan_customer_fkey" FOREIGN KEY ("customer") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentPlan" ADD CONSTRAINT "PaymentPlan_template_fkey" FOREIGN KEY ("template") REFERENCES "PaymentPlanTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installment" ADD CONSTRAINT "Installment_plan_fkey" FOREIGN KEY ("plan") REFERENCES "PaymentPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installment" ADD CONSTRAINT "Installment_invoice_fkey" FOREIGN KEY ("invoice") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_order_fkey" FOREIGN KEY ("order") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customer_fkey" FOREIGN KEY ("customer") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_template_fkey" FOREIGN KEY ("template") REFERENCES "ChecklistTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_customer_fkey" FOREIGN KEY ("customer") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_site_fkey" FOREIGN KEY ("site") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_lead_fkey" FOREIGN KEY ("lead") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_installation_fkey" FOREIGN KEY ("installation") REFERENCES "Installation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_ticket_fkey" FOREIGN KEY ("ticket") REFERENCES "ServiceTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_system_fkey" FOREIGN KEY ("system") REFERENCES "InstalledSystem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_subscription_fkey" FOREIGN KEY ("subscription") REFERENCES "ServicePlanSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_branch_fkey" FOREIGN KEY ("branch") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitSlotUsage" ADD CONSTRAINT "VisitSlotUsage_technician_fkey" FOREIGN KEY ("technician") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitSlotUsage" ADD CONSTRAINT "VisitSlotUsage_visit_fkey" FOREIGN KEY ("visit") REFERENCES "Visit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TechnicianTimeOff" ADD CONSTRAINT "TechnicianTimeOff_technician_fkey" FOREIGN KEY ("technician") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteSurvey" ADD CONSTRAINT "SiteSurvey_visit_fkey" FOREIGN KEY ("visit") REFERENCES "Visit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteSurvey" ADD CONSTRAINT "SiteSurvey_site_fkey" FOREIGN KEY ("site") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteSurvey" ADD CONSTRAINT "SiteSurvey_recommendedProduct_fkey" FOREIGN KEY ("recommendedProduct") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installation" ADD CONSTRAINT "Installation_order_fkey" FOREIGN KEY ("order") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installation" ADD CONSTRAINT "Installation_site_fkey" FOREIGN KEY ("site") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installation" ADD CONSTRAINT "Installation_customer_fkey" FOREIGN KEY ("customer") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installation" ADD CONSTRAINT "Installation_product_fkey" FOREIGN KEY ("product") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Installation" ADD CONSTRAINT "Installation_system_fkey" FOREIGN KEY ("system") REFERENCES "InstalledSystem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SitePrepTask" ADD CONSTRAINT "SitePrepTask_installation_fkey" FOREIGN KEY ("installation") REFERENCES "Installation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingRecord" ADD CONSTRAINT "TrainingRecord_visit_fkey" FOREIGN KEY ("visit") REFERENCES "Visit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingRecord" ADD CONSTRAINT "TrainingRecord_system_fkey" FOREIGN KEY ("system") REFERENCES "InstalledSystem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartUsage" ADD CONSTRAINT "PartUsage_visit_fkey" FOREIGN KEY ("visit") REFERENCES "Visit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartUsage" ADD CONSTRAINT "PartUsage_product_fkey" FOREIGN KEY ("product") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartUsage" ADD CONSTRAINT "PartUsage_fromLocation_fkey" FOREIGN KEY ("fromLocation") REFERENCES "StockLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstalledSystem" ADD CONSTRAINT "InstalledSystem_customer_fkey" FOREIGN KEY ("customer") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstalledSystem" ADD CONSTRAINT "InstalledSystem_site_fkey" FOREIGN KEY ("site") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstalledSystem" ADD CONSTRAINT "InstalledSystem_product_fkey" FOREIGN KEY ("product") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstalledSystem" ADD CONSTRAINT "InstalledSystem_serializedUnit_fkey" FOREIGN KEY ("serializedUnit") REFERENCES "SerializedUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstalledSystem" ADD CONSTRAINT "InstalledSystem_order_fkey" FOREIGN KEY ("order") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyCoverage" ADD CONSTRAINT "WarrantyCoverage_system_fkey" FOREIGN KEY ("system") REFERENCES "InstalledSystem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemReading" ADD CONSTRAINT "SystemReading_system_fkey" FOREIGN KEY ("system") REFERENCES "InstalledSystem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemReading" ADD CONSTRAINT "SystemReading_visit_fkey" FOREIGN KEY ("visit") REFERENCES "Visit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemReading" ADD CONSTRAINT "SystemReading_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTicket" ADD CONSTRAINT "ServiceTicket_system_fkey" FOREIGN KEY ("system") REFERENCES "InstalledSystem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTicket" ADD CONSTRAINT "ServiceTicket_customer_fkey" FOREIGN KEY ("customer") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTicket" ADD CONSTRAINT "ServiceTicket_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketEvent" ADD CONSTRAINT "TicketEvent_ticket_fkey" FOREIGN KEY ("ticket") REFERENCES "ServiceTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketEvent" ADD CONSTRAINT "TicketEvent_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePlanSubscription" ADD CONSTRAINT "ServicePlanSubscription_plan_fkey" FOREIGN KEY ("plan") REFERENCES "ServicePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePlanSubscription" ADD CONSTRAINT "ServicePlanSubscription_system_fkey" FOREIGN KEY ("system") REFERENCES "InstalledSystem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServicePlanSubscription" ADD CONSTRAINT "ServicePlanSubscription_customer_fkey" FOREIGN KEY ("customer") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrer_fkey" FOREIGN KEY ("referrer") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_agent_fkey" FOREIGN KEY ("agent") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_order_fkey" FOREIGN KEY ("order") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthToken" ADD CONSTRAINT "OAuthToken_user_fkey" FOREIGN KEY ("user") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_User_visits" ADD CONSTRAINT "_User_visits_A_fkey" FOREIGN KEY ("A") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_User_visits" ADD CONSTRAINT "_User_visits_B_fkey" FOREIGN KEY ("B") REFERENCES "Visit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Product_compatibleWith" ADD CONSTRAINT "_Product_compatibleWith_A_fkey" FOREIGN KEY ("A") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Product_compatibleWith" ADD CONSTRAINT "_Product_compatibleWith_B_fkey" FOREIGN KEY ("B") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Product_resources" ADD CONSTRAINT "_Product_resources_A_fkey" FOREIGN KEY ("A") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Product_resources" ADD CONSTRAINT "_Product_resources_B_fkey" FOREIGN KEY ("B") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Product_guides" ADD CONSTRAINT "_Product_guides_A_fkey" FOREIGN KEY ("A") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Product_guides" ADD CONSTRAINT "_Product_guides_B_fkey" FOREIGN KEY ("B") REFERENCES "TroubleshootingGuide"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Installment_sessions" ADD CONSTRAINT "_Installment_sessions_A_fkey" FOREIGN KEY ("A") REFERENCES "Installment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_Installment_sessions" ADD CONSTRAINT "_Installment_sessions_B_fkey" FOREIGN KEY ("B") REFERENCES "PaymentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Check constraints (dissertation 5.8). Prisma does not model these; it leaves them alone on later diffs.
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_onHand_nonnegative" CHECK ("onHand" >= 0);
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_reserved_within_onHand" CHECK ("reserved" >= 0 AND "reserved" <= "onHand");
ALTER TABLE "Order" ADD CONSTRAINT "Order_refunded_within_paid" CHECK ("refundedAmount" >= 0 AND "refundedAmount" <= "paidAmount");
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_refunded_within_amount" CHECK ("refundedAmount" >= 0 AND "refundedAmount" <= "amount");
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_allocated_within_amount" CHECK ("allocatedAmount" >= 0 AND "allocatedAmount" <= "amount");
ALTER TABLE "Installment" ADD CONSTRAINT "Installment_paid_within_amount" CHECK ("paidAmount" >= 0 AND "paidAmount" <= "amount");
ALTER TABLE "PaymentPlan" ADD CONSTRAINT "PaymentPlan_paid_within_total" CHECK ("paidAmount" >= 0 AND "paidAmount" <= "totalAmount");
ALTER TABLE "PaymentSession" ADD CONSTRAINT "PaymentSession_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_store_credit_nonnegative" CHECK ("storeCreditAmount" >= 0);
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_received_within_quantity" CHECK ("receivedQuantity" >= 0 AND "receivedQuantity" <= "quantity");
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_returned_within_quantity" CHECK ("returnedQuantity" >= 0 AND "returnedQuantity" <= "quantity");
