/** Shared onboarding content: checklists, guides, FAQs, stories and roles (section 9). Plain, real wording. */

export const CHECKLISTS: { kind: string; name: string; items: { prompt: string; inputType?: string; unit?: string; isRequired?: boolean; helpText?: string; choices?: string[] }[] }[] = [
  { kind: 'survey_farm', name: 'Farm and home site survey', items: [
    { prompt: 'Animals kept at night where dung can be collected', inputType: 'number', unit: 'head' },
    { prompt: 'Dung available each day', inputType: 'number', unit: 'kg' },
    { prompt: 'Water within 50 m of the digester site', inputType: 'yes_no' },
    { prompt: 'Flat space for the digester (length × width)', inputType: 'text', unit: 'm' },
    { prompt: 'Soil type', inputType: 'choice', choices: ['Clay', 'Loam', 'Sand', 'Rock'] },
    { prompt: 'Distance from digester to kitchen', inputType: 'number', unit: 'm' },
    { prompt: 'Flood risk at the site', inputType: 'choice', choices: ['None', 'Low', 'High'] },
    { prompt: 'Who will feed the digester each day', inputType: 'text' },
    { prompt: 'Photo of the proposed site', inputType: 'photo', isRequired: false },
  ] },
  { kind: 'survey_kitchen', name: 'Institutional kitchen survey', items: [
    { prompt: 'Kitchen and food waste each day', inputType: 'number', unit: 'kg' },
    { prompt: 'Waste is separated from plastics and bones', inputType: 'yes_no' },
    { prompt: 'Meals served each day', inputType: 'number' },
    { prompt: 'Space for the unit (length × width)', inputType: 'text', unit: 'm' },
    { prompt: 'Gas use point (stoves, boiler)', inputType: 'text' },
    { prompt: 'Distance from unit to gas use point', inputType: 'number', unit: 'm' },
    { prompt: 'Photo of the proposed site', inputType: 'photo', isRequired: false },
  ] },
  { kind: 'pre_install', name: 'Get ready for your installation', items: [
    { prompt: 'Dig the pit to the size on your quote', helpText: 'Our surveyor marked the corners. Keep the sides straight and the floor level.' },
    { prompt: 'Set posts for the gas line from the digester to the kitchen' },
    { prompt: 'Fence the slurry outlet so children and animals stay out' },
    { prompt: 'Have water and the first load of dung ready', helpText: 'About two wheelbarrows of fresh dung and the same of water.' },
    { prompt: 'Clear the work area of rocks and roots', isRequired: false },
  ] },
  { kind: 'install', name: 'Installation', items: [
    { prompt: 'Pit size and level checked', inputType: 'yes_no' },
    { prompt: 'Reactor placed and inlet/outlet fitted', inputType: 'yes_no' },
    { prompt: 'Gas line leak-checked under pressure, no drop over 10 minutes', inputType: 'yes_no' },
    { prompt: 'H₂S filter and water trap fitted', inputType: 'yes_no' },
    { prompt: 'Stove fitted and connected', inputType: 'yes_no' },
    { prompt: 'First feed done (kg)', inputType: 'number', unit: 'kg' },
    { prompt: 'Photo of the finished install', inputType: 'photo', isRequired: false },
  ] },
  { kind: 'commissioning', name: 'Commissioning', items: [
    { prompt: 'Stove lit with a steady blue flame', inputType: 'yes_no' },
    { prompt: 'Gas pressure at the stove', inputType: 'number', unit: 'kPa' },
    { prompt: 'Leak check on every joint', inputType: 'yes_no' },
    { prompt: 'Feeding routine explained (amount and water ratio)', inputType: 'yes_no' },
  ] },
  { kind: 'follow_up', name: 'Follow-up check', items: [
    { prompt: 'System working', inputType: 'yes_no' },
    { prompt: 'Hours of cooking a day', inputType: 'number', unit: 'h' },
    { prompt: 'Feeding amount a day', inputType: 'number', unit: 'kg' },
    { prompt: 'Problems reported', inputType: 'text', isRequired: false },
  ] },
  { kind: 'service', name: 'Service visit', items: [
    { prompt: 'Fault found', inputType: 'text' },
    { prompt: 'Work done', inputType: 'text' },
    { prompt: 'Customer saw it working', inputType: 'yes_no' },
  ] },
  { kind: 'maintenance', name: 'Maintenance visit', items: [
    { prompt: 'Filter media checked or replaced', inputType: 'yes_no' },
    { prompt: 'Gas line leak-checked under pressure', inputType: 'yes_no' },
    { prompt: 'Stove burners cleaned', inputType: 'yes_no' },
    { prompt: 'Gas pressure at the stove', inputType: 'number', unit: 'kPa' },
  ] },
  { kind: 'delivery', name: 'Delivery', items: [
    { prompt: 'Items checked against the order with the customer', inputType: 'yes_no' },
    { prompt: 'Customer name on receipt', inputType: 'text' },
  ] },
]

export const GUIDES = [
  { slug: 'no-gas', title: 'No gas at the stove', category: 'no_gas', steps: ['Check the main gas valve at the digester is open.', 'Look at the bag or dome: is it full? If it is flat, feeding may have stopped or the slurry outlet is blocked.', 'Drain the water trap on the gas line.', 'Check the stove valve and hose for kinks.', 'If the bag is full but no gas reaches the stove, call us: the line may be blocked.'] },
  { slug: 'low-pressure', title: 'Weak flame or low pressure', category: 'low_pressure', steps: ['Drain the water trap; water in the line is the most common cause.', 'Check the feed: the same amount of fresh dung and water every day.', 'In cold weather gas production drops; insulate the digester if you can.', 'Check the H₂S filter media; replace it if it is black and hard.'] },
  { slug: 'gas-smell', title: 'Gas smell near the line or stove', category: 'smell', steps: ['Turn off the stove and the main gas valve.', 'Do not light a flame or switch on lights near the smell.', 'Brush soapy water on joints; bubbles show the leak.', 'Call us at once; we treat leaks as urgent.'] },
  { slug: 'slurry-overflow', title: 'Slurry overflowing at the outlet', category: 'slurry_overflow', steps: ['Feed less water for a few days; the mix should be about one part dung to one part water.', 'Clear the outlet channel of dried slurry.', 'Use the slurry on your fields; it is a good fertiliser.'] },
  { slug: 'stove-will-not-light', title: 'Stove will not light', category: 'stove_fault', steps: ['Check that gas reaches the stove: open the valve and listen.', 'Clean the burner holes with a pin.', 'Check the air ring is not fully closed.', 'If the flame is yellow and sooty, open the air ring a little.'] },
  { slug: 'feeding-routine', title: 'Daily feeding routine', category: 'other', steps: ['Mix fresh dung with the same amount of water.', 'Remove straw, stones and plastic.', 'Pour it in through the inlet once a day, at the same time.', 'Never add soap, detergent or chemicals; they kill the bacteria.'] },
]

export const FAQS = [
  { category: 'Buying', question: 'How many animals do I need?', answer: 'About one cow, three pigs or 40 chickens for each cubic metre of digester gives a family enough gas to cook. Our calculator works it out for your farm.' },
  { category: 'Buying', question: 'Can I pay over time?', answer: 'Yes. Pay a deposit and the rest in monthly instalments, by card, mobile money, bank transfer or cash to our staff.' },
  { category: 'Installation', question: 'How long does installation take?', answer: 'A home kit is installed in one day once the pit is dug. Gas comes in one to three weeks as the digester starts working.' },
  { category: 'Installation', question: 'Do I need a site survey?', answer: 'For farm and institutional systems, yes: we check feed, water, space and soil so the system works. Small home kits can be bought without one.' },
  { category: 'Using it', question: 'Is biogas safe?', answer: 'Yes, when the line is fitted and checked properly. We leak-check every gas line under pressure and train your family before we leave.' },
  { category: 'Service', question: 'What does the warranty cover?', answer: 'The reactor, the gas line, the appliances and our workmanship, each for the period on your receipt. Report a problem any time on our support page.' },
]

export const STORIES = [
  { slug: 'dairy-family-cooks-on-gas', title: 'A dairy family stops buying cooking fuel', customerName: 'The Alvarez family', location: 'Dripping Springs', body: 'With four cows and a FarmTube 8 the family cooks every meal on biogas and uses the slurry on their vegetable beds.', savingsText: 'Saves about 70 a month on fuel' },
  { slug: 'school-kitchen-waste-to-gas', title: 'A school kitchen turns food waste into gas', customerName: 'Hill Country Academy', location: 'Wimberley', body: 'The KitchenCycle 20 takes the day’s food waste and supplies the gas for the lunch stoves.', savingsText: 'Cuts kitchen gas bills by half' },
  { slug: 'homestead-small-kit', title: 'A homestead starts small', customerName: 'Grace and Tom', location: 'Kyle', body: 'Two goats, a few chickens and kitchen scraps run a HomeBag 2 that covers their morning and evening cooking.', savingsText: 'Paid back in under three years' },
]

const P = (...names: string[]) => Object.fromEntries(names.map(n => [n, true]))
export const ROLES: { name: string; discount: string; perms: Record<string, boolean> }[] = [
  { name: 'Owner', discount: '100', perms: {} },
  { name: 'Sales agent', discount: '5', perms: P('canAccessDashboard', 'canManageLeads', 'canManageQuotes', 'canManageOrders') },
  { name: 'Technician', discount: '0', perms: P('canAccessDashboard', 'canDoFieldWork') },
  { name: 'Dispatcher', discount: '0', perms: P('canAccessDashboard', 'canManageVisits', 'canManageSystems', 'canSeeAllLeads', 'canManageLeads') },
  { name: 'Customer care', discount: '0', perms: P('canAccessDashboard', 'canManageTickets', 'canManageSystems', 'canManageLeads', 'canSeeAllLeads') },
  { name: 'Storekeeper', discount: '0', perms: P('canAccessDashboard', 'canManageInventory', 'canManageOrders') },
  { name: 'Finance', discount: '15', perms: P('canAccessDashboard', 'canReadPayments', 'canManagePayments', 'canIssueRefunds', 'canManagePlans', 'canManageIncentives', 'canManageCommissions', 'canReadReports', 'canApproveDiscounts') },
  { name: 'Sales manager', discount: '20', perms: P('canAccessDashboard', 'canManageLeads', 'canSeeAllLeads', 'canManageQuotes', 'canApproveDiscounts', 'canManageOrders', 'canReadReports') },
]

/** Staff per role: [role, first-name index]. Names come from the preset's people. */
export const STAFF: { role: string; title: string }[] = [
  { role: 'Sales manager', title: 'Sales manager' },
  { role: 'Sales agent', title: 'Sales agent' },
  { role: 'Sales agent', title: 'Field sales agent' },
  { role: 'Dispatcher', title: 'Dispatcher' },
  { role: 'Technician', title: 'Lead installer' },
  { role: 'Technician', title: 'Installer' },
  { role: 'Technician', title: 'Service technician' },
  { role: 'Customer care', title: 'Customer care' },
  { role: 'Storekeeper', title: 'Storekeeper' },
  { role: 'Finance', title: 'Finance' },
]
