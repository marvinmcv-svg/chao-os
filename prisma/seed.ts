// CHAO OS — Seed Script
// Run with: npm run db:seed
// Uses tsx to execute TypeScript directly

import { PrismaClient, UserRole, ProjectType, ContractType, ProjectPhase, ProjectStatus, PhaseStatus, PipelineStage, ProjectTypeLead, SourceType, ClientType, InvoiceStatus, Currency, TaskStatus, TaskPriority, DocumentStatus, NotificationType, AIRecommendation } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { generatePortalToken } from '@/lib/portal-auth'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting seed...')

  // Use transaction to clear all data safely
  await prisma.$transaction([
    // Clear in reverse dependency order
    prisma.notification.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.comment.deleteMany(),
    prisma.document.deleteMany(),
    prisma.expense.deleteMany(),
    prisma.timeEntry.deleteMany(),
    prisma.task.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.invoiceLineItem.deleteMany(),
    prisma.invoice.deleteMany(),
    prisma.milestone.deleteMany(),
    prisma.phase.deleteMany(),
    prisma.projectMember.deleteMany(),
    prisma.lead.deleteMany(),
    prisma.project.deleteMany(),
    prisma.teamMember.deleteMany(),
    prisma.client.deleteMany(),
    prisma.user.deleteMany(),
    prisma.passwordChange.deleteMany(),
  ])

  console.log('✅ Cleared existing data')

  // =========================================================================
  // ADMIN USER
  // =========================================================================
  const passwordHash = await bcrypt.hash('Cha0Admin2025!', 12)

  const admin = await prisma.user.create({
    data: {
      name: 'Administrador',
      email: 'admin@chaoarquitectura.bo',
      passwordHash,
      role: UserRole.ADMIN,
      avatarInitials: 'AD',
      capacityPercent: 100,
    },
  })
  console.log(`✅ Created admin user: ${admin.email}`)

  // =========================================================================
  // TEAM MEMBERS (6 from spec)
  // =========================================================================
  const teamMembers = await Promise.all([
    prisma.user.create({
      data: {
        name: 'Marco Arce',
        email: 'marco@chaoarquitectura.bo',
        passwordHash,
        role: UserRole.PRINCIPAL,
        avatarInitials: 'MA',
        capacityPercent: 100,
        teamMember: {
          create: {
            role: 'Arquitecto Principal',
            weeklyHoursCapacity: 40,
            weeklyHoursLogged: 36.8,
            utilizationPercent: 92,
            startDate: new Date('2019-03-01'),
            hourlyRate: 45.0,
          },
        },
      },
      include: { teamMember: true },
    }),
    prisma.user.create({
      data: {
        name: 'Sofía Herrera',
        email: 'sofia@chaoarquitectura.bo',
        passwordHash,
        role: UserRole.ARCHITECT_SENIOR,
        avatarInitials: 'SH',
        capacityPercent: 100,
        teamMember: {
          create: {
            role: 'Arquitecta Senior',
            weeklyHoursCapacity: 40,
            weeklyHoursLogged: 39.2,
            utilizationPercent: 98,
            startDate: new Date('2020-08-15'),
            hourlyRate: 38.0,
          },
        },
      },
      include: { teamMember: true },
    }),
    prisma.user.create({
      data: {
        name: 'Jorge Molina',
        email: 'jorge@chaoarquitectura.bo',
        passwordHash,
        role: UserRole.ARCHITECT,
        avatarInitials: 'JM',
        capacityPercent: 100,
        teamMember: {
          create: {
            role: 'Arquitecto',
            weeklyHoursCapacity: 40,
            weeklyHoursLogged: 27.2,
            utilizationPercent: 68,
            startDate: new Date('2022-01-10'),
            hourlyRate: 28.0,
          },
        },
      },
      include: { teamMember: true },
    }),
    prisma.user.create({
      data: {
        name: 'Paula Ribera',
        email: 'paula@chaoarquitectura.bo',
        passwordHash,
        role: UserRole.ARCHITECT,
        avatarInitials: 'PR',
        capacityPercent: 100,
        teamMember: {
          create: {
            role: 'Arquitecta Junior',
            weeklyHoursCapacity: 40,
            weeklyHoursLogged: 22.0,
            utilizationPercent: 55,
            startDate: new Date('2023-06-01'),
            hourlyRate: 22.0,
          },
        },
      },
      include: { teamMember: true },
    }),
    prisma.user.create({
      data: {
        name: 'Diego Vásquez',
        email: 'diego@chaoarquitectura.bo',
        passwordHash,
        role: UserRole.BIM,
        avatarInitials: 'DV',
        capacityPercent: 100,
        teamMember: {
          create: {
            role: 'BIM Manager',
            weeklyHoursCapacity: 40,
            weeklyHoursLogged: 33.6,
            utilizationPercent: 84,
            startDate: new Date('2021-02-01'),
            hourlyRate: 32.0,
          },
        },
      },
      include: { teamMember: true },
    }),
    prisma.user.create({
      data: {
        name: 'Lorena Chávez',
        email: 'lorena@chaoarquitectura.bo',
        passwordHash,
        role: UserRole.ADMIN,
        avatarInitials: 'LC',
        capacityPercent: 100,
        teamMember: {
          create: {
            role: 'Coordinator Admin',
            weeklyHoursCapacity: 40,
            weeklyHoursLogged: 24.0,
            utilizationPercent: 60,
            startDate: new Date('2022-09-01'),
            hourlyRate: 20.0,
          },
        },
      },
      include: { teamMember: true },
    }),
  ])

  console.log(`✅ Created ${teamMembers.length} team members`)

  // =========================================================================
  // CLIENTS (7 projects = 7 clients)
  // =========================================================================
  const clients = await Promise.all([
    // P-2025-001 — Torre Buganvillas
    prisma.client.create({
      data: {
        name: 'Rodrigo Méndez',
        company: 'Inmobiliaria Oriente',
        email: 'rmendez@inmobiliariaoriente.bo',
        phone: '+591 70123456',
        type: ClientType.ACTIVE,
        aiScore: 78,
        totalBilledUSD: 48000,
        portalAccessEnabled: true,
        portalTokenHash: generatePortalToken().hash,
        notes: 'Cliente preferencial. Proyecto de vivienda de alto perfil.',
        createdAt: new Date('2024-06-01'),
      },
    }),
    // P-2025-002 — Clínica Santa Rita
    prisma.client.create({
      data: {
        name: 'Dr. Carlos Iturralde',
        company: 'Grupo Médico Rita',
        email: 'citurralde@gmritta.bo',
        phone: '+591 70223456',
        type: ClientType.ACTIVE,
        aiScore: 82,
        totalBilledUSD: 29600,
        portalAccessEnabled: true,
        portalTokenHash: generatePortalToken().hash,
        notes: 'Médico reconocido en la ciudad. Pago puntual.',
        createdAt: new Date('2024-03-15'),
      },
    }),
    // P-2025-003 — Residencias Urubó
    prisma.client.create({
      data: {
        name: 'María Elena de Méndez',
        company: 'Familia Méndez',
        email: 'maria.mendez@email.bo',
        phone: '+591 70323456',
        type: ClientType.ACTIVE,
        aiScore: 65,
        totalBilledUSD: 21750,
        portalAccessEnabled: false,
        notes: 'Proyecto residencial familiar en Urubó.',
        createdAt: new Date('2024-09-01'),
      },
    }),
    // P-2025-004 — Centro Empresarial Norte
    prisma.client.create({
      data: {
        name: 'Ing. Roberto Aguayo',
        company: 'Grupo Empresarial Norte',
        email: 'raguayo@genorte.bo',
        phone: '+591 70423456',
        type: ClientType.ACTIVE,
        aiScore: 88,
        totalBilledUSD: 57750,
        portalAccessEnabled: true,
        portalTokenHash: generatePortalToken().hash,
        notes: 'Cliente corporativo grande. Múltiples proyectos.',
        createdAt: new Date('2023-11-01'),
      },
    }),
    // P-2025-005 — Hotel Camiri Boutique
    prisma.client.create({
      data: {
        name: 'Sra. Patricia de la Barra',
        company: 'Camiri Hospitality',
        email: 'pdelabarra@camirihotel.bo',
        phone: '+591 70523456',
        type: ClientType.ACTIVE,
        aiScore: 71,
        totalBilledUSD: 0,
        portalAccessEnabled: false,
        notes: 'Nuevo cliente. Primer proyecto con la firma.',
        createdAt: new Date('2024-11-01'),
      },
    }),
    // P-2025-006 — Nave Industrial Warnes
    prisma.client.create({
      data: {
        name: 'Lic. Gonzalo Fernández',
        company: 'Agro-Export Bolivia',
        email: 'gfernandez@agroexport.bo',
        phone: '+591 70623456',
        type: ClientType.ACTIVE,
        aiScore: 60,
        totalBilledUSD: 0,
        portalAccessEnabled: false,
        notes: 'Cliente industrial. Proyecto de almacén.',
        createdAt: new Date('2025-01-10'),
      },
    }),
    // P-2025-007 — Casa Gutiérrez
    prisma.client.create({
      data: {
        name: 'Gustavo Gutiérrez',
        company: 'Familia Gutiérrez',
        email: 'ggutierrez@email.bo',
        phone: '+591 70723456',
        type: ClientType.ACTIVE,
        aiScore: 55,
        totalBilledUSD: 0,
        portalAccessEnabled: false,
        notes: 'Proyecto residencial pequeño.',
        createdAt: new Date('2025-01-20'),
      },
    }),
  ])

  console.log(`✅ Created ${clients.length} clients`)

  // =========================================================================
  // PROJECTS (7 projects)
  // =========================================================================
  const marcoUser = teamMembers[0]
  const sofiaUser = teamMembers[1]
  const jorgeUser = teamMembers[2]
  const paulaUser = teamMembers[3]
  const diegoUser = teamMembers[4]
  const lorenaUser = teamMembers[5]

  const projects = await Promise.all([
    // P-2025-001 — Torre Buganvillas (DD, 65%)
    prisma.project.create({
      data: {
        code: 'P-2025-001',
        name: 'Torre Buganvillas',
        clientId: clients[0].id,
        projectManagerId: marcoUser.id,
        type: ProjectType.RESIDENTIAL,
        contractType: ContractType.FIXED_FEE,
        currentPhase: ProjectPhase.DD,
        totalBudgetUSD: 320000,
        totalSpentUSD: 208000,
        overallProgressPercent: 65,
        status: ProjectStatus.ON_TRACK,
        startDate: new Date('2024-06-15'),
        estimatedEndDate: new Date('2025-08-31'),
        phases: {
          create: [
            { phase: ProjectPhase.SD, label: 'Schematic Design', budgetUSD: 64000, spentUSD: 64000, progressPercent: 100, status: PhaseStatus.COMPLETE, startDate: new Date('2024-06-15'), endDate: new Date('2024-08-31') },
            { phase: ProjectPhase.DD, label: 'Design Development', budgetUSD: 96000, spentUSD: 96000, progressPercent: 100, status: PhaseStatus.COMPLETE, startDate: new Date('2024-09-01'), endDate: new Date('2024-12-15') },
            { phase: ProjectPhase.CD, label: 'Construction Documents', budgetUSD: 112000, spentUSD: 48000, progressPercent: 43, status: PhaseStatus.IN_PROGRESS, startDate: new Date('2024-12-16'), endDate: null },
            { phase: ProjectPhase.CA, label: 'Construction Administration', budgetUSD: 48000, spentUSD: 0, progressPercent: 0, status: PhaseStatus.NOT_STARTED, startDate: null, endDate: null },
          ],
        },
        milestones: {
          create: [
            { phase: ProjectPhase.SD, label: 'Hito 1 — SD 100%', dueDate: new Date('2024-08-31'), status: 'approved', approvedAt: new Date('2024-08-30'), approvedById: marcoUser.id },
            { phase: ProjectPhase.DD, label: 'Hito 2 — DD 50%', dueDate: new Date('2024-10-31'), status: 'approved', approvedAt: new Date('2024-10-29'), approvedById: marcoUser.id },
            { phase: ProjectPhase.DD, label: 'Hito 3 — DD 100%', dueDate: new Date('2024-12-15'), status: 'approved', approvedAt: new Date('2024-12-14'), approvedById: marcoUser.id },
          ],
        },
        teamMembers: {
          create: [
            { userId: marcoUser.id, role: 'Project Manager' },
            { userId: sofiaUser.id, role: 'Senior Architect' },
            { userId: diegoUser.id, role: 'BIM Coordinator' },
          ],
        },
      },
    }),

    // P-2025-002 — Clínica Santa Rita (CD, 82%)
    prisma.project.create({
      data: {
        code: 'P-2025-002',
        name: 'Clínica Santa Rita',
        clientId: clients[1].id,
        projectManagerId: sofiaUser.id,
        type: ProjectType.COMMERCIAL,
        contractType: ContractType.FIXED_FEE,
        currentPhase: ProjectPhase.CD,
        totalBudgetUSD: 218000,
        totalSpentUSD: 178760,
        overallProgressPercent: 82,
        status: ProjectStatus.ON_TRACK,
        startDate: new Date('2024-03-01'),
        estimatedEndDate: new Date('2025-06-30'),
        phases: {
          create: [
            { phase: ProjectPhase.SD, label: 'Schematic Design', budgetUSD: 43600, spentUSD: 43600, progressPercent: 100, status: PhaseStatus.COMPLETE, startDate: new Date('2024-03-01'), endDate: new Date('2024-05-15') },
            { phase: ProjectPhase.DD, label: 'Design Development', budgetUSD: 65400, spentUSD: 65400, progressPercent: 100, status: PhaseStatus.COMPLETE, startDate: new Date('2024-05-16'), endDate: new Date('2024-08-31') },
            { phase: ProjectPhase.CD, label: 'Construction Documents', budgetUSD: 76300, spentUSD: 69760, progressPercent: 91, status: PhaseStatus.IN_PROGRESS, startDate: new Date('2024-09-01'), endDate: null },
            { phase: ProjectPhase.CA, label: 'Construction Administration', budgetUSD: 32700, spentUSD: 0, progressPercent: 0, status: PhaseStatus.NOT_STARTED, startDate: null, endDate: null },
          ],
        },
        milestones: {
          create: [
            { phase: ProjectPhase.SD, label: 'Hito 1 — SD Aprobado', dueDate: new Date('2024-05-15'), status: 'approved', approvedAt: new Date('2024-05-14'), approvedById: sofiaUser.id },
            { phase: ProjectPhase.DD, label: 'Hito 2 — DD 100%', dueDate: new Date('2024-08-31'), status: 'approved', approvedAt: new Date('2024-08-30'), approvedById: sofiaUser.id },
          ],
        },
        teamMembers: {
          create: [
            { userId: sofiaUser.id, role: 'Project Manager' },
            { userId: marcoUser.id, role: 'Principal Review' },
            { userId: jorgeUser.id, role: 'Project Architect' },
          ],
        },
      },
    }),

    // P-2025-003 — Residencias Urubó (SD, 28%)
    prisma.project.create({
      data: {
        code: 'P-2025-003',
        name: 'Residencias Urubó',
        clientId: clients[2].id,
        projectManagerId: jorgeUser.id,
        type: ProjectType.RESIDENTIAL,
        contractType: ContractType.PERCENTAGE,
        currentPhase: ProjectPhase.SD,
        totalBudgetUSD: 145000,
        totalSpentUSD: 40600,
        overallProgressPercent: 28,
        status: ProjectStatus.AT_RISK,
        startDate: new Date('2024-09-01'),
        estimatedEndDate: new Date('2025-12-31'),
        phases: {
          create: [
            { phase: ProjectPhase.SD, label: 'Schematic Design', budgetUSD: 29000, spentUSD: 40600, progressPercent: 28, status: PhaseStatus.IN_PROGRESS, startDate: new Date('2024-09-01'), endDate: null },
            { phase: ProjectPhase.DD, label: 'Design Development', budgetUSD: 43500, spentUSD: 0, progressPercent: 0, status: PhaseStatus.NOT_STARTED, startDate: null, endDate: null },
            { phase: ProjectPhase.CD, label: 'Construction Documents', budgetUSD: 50750, spentUSD: 0, progressPercent: 0, status: PhaseStatus.NOT_STARTED, startDate: null, endDate: null },
            { phase: ProjectPhase.CA, label: 'Construction Administration', budgetUSD: 21750, spentUSD: 0, progressPercent: 0, status: PhaseStatus.NOT_STARTED, startDate: null, endDate: null },
          ],
        },
        milestones: {
          create: [
            { phase: ProjectPhase.SD, label: 'Hito 1 — SD 50%', dueDate: new Date('2024-11-30'), status: 'pending' },
          ],
        },
        teamMembers: {
          create: [
            { userId: jorgeUser.id, role: 'Project Manager' },
            { userId: paulaUser.id, role: 'Junior Architect' },
          ],
        },
      },
    }),

    // P-2025-004 — Centro Empresarial Norte (CA, 91%)
    prisma.project.create({
      data: {
        code: 'P-2025-004',
        name: 'Centro Empresarial Norte',
        clientId: clients[3].id,
        projectManagerId: sofiaUser.id,
        type: ProjectType.COMMERCIAL,
        contractType: ContractType.FIXED_FEE,
        currentPhase: ProjectPhase.CA,
        totalBudgetUSD: 385000,
        totalSpentUSD: 350350,
        overallProgressPercent: 91,
        status: ProjectStatus.CLOSING,
        startDate: new Date('2023-11-01'),
        estimatedEndDate: new Date('2025-03-31'),
        actualEndDate: null,
        phases: {
          create: [
            { phase: ProjectPhase.SD, label: 'Schematic Design', budgetUSD: 77000, spentUSD: 77000, progressPercent: 100, status: PhaseStatus.COMPLETE, startDate: new Date('2023-11-01'), endDate: new Date('2024-01-31') },
            { phase: ProjectPhase.DD, label: 'Design Development', budgetUSD: 115500, spentUSD: 115500, progressPercent: 100, status: PhaseStatus.COMPLETE, startDate: new Date('2024-02-01'), endDate: new Date('2024-05-31') },
            { phase: ProjectPhase.CD, label: 'Construction Documents', budgetUSD: 134750, spentUSD: 134750, progressPercent: 100, status: PhaseStatus.COMPLETE, startDate: new Date('2024-06-01'), endDate: new Date('2024-10-31') },
            { phase: ProjectPhase.CA, label: 'Construction Administration', budgetUSD: 57750, spentUSD: 23100, progressPercent: 40, status: PhaseStatus.IN_PROGRESS, startDate: new Date('2024-11-01'), endDate: null },
          ],
        },
        milestones: {
          create: [
            { phase: ProjectPhase.SD, label: 'Hito 1 — SD Aprobado', dueDate: new Date('2024-01-31'), status: 'approved', approvedAt: new Date('2024-01-30'), approvedById: sofiaUser.id },
            { phase: ProjectPhase.DD, label: 'Hito 2 — DD 100%', dueDate: new Date('2024-05-31'), status: 'approved', approvedAt: new Date('2024-05-30'), approvedById: sofiaUser.id },
            { phase: ProjectPhase.CD, label: 'Hito 3 — CD 100%', dueDate: new Date('2024-10-31'), status: 'approved', approvedAt: new Date('2024-10-30'), approvedById: sofiaUser.id },
          ],
        },
        teamMembers: {
          create: [
            { userId: sofiaUser.id, role: 'Project Manager' },
            { userId: marcoUser.id, role: 'Principal Architect' },
            { userId: lorenaUser.id, role: 'Coordinator' },
          ],
        },
      },
    }),

    // P-2025-005 — Hotel Camiri Boutique (DD, 44%)
    prisma.project.create({
      data: {
        code: 'P-2025-005',
        name: 'Hotel Camiri Boutique',
        clientId: clients[4].id,
        projectManagerId: paulaUser.id,
        type: ProjectType.COMMERCIAL,
        contractType: ContractType.TIME_AND_MATERIALS,
        currentPhase: ProjectPhase.DD,
        totalBudgetUSD: 164000,
        totalSpentUSD: 72160,
        overallProgressPercent: 44,
        status: ProjectStatus.ON_TRACK,
        startDate: new Date('2024-11-01'),
        estimatedEndDate: new Date('2025-10-31'),
        phases: {
          create: [
            { phase: ProjectPhase.SD, label: 'Schematic Design', budgetUSD: 32800, spentUSD: 32800, progressPercent: 100, status: PhaseStatus.COMPLETE, startDate: new Date('2024-11-01'), endDate: new Date('2025-01-15') },
            { phase: ProjectPhase.DD, label: 'Design Development', budgetUSD: 49200, spentUSD: 39360, progressPercent: 80, status: PhaseStatus.IN_PROGRESS, startDate: new Date('2025-01-16'), endDate: null },
            { phase: ProjectPhase.CD, label: 'Construction Documents', budgetUSD: 57400, spentUSD: 0, progressPercent: 0, status: PhaseStatus.NOT_STARTED, startDate: null, endDate: null },
            { phase: ProjectPhase.CA, label: 'Construction Administration', budgetUSD: 24600, spentUSD: 0, progressPercent: 0, status: PhaseStatus.NOT_STARTED, startDate: null, endDate: null },
          ],
        },
        milestones: {
          create: [
            { phase: ProjectPhase.SD, label: 'Hito 1 — SD Aprobado', dueDate: new Date('2025-01-15'), status: 'approved', approvedAt: new Date('2025-01-14'), approvedById: paulaUser.id },
          ],
        },
        teamMembers: {
          create: [
            { userId: paulaUser.id, role: 'Project Manager' },
            { userId: sofiaUser.id, role: 'Senior Architect' },
          ],
        },
      },
    }),

    // P-2025-006 — Nave Industrial Warnes (SD, 12%)
    prisma.project.create({
      data: {
        code: 'P-2025-006',
        name: 'Nave Industrial Warnes',
        clientId: clients[5].id,
        projectManagerId: diegoUser.id,
        type: ProjectType.INDUSTRIAL,
        contractType: ContractType.FIXED_FEE,
        currentPhase: ProjectPhase.SD,
        totalBudgetUSD: 92000,
        totalSpentUSD: 11040,
        overallProgressPercent: 12,
        status: ProjectStatus.ON_TRACK,
        startDate: new Date('2025-01-10'),
        estimatedEndDate: new Date('2025-11-30'),
        phases: {
          create: [
            { phase: ProjectPhase.SD, label: 'Schematic Design', budgetUSD: 18400, spentUSD: 11040, progressPercent: 12, status: PhaseStatus.IN_PROGRESS, startDate: new Date('2025-01-10'), endDate: null },
            { phase: ProjectPhase.DD, label: 'Design Development', budgetUSD: 27600, spentUSD: 0, progressPercent: 0, status: PhaseStatus.NOT_STARTED, startDate: null, endDate: null },
            { phase: ProjectPhase.CD, label: 'Construction Documents', budgetUSD: 32200, spentUSD: 0, progressPercent: 0, status: PhaseStatus.NOT_STARTED, startDate: null, endDate: null },
            { phase: ProjectPhase.CA, label: 'Construction Administration', budgetUSD: 13800, spentUSD: 0, progressPercent: 0, status: PhaseStatus.NOT_STARTED, startDate: null, endDate: null },
          ],
        },
        milestones: {
          create: [
            { phase: ProjectPhase.SD, label: 'Hito 1 — SD 50%', dueDate: new Date('2025-03-31'), status: 'pending' },
          ],
        },
        teamMembers: {
          create: [
            { userId: diegoUser.id, role: 'Project Manager' },
            { userId: marcoUser.id, role: 'Principal Review' },
          ],
        },
      },
    }),

    // P-2025-007 — Casa Gutiérrez (DD, 55%)
    prisma.project.create({
      data: {
        code: 'P-2025-007',
        name: 'Casa Gutiérrez',
        clientId: clients[6].id,
        projectManagerId: lorenaUser.id,
        type: ProjectType.RESIDENTIAL,
        contractType: ContractType.FIXED_FEE,
        currentPhase: ProjectPhase.DD,
        totalBudgetUSD: 48000,
        totalSpentUSD: 26400,
        overallProgressPercent: 55,
        status: ProjectStatus.ON_TRACK,
        startDate: new Date('2025-01-20'),
        estimatedEndDate: new Date('2025-07-31'),
        phases: {
          create: [
            { phase: ProjectPhase.SD, label: 'Schematic Design', budgetUSD: 9600, spentUSD: 9600, progressPercent: 100, status: PhaseStatus.COMPLETE, startDate: new Date('2025-01-20'), endDate: new Date('2025-02-28') },
            { phase: ProjectPhase.DD, label: 'Design Development', budgetUSD: 14400, spentUSD: 16800, progressPercent: 55, status: PhaseStatus.IN_PROGRESS, startDate: new Date('2025-03-01'), endDate: null },
            { phase: ProjectPhase.CD, label: 'Construction Documents', budgetUSD: 16800, spentUSD: 0, progressPercent: 0, status: PhaseStatus.NOT_STARTED, startDate: null, endDate: null },
            { phase: ProjectPhase.CA, label: 'Construction Administration', budgetUSD: 7200, spentUSD: 0, progressPercent: 0, status: PhaseStatus.NOT_STARTED, startDate: null, endDate: null },
          ],
        },
        milestones: {
          create: [
            { phase: ProjectPhase.SD, label: 'Hito 1 — SD Aprobado', dueDate: new Date('2025-02-28'), status: 'approved', approvedAt: new Date('2025-02-27'), approvedById: lorenaUser.id },
          ],
        },
        teamMembers: {
          create: [
            { userId: lorenaUser.id, role: 'Project Manager' },
            { userId: paulaUser.id, role: 'Junior Architect' },
          ],
        },
      },
    }),
  ])

  console.log(`✅ Created ${projects.length} projects`)

  // =========================================================================
  // INVOICES (5 from spec)
  // =========================================================================
  const invoices = await Promise.all([
    // INV-0142 — Hotel Camiri Boutique — $18,500 — Pending
    prisma.invoice.create({
      data: {
        number: 'INV-0142',
        projectId: projects[4].id,
        clientId: clients[4].id,
        amountUSD: 18500,
        currency: Currency.USD,
        exchangeRate: 1.0,
        status: InvoiceStatus.PENDING,
        issuedAt: new Date('2025-02-01'),
        dueDate: new Date('2025-03-03'),
        lineItems: {
          create: [
            { description: 'Hito 1 — SD Aprobado (50%)', quantity: 1, unitPriceUSD: 9200, totalUSD: 9200 },
            { description: 'Avance DD 30%', quantity: 1, unitPriceUSD: 9300, totalUSD: 9300 },
          ],
        },
      },
    }),
    // INV-0141 — Clínica Santa Rita — $29,600 — Overdue
    prisma.invoice.create({
      data: {
        number: 'INV-0141',
        projectId: projects[1].id,
        clientId: clients[1].id,
        amountUSD: 29600,
        currency: Currency.USD,
        exchangeRate: 1.0,
        status: InvoiceStatus.OVERDUE,
        issuedAt: new Date('2025-01-01'),
        dueDate: new Date('2025-01-31'),
        paidAt: null,
        lineItems: {
          create: [
            { description: 'Hito 2 — DD 100%', quantity: 1, unitPriceUSD: 29600, totalUSD: 29600 },
          ],
        },
      },
    }),
    // INV-0140 — Torre Buganvillas — $48,000 — Paid
    prisma.invoice.create({
      data: {
        number: 'INV-0140',
        projectId: projects[0].id,
        clientId: clients[0].id,
        amountUSD: 48000,
        currency: Currency.USD,
        exchangeRate: 1.0,
        status: InvoiceStatus.PAID,
        issuedAt: new Date('2024-11-01'),
        dueDate: new Date('2024-12-01'),
        paidAt: new Date('2024-11-28'),
        lineItems: {
          create: [
            { description: 'Hito 2 — DD 50%', quantity: 1, unitPriceUSD: 28000, totalUSD: 28000 },
            { description: 'Hito 3 — DD 100%', quantity: 1, unitPriceUSD: 20000, totalUSD: 20000 },
          ],
        },
      },
    }),
    // INV-0139 — Residencias Urubó — $21,750 — Paid
    prisma.invoice.create({
      data: {
        number: 'INV-0139',
        projectId: projects[2].id,
        clientId: clients[2].id,
        amountUSD: 21750,
        currency: Currency.USD,
        exchangeRate: 1.0,
        status: InvoiceStatus.PAID,
        issuedAt: new Date('2024-11-15'),
        dueDate: new Date('2024-12-15'),
        paidAt: new Date('2024-12-10'),
        lineItems: {
          create: [
            { description: 'Hito 1 — SD 50%', quantity: 1, unitPriceUSD: 21750, totalUSD: 21750 },
          ],
        },
      },
    }),
    // INV-0138 — Centro Empresarial Norte — $57,750 — Paid
    prisma.invoice.create({
      data: {
        number: 'INV-0138',
        projectId: projects[3].id,
        clientId: clients[3].id,
        amountUSD: 57750,
        currency: Currency.USD,
        exchangeRate: 1.0,
        status: InvoiceStatus.PAID,
        issuedAt: new Date('2024-10-01'),
        dueDate: new Date('2024-11-01'),
        paidAt: new Date('2024-10-28'),
        lineItems: {
          create: [
            { description: 'Hito 3 — CD 100%', quantity: 1, unitPriceUSD: 57750, totalUSD: 57750 },
          ],
        },
      },
    }),
  ])

  console.log(`✅ Created ${invoices.length} invoices`)

  // =========================================================================
  // LEADS (8 from spec pipeline)
  // =========================================================================
  const leads = await Promise.all([
    // PROSPECT
    prisma.lead.create({
      data: {
        projectName: 'Edificio Equipetrol Norte',
        company: 'Inmobiliaria Equipetrol',
        contactName: 'Arq. Gerardo Blum',
        contactEmail: 'gblum@equipetrol.bo',
        contactPhone: '+591 71123456',
        estimatedValueUSD: 280000,
        projectType: ProjectTypeLead.COMMERCIAL,
        pipelineStage: PipelineStage.PROSPECT,
        closeProbability: 35,
        aiScore: 72,
        aiScoreBreakdown: { margin: 80, clientHistory: 65, capacity: 70, complexity: 60, competition: 45 },
        aiRecommendation: AIRecommendation.GO,
        notes: 'Competencia activa con otra firma. Primera reunión en marzo.',
        sourceType: SourceType.REFERRAL,
        sortOrder: 1,
        assignedToId: marcoUser.id,
        createdAt: new Date('2025-02-15'),
      },
    }),
    prisma.lead.create({
      data: {
        projectName: 'Residencia Los Jardines',
        company: 'Familia Terrazas',
        contactName: 'Carlos Terrazas',
        contactEmail: 'cterrazas@email.bo',
        contactPhone: '+591 71223456',
        estimatedValueUSD: 85000,
        projectType: ProjectTypeLead.RESIDENTIAL,
        pipelineStage: PipelineStage.PROSPECT,
        closeProbability: 50,
        aiScore: 68,
        aiScoreBreakdown: { margin: 75, clientHistory: 55, capacity: 90, complexity: 40, competition: 20 },
        aiRecommendation: AIRecommendation.GO,
        notes: 'Cliente nuevo. Residencia de lujo en zona premium.',
        sourceType: SourceType.DIRECT,
        sortOrder: 2,
        assignedToId: jorgeUser.id,
        createdAt: new Date('2025-02-20'),
      },
    }),
    prisma.lead.create({
      data: {
        projectName: 'Clínica Dental Premium',
        company: 'Dental Premium SRL',
        contactName: 'Dra. Ana María López',
        contactEmail: 'alopez@dentalpremium.bo',
        contactPhone: '+591 71323456',
        estimatedValueUSD: 62000,
        projectType: ProjectTypeLead.COMMERCIAL,
        pipelineStage: PipelineStage.PROSPECT,
        closeProbability: 60,
        aiScore: 78,
        aiScoreBreakdown: { margin: 82, clientHistory: 70, capacity: 85, complexity: 55, competition: 30 },
        aiRecommendation: AIRecommendation.GO,
        notes: 'Proyecto pequeño pero rentable. Cliente referencia de Dr. Iturralde.',
        sourceType: SourceType.REFERRAL,
        sortOrder: 3,
        assignedToId: sofiaUser.id,
        createdAt: new Date('2025-02-22'),
      },
    }),
    // QUALIFIED
    prisma.lead.create({
      data: {
        projectName: 'Centro Comercial Palmasola',
        company: 'Palmasola Development',
        contactName: 'Ing. Mario Parada',
        contactEmail: 'mparada@palmasola.bo',
        contactPhone: '+591 71423456',
        estimatedValueUSD: 420000,
        projectType: ProjectTypeLead.COMMERCIAL,
        pipelineStage: PipelineStage.QUALIFIED,
        closeProbability: 65,
        aiScore: 85,
        aiScoreBreakdown: { margin: 88, clientHistory: 75, capacity: 60, complexity: 75, competition: 55 },
        aiRecommendation: AIRecommendation.GO,
        notes: 'Proyecto grande. Requerirán equipo dedicado. Primera reunión muy positiva.',
        sourceType: SourceType.NETWORK,
        sortOrder: 1,
        assignedToId: marcoUser.id,
        createdAt: new Date('2025-01-10'),
      },
    }),
    prisma.lead.create({
      data: {
        projectName: 'Torre Residencial Hamacas',
        company: 'Desarrollos Hamacas SA',
        contactName: 'Lic. Rodrigo Zelaya',
        contactEmail: 'rzelaya@hamacas.bo',
        contactPhone: '+591 71523456',
        estimatedValueUSD: 195000,
        projectType: ProjectTypeLead.RESIDENTIAL,
        pipelineStage: PipelineStage.QUALIFIED,
        closeProbability: 70,
        aiScore: 80,
        aiScoreBreakdown: { margin: 78, clientHistory: 68, capacity: 75, complexity: 70, competition: 60 },
        aiRecommendation: AIRecommendation.GO,
        notes: 'Torre de 12 pisos. Ubicación excelente. Cliente con experiencia previa.',
        sourceType: SourceType.REFERRAL,
        sortOrder: 2,
        assignedToId: sofiaUser.id,
        createdAt: new Date('2025-01-15'),
      },
    }),
    // PROPOSAL
    prisma.lead.create({
      data: {
        projectName: 'Remodelación Hotel Los Tajibos',
        company: 'Hoteles Tajibos SA',
        contactName: 'Sra. Carmen de Aramayo',
        contactEmail: 'caramayo@tajibos.bo',
        contactPhone: '+591 71623456',
        estimatedValueUSD: 78000,
        projectType: ProjectTypeLead.COMMERCIAL,
        pipelineStage: PipelineStage.PROPOSAL,
        closeProbability: 80,
        aiScore: 83,
        aiScoreBreakdown: { margin: 85, clientHistory: 90, capacity: 80, complexity: 50, competition: 10 },
        aiRecommendation: AIRecommendation.GO,
        notes: 'Cliente existente. Propuesta enviada. Esperando respuesta.',
        sourceType: SourceType.REFERRAL,
        sortOrder: 1,
        assignedToId: paulaUser.id,
        createdAt: new Date('2024-12-01'),
      },
    }),
    prisma.lead.create({
      data: {
        projectName: 'Colegio Internacional SCZ',
        company: 'Colegio Internacional',
        contactName: 'Dr. Fernando Roca',
        contactEmail: 'froca@colegiointernacional.bo',
        contactPhone: '+591 71723456',
        estimatedValueUSD: 135000,
        projectType: ProjectTypeLead.INSTITUTIONAL,
        pipelineStage: PipelineStage.PROPOSAL,
        closeProbability: 75,
        aiScore: 79,
        aiScoreBreakdown: { margin: 76, clientHistory: 72, capacity: 78, complexity: 68, competition: 40 },
        aiRecommendation: AIRecommendation.REVIEW,
        notes: 'Proyecto institucional. Complejidad media. Presupuesto limitado.',
        sourceType: SourceType.DIRECT,
        sortOrder: 2,
        assignedToId: jorgeUser.id,
        createdAt: new Date('2024-11-15'),
      },
    }),
    // NEGOTIATION
    prisma.lead.create({
      data: {
        projectName: 'Nave Industrial Warnes',
        company: 'Agro-Export Bolivia',
        contactName: 'Lic. Gonzalo Fernández',
        contactEmail: 'gfernandez@agroexport.bo',
        contactPhone: '+591 70623456',
        estimatedValueUSD: 92000,
        projectType: ProjectTypeLead.INDUSTRIAL,
        pipelineStage: PipelineStage.NEGOTIATION,
        closeProbability: 90,
        aiScore: 88,
        aiScoreBreakdown: { margin: 90, clientHistory: 85, capacity: 95, complexity: 45, competition: 5 },
        aiRecommendation: AIRecommendation.GO,
        notes: 'Cliente muy interesado. Negociando últimos detalles del contrato.',
        sourceType: SourceType.NETWORK,
        sortOrder: 1,
        assignedToId: diegoUser.id,
        createdAt: new Date('2024-10-01'),
      },
    }),
  ])

  console.log(`✅ Created ${leads.length} leads`)

  // =========================================================================
  // SAMPLE TASKS (per project)
  // =========================================================================
  const tasks = await Promise.all([
    // P-2025-001 Torre Buganvillas tasks
    prisma.task.create({
      data: {
        projectId: projects[0].id,
        phaseId: projects[0].phases?.[2]?.id, // CD phase
        assignedToId: jorgeUser.id,
        title: 'Completar documentación CD - Nivel 8',
        description: 'Desarrollar planos constructivos para el nivel 8 de la torre.',
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.HIGH,
        dueDate: new Date('2025-05-15'),
        estimatedHours: 40,
        loggedHours: 24,
      },
    }),
    prisma.task.create({
      data: {
        projectId: projects[0].id,
        phaseId: projects[0].phases?.[2]?.id,
        assignedToId: diegoUser.id,
        title: 'Modelo BIM - Detalles estructurales',
        description: 'Completar modelo BIM con detalles estructurales para CD.',
        status: TaskStatus.TODO,
        priority: TaskPriority.MEDIUM,
        dueDate: new Date('2025-05-31'),
        estimatedHours: 60,
        loggedHours: 0,
      },
    }),
    // P-2025-002 Clínica Santa Rita tasks
    prisma.task.create({
      data: {
        projectId: projects[1].id,
        phaseId: projects[1].phases?.[2]?.id, // CD phase
        assignedToId: jorgeUser.id,
        title: 'Revisión especialidades CD',
        description: 'Coordinar especialidades: arquitectura, estructura, MEP.',
        status: TaskStatus.REVIEW,
        priority: TaskPriority.HIGH,
        dueDate: new Date('2025-04-30'),
        estimatedHours: 32,
        loggedHours: 28,
      },
    }),
    prisma.task.create({
      data: {
        projectId: projects[1].id,
        phaseId: projects[1].phases?.[2]?.id,
        assignedToId: sofiaUser.id,
        title: 'Preparar presentación a cliente',
        description: 'Preparar presentación del avance de CD para reunión con cliente.',
        status: TaskStatus.TODO,
        priority: TaskPriority.URGENT,
        dueDate: new Date('2025-04-20'),
        estimatedHours: 8,
        loggedHours: 0,
      },
    }),
    // P-2025-003 Residencias Urubó tasks
    prisma.task.create({
      data: {
        projectId: projects[2].id,
        phaseId: projects[2].phases?.[0]?.id, // SD phase
        assignedToId: jorgeUser.id,
        title: 'Revisar propuestas estructurales',
        description: 'Evaluar alternativas estructurales para el proyecto residencial.',
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.MEDIUM,
        dueDate: new Date('2025-04-15'),
        estimatedHours: 20,
        loggedHours: 12,
      },
    }),
    // P-2025-005 Hotel Camiri tasks
    prisma.task.create({
      data: {
        projectId: projects[4].id,
        phaseId: projects[4].phases?.[1]?.id, // DD phase
        assignedToId: paulaUser.id,
        title: 'Desarrollar DD - Layout hotel',
        description: 'Completar layout y distribución del hotel boutique.',
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.HIGH,
        dueDate: new Date('2025-04-30'),
        estimatedHours: 48,
        loggedHours: 20,
      },
    }),
    prisma.task.create({
      data: {
        projectId: projects[4].id,
        phaseId: projects[4].phases?.[1]?.id,
        assignedToId: sofiaUser.id,
        title: 'Revisión de diseño exterior',
        description: 'Revisar propuesta de fachada y exteriores del hotel.',
        status: TaskStatus.TODO,
        priority: TaskPriority.MEDIUM,
        dueDate: new Date('2025-05-10'),
        estimatedHours: 16,
        loggedHours: 0,
      },
    }),
  ])

  console.log(`✅ Created ${tasks.length} tasks`)

  // =========================================================================
  // SAMPLE TIME ENTRIES
  // =========================================================================
  const now = new Date()
  const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)

  const timeEntries = await Promise.all([
    prisma.timeEntry.create({
      data: {
        userId: marcoUser.id,
        projectId: projects[0].id,
        phaseId: projects[0].phases?.[1]?.id, // DD
        taskId: tasks[0]?.id,
        description: 'Reunión de coordinación con cliente',
        hours: 3.5,
        date: lastWeek,
      },
    }),
    prisma.timeEntry.create({
      data: {
        userId: jorgeUser.id,
        projectId: projects[1].id,
        phaseId: projects[1].phases?.[2]?.id, // CD
        taskId: tasks[2]?.id,
        description: 'Desarrollo de planos arquitectónicos',
        hours: 6.0,
        date: lastWeek,
      },
    }),
    prisma.timeEntry.create({
      data: {
        userId: sofiaUser.id,
        projectId: projects[1].id,
        phaseId: projects[1].phases?.[2]?.id,
        taskId: tasks[3]?.id,
        description: 'Revisión de especialidades',
        hours: 4.0,
        date: lastWeek,
      },
    }),
    prisma.timeEntry.create({
      data: {
        userId: paulaUser.id,
        projectId: projects[4].id,
        phaseId: projects[4].phases?.[1]?.id,
        taskId: tasks[5]?.id,
        description: 'Layout inicial del hotel',
        hours: 5.0,
        date: lastWeek,
      },
    }),
    prisma.timeEntry.create({
      data: {
        userId: jorgeUser.id,
        projectId: projects[2].id,
        phaseId: projects[2].phases?.[0]?.id, // SD
        taskId: tasks[4]?.id,
        description: 'Estudio de alternativas estructurales',
        hours: 4.5,
        date: twoWeeksAgo,
      },
    }),
  ])

  console.log(`✅ Created ${timeEntries.length} time entries`)

  // =========================================================================
  // SAMPLE NOTIFICATIONS
  // =========================================================================
  const notifications = await Promise.all([
    prisma.notification.create({
      data: {
        userId: marcoUser.id,
        type: NotificationType.BUDGET_ALERT,
        message: 'Proyecto Residencias Urubó ha superado el 80% del presupuesto en fase SD.',
        read: false,
        data: { projectId: projects[2].id, alertType: 'budget_overrun' },
      },
    }),
    prisma.notification.create({
      data: {
        userId: sofiaUser.id,
        type: NotificationType.OVERDUE_INVOICE,
        message: 'La factura INV-0141 ($29,600) está vencida desde el 31/01/2025.',
        read: false,
        data: { invoiceId: invoices[1].id },
      },
    }),
    prisma.notification.create({
      data: {
        userId: sofiaUser.id,
        type: NotificationType.CAPACITY_ALERT,
        message: 'Sofía Herrera está al 98% de capacidad. Considere rebalancear carga.',
        read: true,
        data: { teamMemberId: sofiaUser.teamMember?.id },
      },
    }),
    prisma.notification.create({
      data: {
        userId: marcoUser.id,
        type: NotificationType.DEADLINE_APPROACHING,
        message: 'Hito 1 — SD 50% para Nave Industrial Warnes vence en 15 días.',
        read: false,
        data: { projectId: projects[5].id, milestoneId: null },
      },
    }),
  ])

  console.log(`✅ Created ${notifications.length} notifications`)

  // =========================================================================
  // SAMPLE EXPENSES
  // =========================================================================
  const expenses = await Promise.all([
    prisma.expense.create({
      data: {
        projectId: projects[0].id,
        description: 'Viaje a sitio de construcción',
        amountUSD: 85.0,
        currency: Currency.USD,
        incurredAt: new Date('2025-01-15'),
      },
    }),
    prisma.expense.create({
      data: {
        projectId: projects[1].id,
        description: 'Impresión de planos - Entrega cliente',
        amountUSD: 120.0,
        currency: Currency.USD,
        incurredAt: new Date('2025-02-01'),
      },
    }),
    prisma.expense.create({
      data: {
        projectId: projects[4].id,
        description: 'Visualización 3D exterior - Hotel Camiri',
        amountUSD: 450.0,
        currency: Currency.USD,
        incurredAt: new Date('2025-02-10'),
      },
    }),
  ])

  console.log(`✅ Created ${expenses.length} expenses`)

  // =========================================================================
  // SUMMARY
  // =========================================================================
  const userCount = await prisma.user.count()
  const clientCount = await prisma.client.count()
  const projectCount = await prisma.project.count()
  const leadCount = await prisma.lead.count()
  const invoiceCount = await prisma.invoice.count()
  const taskCount = await prisma.task.count()
  const phaseCount = await prisma.phase.count()
  const milestoneCount = await prisma.milestone.count()

  console.log('\n========================================')
  console.log('✅ Seed completed successfully!')
  console.log('========================================')
  console.log(`  Users:        ${userCount}`)
  console.log(`  Clients:      ${clientCount}`)
  console.log(`  Projects:     ${projectCount}`)
  console.log(`  Phases:       ${phaseCount}`)
  console.log(`  Milestones:  ${milestoneCount}`)
  console.log(`  Leads:       ${leadCount}`)
  console.log(`  Invoices:    ${invoiceCount}`)
  console.log(`  Tasks:       ${taskCount}`)
  console.log('\n  Admin login: admin@chaoarquitectura.bo')
  console.log('  Admin pass:  Cha0Admin2025!')
  console.log('========================================\n')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })