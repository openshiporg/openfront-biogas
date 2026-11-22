import { createAuth } from '@keystone-6/auth'
import { config } from '@keystone-6/core'
import type { StorageConfig } from '@keystone-6/core/types'
import 'dotenv/config'
import { mkdirSync } from 'node:fs'
import { models } from './models'
import { statelessSessions } from '@keystone-6/core/session'
import { extendGraphqlSchema } from './mutations'
import { sendPasswordResetEmail } from './lib/mail'
import { withMcpBearerSessions } from './mcp-oauth/session'
import { permissionNames } from './access'
import { throwKeystonePrismaErrors } from './lib/keystonePrismaErrors'

const databaseURL = process.env.DATABASE_URL || 'postgres://localhost:5432/openfront_biogas'

const sessionConfig = {
  maxAge: 60 * 60 * 24 * 30,
  secret: process.env.SESSION_SECRET || 'this secret should only be used in development',
}

/**
 * Photos, signatures and manuals. S3-compatible storage when a bucket is configured; otherwise the
 * app's own disk (public/), so uploads work with no settings at all.
 */
function storage(kind: 'image' | 'file', folder: string): StorageConfig {
  const { S3_BUCKET_NAME, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_ENDPOINT } = process.env
  if (S3_BUCKET_NAME && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY) {
    return {
      kind: 's3', type: kind, bucketName: S3_BUCKET_NAME, region: S3_REGION || 'auto', accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY,
      ...(S3_ENDPOINT ? { endpoint: S3_ENDPOINT, forcePathStyle: true } : {}), pathPrefix: `${folder}/`, signed: { expiry: 3600 },
    } as StorageConfig
  }
  // Keystone writes into this folder but never creates it; without it every upload fails with ENOENT.
  mkdirSync(`public/${folder}`, { recursive: true })
  return { kind: 'local', type: kind, generateUrl: path => `/${folder}${path}`, serverRoute: { path: `/${folder}` }, storagePath: `public/${folder}` } as StorageConfig
}

const roleFields = ['id', 'name', 'discountLimitPercent', ...permissionNames].join('\n      ')

const { withAuth } = createAuth({
  listKey: 'User',
  identityField: 'email',
  secretField: 'password',
  initFirstItem: {
    fields: ['name', 'email', 'password'],
    itemData: {
      role: {
        create: {
          name: 'Owner',
          discountLimitPercent: '100',
          ...Object.fromEntries(permissionNames.map(name => [name, true])),
        },
      },
    },
  },
  passwordResetLink: {
    async sendToken(args) {
      await sendPasswordResetEmail(args.token, args.identity)
    },
  },
  sessionData: `
    name
    email
    isActive
    customer { id }
    role {
      ${roleFields}
    }
  `,
})

export default withAuth(
  config({
    db: { provider: 'postgresql', url: databaseURL, extendPrismaClient: throwKeystonePrismaErrors },
    lists: models,
    storage: {
      biogas_images: storage('image', 'images'),
      biogas_files: storage('file', 'files'),
    },
    ui: {
      isAccessAllowed: ({ session }) => session?.data?.isActive !== false && session?.data.role?.canAccessDashboard === true,
    },
    session: withMcpBearerSessions(statelessSessions(sessionConfig)),
    graphql: { extendGraphqlSchema },
  })
)
