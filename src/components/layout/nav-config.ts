import {
  BadgeCheck,
  BookOpen,
  Building2,
  CalendarDays,
  ClipboardCheck,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Layers,
  Users,
  UserCog,
  Settings,
  ScrollText,
} from 'lucide-react'
import type { UserRole } from '@/generated/prisma/enums'

export interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  /** Items that are not built yet are shown greyed out, never as fake links. */
  comingSoon?: boolean
  phase?: number
}

export interface NavSection {
  title?: string
  items: NavItem[]
}

/**
 * The navigation for each portal.
 *
 * Items for features that arrive in later phases are listed with `comingSoon`
 * so the sidebar shows the real plan without pretending anything works yet.
 */
export const NAVIGATION: Record<UserRole, NavSection[]> = {
  ADMIN: [
    {
      items: [{ label: 'Dashboard', href: '/admin', icon: LayoutDashboard }],
    },
    {
      title: 'Academic Management',
      items: [
        { label: 'Academic Sessions', href: '/admin/academics/sessions', icon: CalendarDays },
        { label: 'Classes / Years', href: '/admin/academics/classes', icon: GraduationCap },
        { label: 'Divisions', href: '/admin/academics/divisions', icon: Users },
        { label: 'Programs', href: '/admin/academics/programs', icon: Layers },
        { label: 'Session Structure', href: '/admin/academics/structure', icon: LayoutDashboard },
        { label: 'Subjects', href: '/admin/academics/subjects', icon: BookOpen },
        { label: 'Curriculum', href: '/admin/academics/curriculum', icon: ScrollText },
        { label: 'Departments', href: '/admin/academics/departments', icon: Building2 },
        { label: 'Designations', href: '/admin/academics/designations', icon: BadgeCheck },
        { label: 'Exam Types', href: '/admin/academics/exam-types', icon: FileText },
      ],
    },
    {
      title: 'People',
      items: [
        { label: 'Students', href: '/admin/students', icon: GraduationCap },
        { label: 'Staff', href: '/admin/staff', icon: UserCog },
        { label: 'User Accounts', href: '/admin/users', icon: Users },
      ],
    },
    {
      title: 'Academics',
      items: [
        { label: 'Attendance', href: '/admin/attendance', icon: ClipboardCheck },
        { label: 'Attendance Reports', href: '/admin/attendance/reports', icon: ScrollText },
        { label: 'Exams', href: '/admin/exams', icon: FileText },
        { label: 'Results', href: '/admin/results', icon: ScrollText, comingSoon: true, phase: 9 },
      ],
    },
    {
      title: 'System',
      items: [
        { label: 'Audit Log', href: '/admin/audit', icon: ScrollText, comingSoon: true, phase: 14 },
        { label: 'Settings', href: '/admin/settings', icon: Settings },
      ],
    },
  ],

  STAFF: [
    {
      items: [
        { label: 'Dashboard', href: '/staff', icon: LayoutDashboard },
        { label: 'My Assignments', href: '/staff/assignments', icon: Layers },
        { label: 'My Students', href: '/staff/students', icon: Users },
        { label: 'My Profile', href: '/staff/profile', icon: UserCog },
        { label: 'Attendance', href: '/staff/attendance', icon: ClipboardCheck },
        { label: 'My Reports', href: '/staff/attendance/reports', icon: ScrollText },
        { label: 'Exams & Marks', href: '/staff/exams', icon: FileText },
        { label: 'Results', href: '/staff/results', icon: ScrollText },
        { label: 'Timetable', href: '/staff/timetable', icon: CalendarDays, comingSoon: true, phase: 10 },
      ],
    },
  ],

  STUDENT: [
    {
      items: [
        { label: 'Dashboard', href: '/student', icon: LayoutDashboard },
        { label: 'My Profile', href: '/student/profile', icon: Users, comingSoon: true, phase: 4 },
        { label: 'Attendance', href: '/student/attendance', icon: ClipboardCheck },
        { label: 'My Results', href: '/student/results', icon: ScrollText },
        { label: 'Timetable', href: '/student/timetable', icon: CalendarDays, comingSoon: true, phase: 10 },
      ],
    },
  ],
}

export const PORTAL_LABELS: Record<UserRole, string> = {
  ADMIN: 'Admin Portal',
  STAFF: 'Staff Portal',
  STUDENT: 'Student Portal',
}
