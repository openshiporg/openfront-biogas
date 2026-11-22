/**
 * Country presets for first-run onboarding (dissertation section 9). Names are invented; none is a real
 * firm. Amounts are integers in the currency's minor units. The United States preset (Juniper Biogas)
 * is the one the live site is seeded with, so card payment runs end to end in USD.
 */
export type CountryCode = 'US' | 'KE' | 'IN' | 'PK'

type Kit = { sku: string; name: string; m3: number; tech: string; price: number; install: number; gas: number; hours: number; people: number; feedMin: number; feedMax: number; cattle: number; reactorWarranty: number; surveyKind: string; requiresSurvey: boolean; sellOnline: boolean }

export type Preset = {
  country: CountryCode
  company: { name: string; legalName: string; currencyCode: string; timezone: string; units: 'metric' | 'imperial'; phone: string; whatsappNumber: string; email: string; address: string; taxRatePercent: string; taxLabel: string; taxInclusive: boolean; surveyFeeAmount: number; referralRewardAmount: number; heroText: string; about: string }
  branches: { code: string; name: string; address: string; phone: string; lat: string; lng: string; areas: { name: string; region: string; postcodes: string[]; deliveryFeeAmount: number; installSurchargeAmount: number }[] }[]
  kits: Kit[]
  institutional: Kit
  /** Parts and appliances: price in minor units. */
  parts: { sku: string; name: string; price: number; category: 'stoves' | 'gas-line' | 'filters' | 'appliances' | 'spares'; warranty: number; stock: number }[]
  planFromMonthly: { label: string; depositPercent: string; count: number; feePercent: string }[]
  servicePlans: { slug: string; name: string; price: number; visits: number; discount: string; priority: boolean; items: string[] }[]
  incentives: { name: string; kind: string; amountType: string; amountValue: string; capacityTable?: { maxM3: number; amount: number }[]; capAmount?: number | null; treatment: string; infoUrl: string; requiredDocuments: string[] }[]
  paymentInstructions: { mobile_money: string; bank_transfer: string; cash: string }
  people: { first: string[]; last: string[]; towns: string[]; region: string; phonePrefix: string; emailDomain: string; postcodes: string[] }
  commissionPercent: string
}

const PARTS = (k: number, stock = 1) => [
  { sku: 'STV-1', name: 'Single-burner biogas stove', price: 45 * k, category: 'stoves', warranty: 12, stock: 40 * stock },
  { sku: 'STV-2', name: 'Double-burner biogas stove', price: 85 * k, category: 'stoves', warranty: 12, stock: 30 * stock },
  { sku: 'FLT-H2S', name: 'H₂S filter housing', price: 38 * k, category: 'filters', warranty: 12, stock: 25 * stock },
  { sku: 'FLT-MED', name: 'H₂S filter refill media (1 kg)', price: 12 * k, category: 'filters', warranty: 0, stock: 120 * stock },
  { sku: 'PMP-BST', name: 'Gas booster pump', price: 165 * k, category: 'appliances', warranty: 12, stock: 10 * stock },
  { sku: 'GAU-PRS', name: 'Gas pressure gauge', price: 18 * k, category: 'gas-line', warranty: 12, stock: 40 * stock },
  { sku: 'PIPE-M', name: 'Gas pipe (per metre)', price: 2 * k, category: 'gas-line', warranty: 12, stock: 600 * stock },
  { sku: 'TRAP-W', name: 'Water trap', price: 14 * k, category: 'gas-line', warranty: 12, stock: 35 * stock },
  { sku: 'LMP-1', name: 'Biogas lamp', price: 32 * k, category: 'appliances', warranty: 12, stock: 20 * stock },
  { sku: 'HTR-W', name: 'Biogas water heater', price: 240 * k, category: 'appliances', warranty: 24, stock: 8 * stock },
  { sku: 'INL-F', name: 'Feed inlet funnel', price: 28 * k, category: 'spares', warranty: 12, stock: 20 * stock },
  { sku: 'VLV-SL', name: 'Slurry outlet valve', price: 22 * k, category: 'spares', warranty: 12, stock: 25 * stock },
  { sku: 'VLV-GAS', name: 'Gas ball valve', price: 9 * k, category: 'gas-line', warranty: 12, stock: 60 * stock },
  { sku: 'KIT-RPR', name: 'Bag repair kit', price: 26 * k, category: 'spares', warranty: 0, stock: 30 * stock },
  { sku: 'HOSE-ST', name: 'Stove connector hose (1.5 m)', price: 7 * k, category: 'gas-line', warranty: 12, stock: 80 * stock },
  { sku: 'TEE-20', name: 'Pipe tee and elbow set', price: 6 * k, category: 'gas-line', warranty: 12, stock: 90 * stock },
  { sku: 'BRN-RNG', name: 'Replacement burner ring', price: 11 * k, category: 'spares', warranty: 6, stock: 50 * stock },
  { sku: 'MTR-GAS', name: 'Biogas flow meter', price: 75 * k, category: 'appliances', warranty: 12, stock: 12 * stock },
  { sku: 'SLR-BAG', name: 'Slurry collection bag', price: 34 * k, category: 'spares', warranty: 6, stock: 15 * stock },
  { sku: 'TAPE-PT', name: 'Gas-rated thread tape', price: 3 * k, category: 'spares', warranty: 0, stock: 150 * stock },
] as Preset['parts']

const kits = (k: number, install: number): Kit[] => [
  { sku: 'HB-2', name: 'HomeBag 2', m3: 2, tech: 'prefab_bag', price: 1290 * k, install: install, gas: 0.6, hours: 2, people: 4, feedMin: 10, feedMax: 20, cattle: 1, reactorWarranty: 60, surveyKind: 'survey_farm', requiresSurvey: false, sellOnline: true },
  { sku: 'HB-4', name: 'HomeBag 4', m3: 4, tech: 'prefab_bag', price: 1890 * k, install: install, gas: 1.2, hours: 4, people: 6, feedMin: 20, feedMax: 40, cattle: 2, reactorWarranty: 60, surveyKind: 'survey_farm', requiresSurvey: true, sellOnline: false },
  { sku: 'FT-8', name: 'FarmTube 8', m3: 8, tech: 'prefab_tube', price: 3490 * k, install: Math.round(install * 1.6), gas: 2.4, hours: 7, people: 10, feedMin: 40, feedMax: 80, cattle: 4, reactorWarranty: 84, surveyKind: 'survey_farm', requiresSurvey: true, sellOnline: false },
  { sku: 'FT-15', name: 'FarmTube 15', m3: 15, tech: 'prefab_tube', price: 5990 * k, install: Math.round(install * 2.4), gas: 4.5, hours: 12, people: 18, feedMin: 75, feedMax: 150, cattle: 8, reactorWarranty: 84, surveyKind: 'survey_farm', requiresSurvey: true, sellOnline: false },
  { sku: 'FD-40', name: 'FixedDome 40', m3: 40, tech: 'fixed_dome', price: 14900 * k, install: Math.round(install * 6), gas: 12, hours: 30, people: 45, feedMin: 200, feedMax: 400, cattle: 20, reactorWarranty: 120, surveyKind: 'survey_farm', requiresSurvey: true, sellOnline: false },
]

const inst = (k: number, install: number): Kit => ({ sku: 'KC-20', name: 'KitchenCycle 20 (institutional)', m3: 20, tech: 'container', price: 18900 * k, install: Math.round(install * 5), gas: 6, hours: 16, people: 300, feedMin: 100, feedMax: 200, cattle: 0, reactorWarranty: 120, surveyKind: 'survey_kitchen', requiresSurvey: true, sellOnline: false })

const SERVICE = (k: number) => [
  { slug: 'care', name: 'Care', price: 89 * k, visits: 1, discount: '10', priority: false, items: ['One maintenance visit a year', '10% off parts', 'Gas-line pressure test'] },
  { slug: 'care-plus', name: 'Care Plus', price: 169 * k, visits: 2, discount: '15', priority: true, items: ['Two maintenance visits a year', 'Priority response', '15% off parts', 'Free H₂S filter media'] },
]

const PLANS = [
  { label: 'Pay in full', depositPercent: '100', count: 0, feePercent: '0' },
  { label: '20% deposit + 8 monthly', depositPercent: '20', count: 8, feePercent: '4' },
  { label: '10% deposit + 24 monthly', depositPercent: '10', count: 24, feePercent: '22' },
]

// US: dollars → cents (×100). Juniper Biogas: home kits from $1,290, or from $59 a month.
export const PRESETS: Record<CountryCode, Preset> = {
  US: {
    country: 'US',
    company: { name: 'Juniper Biogas', legalName: 'Juniper Biogas LLC', currencyCode: 'USD', timezone: 'America/Chicago', units: 'imperial', phone: '+1 (512) 555-0142', whatsappNumber: '+15125550142', email: 'hello@juniperbiogas.com', address: '2180 Farm to Market Rd 1626, Buda, TX 78610', taxRatePercent: '8.25', taxLabel: 'Sales tax', taxInclusive: false, surveyFeeAmount: 0, referralRewardAmount: 10000, heroText: 'Cook on gas from your own farm and kitchen waste. Home kits from $1,290, or from $59 a month.', about: 'Juniper Biogas sells, installs and services small biodigesters for homesteads, farms and institutional kitchens across Central Texas. Every system is surveyed, installed and commissioned by our own crews, and we come back to check it keeps working.' },
    branches: [
      { code: 'BUD', name: 'Buda (Hays County)', address: '2180 FM 1626, Buda, TX 78610', phone: '+1 (512) 555-0142', lat: '30.0852', lng: '-97.8403', areas: [{ name: 'Hays & Travis', region: 'Texas', postcodes: ['786', '787'], deliveryFeeAmount: 4900, installSurchargeAmount: 0 }] },
      { code: 'WAC', name: 'Waco (McLennan County)', address: '901 Franklin Ave, Waco, TX 76701', phone: '+1 (254) 555-0177', lat: '31.5530', lng: '-97.1386', areas: [{ name: 'McLennan & Bell', region: 'Texas', postcodes: ['765', '766', '767'], deliveryFeeAmount: 5900, installSurchargeAmount: 15000 }] },
    ],
    kits: kits(100, 39000),
    institutional: inst(100, 39000),
    parts: PARTS(100),
    planFromMonthly: PLANS,
    servicePlans: SERVICE(100),
    incentives: [{ name: 'USDA REAP grant', kind: 'grant', amountType: 'percent', amountValue: '25', capAmount: 50000000, treatment: 'paid_to_customer_later', infoUrl: 'https://www.rd.usda.gov/programs-services/energy-programs/rural-energy-america-program-renewable-energy-systems-energy-efficiency-improvement-guaranteed-loans', requiredDocuments: ['Signed quote', 'Proof of agricultural producer status'] }],
    paymentInstructions: { mobile_money: 'Zelle or Venmo to hello@juniperbiogas.com, with your order number as the note.', bank_transfer: 'ACH or wire to Juniper Biogas LLC, First Hays Community Bank, routing 114 000 093, account 3301 2284 61. Put your order number in the memo.', cash: 'Pay our crew in person; you get a printed receipt.' },
    people: { first: ['Maria', 'James', 'Linda', 'Robert', 'Ana', 'David', 'Grace', 'Luis', 'Karen', 'Tom', 'Rosa', 'Ben', 'Hannah', 'Carlos', 'Ellen', 'Marcus'], last: ['Alvarez', 'Whitfield', 'Nguyen', 'Kowalski', 'Hernandez', 'Brooks', 'Delgado', 'Fischer', 'Okafor', 'Reyes', 'Lindqvist', 'Carter'], towns: ['Buda', 'Kyle', 'Dripping Springs', 'Wimberley', 'Lockhart', 'Waco', 'McGregor', 'Temple'], region: 'Texas', phonePrefix: '+1512555', emailDomain: 'example.net', postcodes: ['78610', '78640', '78620', '78676', '78644', '76701', '76657', '76501'] },
    commissionPercent: '3',
  },
  // Kenya: shillings → cents. The Gikomba-style home kit is about KSh 85,000.
  KE: {
    country: 'KE',
    company: { name: 'Mlima Biogas', legalName: 'Mlima Biogas Solutions Ltd', currencyCode: 'KES', timezone: 'Africa/Nairobi', units: 'metric', phone: '+254 711 555 210', whatsappNumber: '+254711555210', email: 'karibu@mlimabiogas.co.ke', address: 'Kiambu Road, Ruaka, Kiambu County', taxRatePercent: '16', taxLabel: 'VAT', taxInclusive: true, surveyFeeAmount: 100000, referralRewardAmount: 250000, heroText: 'Cook with gas from your cows. Home kits from KSh 85,000, or a deposit and small monthly payments.', about: 'Mlima Biogas installs and services prefab biodigesters for dairy farmers and schools in Central Kenya and the Rift Valley.' },
    branches: [
      { code: 'RUA', name: 'Ruaka (Kiambu)', address: 'Kiambu Road, Ruaka', phone: '+254 711 555 210', lat: '-1.2049', lng: '36.7736', areas: [{ name: 'Kiambu', region: 'Kiambu', postcodes: ['00'], deliveryFeeAmount: 150000, installSurchargeAmount: 0 }] },
      { code: 'NKR', name: 'Nakuru', address: 'Kenyatta Avenue, Nakuru', phone: '+254 722 555 318', lat: '-0.3031', lng: '36.0800', areas: [{ name: 'Nakuru', region: 'Nakuru', postcodes: ['20'], deliveryFeeAmount: 250000, installSurchargeAmount: 500000 }] },
    ],
    kits: kits(6600, 1200000),
    institutional: inst(6600, 1200000),
    parts: PARTS(13000),
    planFromMonthly: PLANS,
    servicePlans: SERVICE(6000),
    incentives: [{ name: 'Carbon-finance discount', kind: 'carbon_discount', amountType: 'fixed', amountValue: '1500000', treatment: 'off_price_now', infoUrl: '', requiredDocuments: [] }],
    paymentInstructions: { mobile_money: 'M-Pesa Paybill 522 533, account = your order number. Enter the M-Pesa confirmation code below.', bank_transfer: 'KCB Ruaka, Mlima Biogas Solutions Ltd, account 1234 5678 90.', cash: 'Pay our technician; you get a receipt on the spot.' },
    people: { first: ['Wanjiru', 'Kamau', 'Achieng', 'Otieno', 'Njeri', 'Mwangi', 'Chebet', 'Kiprop', 'Atieno', 'Mutua', 'Wambui', 'Njoroge'], last: ['Kariuki', 'Odhiambo', 'Wekesa', 'Kiptoo', 'Muthoni', 'Gitau', 'Ruto', 'Omondi'], towns: ['Ruaka', 'Limuru', 'Githunguri', 'Nakuru', 'Molo', 'Njoro'], region: 'Kiambu', phonePrefix: '+254711', emailDomain: 'example.co.ke', postcodes: ['00217', '00216', '00216', '20100', '20106', '20107'] },
    commissionPercent: '2.5',
  },
  // India: rupees → paise. A 2 m³ deenbandhu-sized kit is about ₹38,000 before subsidy.
  IN: {
    country: 'IN',
    company: { name: 'Gaurav Gas Grameen', legalName: 'Gaurav Gas Grameen Pvt Ltd', currencyCode: 'INR', timezone: 'Asia/Kolkata', units: 'metric', phone: '+91 98450 55210', whatsappNumber: '+919845055210', email: 'namaste@gauravgas.in', address: 'Hosur Road, Anekal, Bengaluru Rural 562106', taxRatePercent: '12', taxLabel: 'GST', taxInclusive: true, surveyFeeAmount: 50000, referralRewardAmount: 100000, heroText: 'Biogas for your home and dairy, with the central subsidy taken off the price.', about: 'Gaurav Gas Grameen supplies, installs and maintains family and dairy biogas plants in Karnataka and Tamil Nadu.' },
    branches: [
      { code: 'ANK', name: 'Anekal', address: 'Hosur Road, Anekal', phone: '+91 98450 55210', lat: '12.7111', lng: '77.6956', areas: [{ name: 'Bengaluru Rural', region: 'Karnataka', postcodes: ['562', '560'], deliveryFeeAmount: 50000, installSurchargeAmount: 0 }] },
      { code: 'KRG', name: 'Krishnagiri', address: 'Bengaluru Road, Krishnagiri', phone: '+91 94430 55120', lat: '12.5186', lng: '78.2137', areas: [{ name: 'Krishnagiri', region: 'Tamil Nadu', postcodes: ['635'], deliveryFeeAmount: 80000, installSurchargeAmount: 150000 }] },
    ],
    kits: kits(2950, 600000),
    institutional: inst(2950, 600000),
    parts: PARTS(6000),
    planFromMonthly: PLANS,
    servicePlans: SERVICE(2500),
    incentives: [{ name: 'Central biogas subsidy (by plant size)', kind: 'subsidy', amountType: 'by_capacity', amountValue: '0', capacityTable: [{ maxM3: 2, amount: 960000 }, { maxM3: 4, amount: 1440000 }, { maxM3: 10, amount: 2240000 }, { maxM3: 25, amount: 3500000 }], capAmount: null, treatment: 'off_price_now', infoUrl: 'https://biogas.mnre.gov.in/', requiredDocuments: ['Aadhaar card', 'Land record or ownership proof', 'Photo of the plant site'] }],
    paymentInstructions: { mobile_money: 'UPI to gauravgas@okaxis. Enter the 12-digit UPI reference below.', bank_transfer: 'NEFT to Gaurav Gas Grameen Pvt Ltd, Canara Bank Anekal, A/c 0412 2010 0055 31, IFSC CNRB0000412.', cash: 'Pay our field engineer; you get a receipt.' },
    people: { first: ['Lakshmi', 'Ravi', 'Priya', 'Suresh', 'Anitha', 'Manjunath', 'Kavya', 'Gowda', 'Deepa', 'Murugan', 'Shanthi', 'Venkatesh'], last: ['Reddy', 'Naik', 'Hegde', 'Rao', 'Kumar', 'Shetty', 'Iyer', 'Pillai'], towns: ['Anekal', 'Attibele', 'Hosur', 'Krishnagiri', 'Denkanikottai', 'Jigani'], region: 'Karnataka', phonePrefix: '+9198450', emailDomain: 'example.in', postcodes: ['562106', '562107', '635109', '635001', '635107', '560105'] },
    commissionPercent: '2',
  },
  // Pakistan: rupees → paisa. A 2 m³ home kit is about Rs 120,000.
  PK: {
    country: 'PK',
    company: { name: 'Sabz Urja', legalName: 'Sabz Urja (Pvt) Ltd', currencyCode: 'PKR', timezone: 'Asia/Karachi', units: 'metric', phone: '+92 300 555 4120', whatsappNumber: '+923005554120', email: 'salaam@sabzurja.pk', address: 'Jhang Road, Faisalabad', taxRatePercent: '17', taxLabel: 'Sales tax', taxInclusive: true, surveyFeeAmount: 200000, referralRewardAmount: 500000, heroText: 'Cook with gas from your buffaloes. Home kits from Rs 120,000, in instalments.', about: 'Sabz Urja installs and services biogas plants for dairy farms and madrassa kitchens in Punjab.' },
    branches: [
      { code: 'FSD', name: 'Faisalabad', address: 'Jhang Road, Faisalabad', phone: '+92 300 555 4120', lat: '31.4180', lng: '73.0790', areas: [{ name: 'Faisalabad', region: 'Punjab', postcodes: ['38'], deliveryFeeAmount: 300000, installSurchargeAmount: 0 }] },
      { code: 'SHW', name: 'Sahiwal', address: 'GT Road, Sahiwal', phone: '+92 321 555 7781', lat: '30.6682', lng: '73.1114', areas: [{ name: 'Sahiwal & Okara', region: 'Punjab', postcodes: ['57', '56'], deliveryFeeAmount: 450000, installSurchargeAmount: 1000000 }] },
    ],
    kits: kits(9300, 2500000),
    institutional: inst(9300, 2500000),
    parts: PARTS(20000),
    planFromMonthly: PLANS,
    servicePlans: SERVICE(9000),
    incentives: [],
    paymentInstructions: { mobile_money: 'JazzCash or Easypaisa to 0300 555 4120 (Sabz Urja). Enter the transaction ID below.', bank_transfer: 'Meezan Bank Jhang Road, Sabz Urja (Pvt) Ltd, IBAN PK36 MEZN 0001 2345 6789 0123.', cash: 'Pay our technician; you get a receipt.' },
    people: { first: ['Ayesha', 'Imran', 'Fatima', 'Bilal', 'Nadia', 'Usman', 'Sana', 'Tariq', 'Rabia', 'Hamza', 'Zainab', 'Asif'], last: ['Khan', 'Malik', 'Butt', 'Chaudhry', 'Awan', 'Bhatti', 'Qureshi', 'Rana'], towns: ['Faisalabad', 'Jaranwala', 'Samundri', 'Sahiwal', 'Okara', 'Chichawatni'], region: 'Punjab', phonePrefix: '+92300', emailDomain: 'example.pk', postcodes: ['38000', '37250', '37300', '57000', '56300', '57200'] },
    commissionPercent: '2',
  },
}

export const COUNTRY_LABELS: Record<CountryCode, string> = { US: 'United States', KE: 'Kenya', IN: 'India', PK: 'Pakistan' }
