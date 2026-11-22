import { requirePermission } from '../lib/actor'
import { op, run, staff, type Ctx } from './ctx'
import { seedReference, type OnboardingAnswers } from '../services/onboarding'
import { seedActivity } from '../services/activity'
import { DomainError, Codes } from '../lib/errors'

const graphql = String.raw

export const onboardingTypeDefs = graphql`
  input UserUpdateProfileInput { name: String, email: String, password: String, onboardingStatus: String }
  type Mutation {
    runBiogasOnboarding(answers: JSON!, idempotencyKey: String!): JSON
    updateActiveUser(data: UserUpdateProfileInput!): User
  }
`

export const onboardingResolvers = {
  Mutation: {
    /**
     * Five answers → a working company (section 9). The reference data is one idempotent command; the
     * first month of work runs once, after it, through the normal services.
     */
    runBiogasOnboarding: op(async (_r, a: { answers: OnboardingAnswers; idempotencyKey: string }, c: Ctx) => {
      const actor = staff(c)
      requirePermission(actor, 'canManageOnboarding')
      const answers = a.answers ?? ({} as OnboardingAnswers)
      if (!['US', 'KE', 'IN', 'PK'].includes(answers.country)) throw new DomainError(Codes.INVALID_INPUT, 'Pick a country: United States, Kenya, India or Pakistan.')
      const reference = await run(c, 'runBiogasOnboarding', actor, a, uow => seedReference(uow, actor, answers), undefined, 300_000)
      const activity = answers.withActivity === false ? { created: {}, customerLogin: null } : await seedActivity(c.prisma, answers.country)
      await c.prisma.user.update({ where: { id: c.session!.itemId }, data: { onboardingStatus: 'completed' } })
      return { created: { ...reference.created, ...activity.created }, staffPassword: reference.staffPassword, customerLogin: activity.customerLogin }
    }),
    /** The signed-in user's own name, password and onboarding status (starter parity). */
    updateActiveUser: async (_r: unknown, a: { data: { name?: string; email?: string; password?: string; onboardingStatus?: string } }, c: any) => {
      if (!c.session?.itemId) throw new DomainError(Codes.NOT_AUTHORIZED, 'Sign in to continue.')
      return c.db.User.updateOne({ where: { id: c.session.itemId }, data: a.data })
    },
  },
}
