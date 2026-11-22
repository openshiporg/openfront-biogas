import { mergeSchemas } from '@graphql-tools/schema'
import type { GraphQLSchema } from 'graphql'
import redirectToInit from './redirectToInit'
import { storefrontResolvers, storefrontTypeDefs } from './storefront'
import { staffResolvers, staffTypeDefs } from './staff'
import { onboardingResolvers, onboardingTypeDefs } from './onboarding'

const graphql = String.raw

// Every domain resolver checks permission in its service and runs as one idempotent command: the state
// change, audit rows and webhook records commit in one transaction (features/keystone/lib).
export function extendGraphqlSchema(baseSchema: GraphQLSchema) {
  const core = mergeSchemas({
    schemas: [baseSchema],
    typeDefs: graphql`
      scalar JSON
      type Query {
        redirectToInit: Boolean
      }
    `,
    resolvers: { Query: { redirectToInit } },
  })
  return mergeSchemas({
    schemas: [core],
    typeDefs: [storefrontTypeDefs, staffTypeDefs, onboardingTypeDefs],
    resolvers: [storefrontResolvers, staffResolvers, onboardingResolvers] as never,
  })
}
