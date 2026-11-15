const { PrismaClient } = require("../generated/prisma-v2");

const prisma = new PrismaClient();

module.exports = prisma;