import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function resolveDatabaseUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.PRISMA_DATABASE_URL ||
    process.env.PRISMA_POSTGRES_URL
  )
}

const databaseUrl = resolveDatabaseUrl()

function createPrisma(): PrismaClient {
  const client = new PrismaClient(
    databaseUrl
      ? { datasources: { db: { url: databaseUrl } } }
      : undefined
  )

  // Soft-delete middleware: automatically exclude deleted proposals from reads.
  // To query deleted records explicitly, pass `where: { deletedAt: { not: null } }`.
  client.$use(async (params, next) => {
    if (params.model !== 'Proposal') return next(params)

    const readOps = ['findFirst', 'findMany', 'findUnique', 'findFirstOrThrow', 'findUniqueOrThrow', 'count', 'aggregate', 'groupBy']

    if (readOps.includes(params.action)) {
      if (!params.args) params.args = {}
      if (!params.args.where) params.args.where = {}

      if (params.args.where.deletedAt === undefined) {
        params.args.where.deletedAt = null
      }
    }

    return next(params)
  })

  return client
}

// We only create the PrismaClient when it's first accessed
let prismaClientInstance: PrismaClient | undefined;

export const prisma = new Proxy({} as PrismaClient, {
  get(target, prop) {
    if (!prismaClientInstance) {
      prismaClientInstance = globalForPrisma.prisma ?? createPrisma();
      if (process.env.NODE_ENV !== 'production') {
        globalForPrisma.prisma = prismaClientInstance;
      }
    }
    return (prismaClientInstance as any)[prop];
  }
});
