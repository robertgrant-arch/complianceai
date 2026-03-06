'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  LayoutDashboard,
  Phone,
  Users,
  Settings,
  Tag,
  Archive,
  ClipboardList,
  Shield,
  ChevronRight,
  Activity,
  UserPlus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface NavItem {
  title: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
  roles?: string[];
  children?: NavItem[];
}

const navItems: NavItem[] = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
  },
  {
    title: 'Call Explorer',
    href: '/calls',
    icon: Phone,
  },
  {
    title: 'Agents',
    href: '/agents',
    icon: Users,
  },
  {
    title: 'Settings',
    href: '/settings',
    icon: Settings,
    roles: ['ADMIN', 'SUPERVISOR'],
    children: [
      {
        title: 'Keywords',
        href: '/settings/keywords',
        icon: Tag,
        roles: ['ADMIN', 'SUPERVISOR'],
      },
      {
        title: 'Retention',
        href: '/settings/retention',
        icon: Archive,
        roles: ['ADMIN'],
      },
      {
        title: 'Audit Log',
        href: '/settings/audit-log',
        icon: ClipboardList,
        roles: ['ADMIN', 'SUPERVISOR'],
      },
      {
        title: 'User Management',
        href: '/settings/users',
        icon: UserPlus,
        roles: ['ADMIN'],
      },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const userRole = session?.user?.role;

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard';
    return pathname.startsWith(href);
  };

  const canAccess = (item: NavItem) => {
    if (!item.roles) return true;
    return item.roles.includes(userRole || '');
  };

  return (
    <aside className="flex flex-col w-64 min-h-screen bg-sidebar border-r border-sidebar-border">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-border">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600">
          <Shield className="w-4 h-4 text-white" />
        </div>
        <div>
          <span className="font-bold text-sidebar-foreground text-sm">ComplianceAI</span>
          <div className="flex items-center gap-1 mt-0.5">
            <Activity className="w-2.5 h-2.5 text-green-400" />
            <span className="text-xs text-green-400">Live</span>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          if (!canAccess(item)) return null;

          const hasChildren = item.children && item.children.length > 0;
          const isParentActive = isActive(item.href);

          return (
            <div key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors group',
                  isParentActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground'
                )}
              >
                <item.icon className={cn(
                  'w-4 h-4 flex-shrink-0',
                  isParentActive ? 'text-blue-400' : 'text-sidebar-foreground/60 group-hover:text-sidebar-foreground'
                )} />
                <span className="flex-1">{item.title}</span>
                {item.badge && (
                  <Badge variant="info" className="text-xs px-1.5 py-0">{item.badge}</Badge>
                )}
                {hasChildren && (
                  <ChevronRight className={cn(
                    'w-3 h-3 transition-transform',
                    isParentActive && 'rotate-90'
                  )} />
                )}
              </Link>

              {/* Sub-navigation */}
              {hasChildren && isParentActive && (
                <div className="ml-4 mt-1 space-y-1 border-l border-sidebar-border pl-3">
                  {item.children!.map((child) => {
                    if (!canAccess(child)) return null;
                    const isChildActive = pathname === child.href;

                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={cn(
                          'flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors',
                          isChildActive
                            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                        )}
                      >
                        <child.icon className="w-3.5 h-3.5 flex-shrink-0" />
                        {child.title}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* User info at bottom */}
      {session?.user && (
        <div className="px-3 py-3 border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-sidebar-accent/30">
            <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-white">
                {session.user.name?.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-sidebar-foreground truncate">{session.user.name}</p>
              <p className="text-xs text-sidebar-foreground/50 truncate">{session.user.role}</p>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
