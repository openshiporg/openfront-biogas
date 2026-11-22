/**
 * `npm run seed [-- --country=US --name="Juniper Biogas"]`: the same onboarding the dashboard runs
 * (section 9), against DATABASE_URL. Safe to run twice: the reference data is upserted by natural keys
 * and the first month of work loads only when there are no leads yet. Passwords for new logins are made
 * here and printed once; nothing is written to a file.
 */
import { PrismaClient } from '@prisma/client'
import { command } from '../lib/command'
import { systemActor } from '../lib/actor'
import { seedReference, type OnboardingAnswers } from '../services/onboarding'
import { seedActivity } from '../services/activity'
import type { CountryCode } from '../../platform/onboarding/lib/presets'
import bcrypt from 'bcryptjs'
import { randomToken } from '../lib/sequence'

const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3)

async function main() {
  const country = (arg('country') ?? 'US').toUpperCase() as CountryCode
  const answers: OnboardingAnswers = { country, companyName: arg('name'), sells: ['home', 'farm', 'institution', 'parts'], instalments: true, paymentMethods: ['stripe', 'mobile_money', 'bank_transfer', 'cash'] }
  const prisma = new PrismaClient({ log: [] })
  try {
    const actor = systemActor('seed')
    const reference = await command(prisma, { name: 'runBiogasOnboarding', actor, idempotencyKey: `seed:${country}:${Date.now()}`, params: answers, timeoutMs: 300_000 }, uow => seedReference(uow, actor, answers))
    const activity = await seedActivity(prisma, country)
    // From the command line there is no first user from /dashboard/init, so make the Owner once.
    let owner: { email: string; password: string } | null = null
    if (!(await prisma.user.findFirst({ where: { role: { name: 'Owner' } } }))) {
      const settings = await prisma.companySettings.findFirst()
      const role = await prisma.role.findUnique({ where: { name: 'Owner' } })
      const domain = settings?.email.split('@')[1] || 'example.com'
      owner = { email: `owner@${domain}`, password: `owner-${randomToken(6)}` }
      await prisma.user.create({ data: { name: 'Company owner', email: owner.email, password: await bcrypt.hash(owner.password, 10), roleId: role?.id ?? null, onboardingStatus: 'completed' } })
    }
    if (owner) console.log(`\nOwner login (shown once): ${owner.email} / ${owner.password}`)
    const staff = await prisma.user.findMany({ where: { role: { canAccessDashboard: true } }, select: { email: true, role: { select: { name: true } } }, orderBy: { email: 'asc' } })
    console.log(JSON.stringify({ created: { ...reference.value.created, ...activity.created } }, null, 2))
    if (reference.value.staffPassword) {
      console.log('\nStaff logins (shared first password, shown once):', reference.value.staffPassword)
      for (const s of staff) console.log(`  ${s.role?.name?.padEnd(14)} ${s.email}`)
    }
    if (activity.customerLogin) console.log(`\nCustomer login (shown once): ${activity.customerLogin.email} / ${activity.customerLogin.password}`)
    if (!reference.value.staffPassword && !activity.customerLogin && !owner) console.log('\nNothing new to create; logins already exist.')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(error => {
  console.error('Seed failed:', String(error?.message ?? error).replace(/postgres(ql)?:\/\/\S+/g, '<url>').slice(0, 2000))
  process.exit(1)
})
