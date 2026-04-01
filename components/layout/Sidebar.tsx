'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart2, LayoutDashboard, ShoppingCart, TrendingUp, Package, Brain, PieChart, Users, ShieldCheck, LogOut, X, GitMerge, KeyRound, Activity, Truck, Archive } from 'lucide-react';
import { useSession, signOut } from 'next-auth/react';
import { useSidebar } from './ConditionalLayout';

const navItems = [
  { icon: LayoutDashboard, label: 'Klíčové ukazatele (KPI)', href: '/dashboard' },
  { icon: ShoppingCart,    label: 'Objednávky',               href: '/orders' },
  { icon: TrendingUp,      label: 'Marketingové investice',   href: '/marketing' },
  { icon: PieChart,        label: 'Maržový report',           href: '/margin' },
  { icon: Truck,           label: 'Doprava a platba',         href: '/shipping' },
  { icon: Package,         label: 'Prodejnost produktů',      href: '/products' },
  { icon: Brain,           label: 'Nákupní chování',          href: '/behavior' },
  { icon: GitMerge,        label: 'Cross-sell potenciál',     href: '/crosssell' },
  { icon: Archive,         label: 'Stav skladu',              href: '/stock' },
  { icon: Users,           label: 'Retenční analýza',         href: '/retention' },
  { icon: Activity,        label: 'Návštěvnost (GA4)',        href: '/analytics' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { isOpen, close } = useSidebar();
  const isAdmin = session?.user?.role === 'admin';

  return (
    <div
      className={`fixed left-0 top-0 h-screen w-60 flex flex-col z-50 transition-transform duration-300
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        md:translate-x-0`}
      style={{ backgroundColor: '#1e3a5f' }}
    >
      {/* Logo + close button (mobile) */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-white/10">
        <BarChart2 className="text-blue-300 flex-shrink-0" size={22} />
        <span className="text-white font-semibold text-base leading-tight flex-1">
          Manažerský<br />
          <span className="text-blue-300 text-sm font-normal">reporting</span>
        </span>
        <button
          onClick={close}
          className="md:hidden text-blue-300 hover:text-white p-1 -mr-1"
          aria-label="Zavřít menu"
        >
          <X size={18} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ icon: Icon, label, href }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              onClick={close}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white font-medium'
                  : 'text-blue-100 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon size={17} className={isActive ? 'text-white' : 'text-blue-300'} />
              <span>{label}</span>
            </Link>
          );
        })}

        {isAdmin && (
          <>
            <div className="pt-3 pb-1 px-3">
              <p className="text-blue-400 text-xs uppercase tracking-wider font-medium">Admin</p>
            </div>
            <Link
              href="/admin/users"
              onClick={close}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                pathname.startsWith('/admin/users')
                  ? 'bg-blue-600 text-white font-medium'
                  : 'text-blue-100 hover:bg-white/10 hover:text-white'
              }`}
            >
              <ShieldCheck size={17} className={pathname.startsWith('/admin/users') ? 'text-white' : 'text-blue-300'} />
              <span>Správa uživatelů</span>
            </Link>
          </>
        )}
      </nav>

      {/* User + Logout */}
      <div className="px-3 py-4 border-t border-white/10">
        {session?.user && (
          <div className="px-3 mb-2">
            <p className="text-white text-xs font-medium truncate">{session.user.name}</p>
            <p className="text-blue-400 text-xs truncate">{session.user.email}</p>
          </div>
        )}
        <Link
          href="/profile"
          onClick={close}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
            pathname === '/profile'
              ? 'bg-blue-600 text-white font-medium'
              : 'text-blue-100 hover:bg-white/10 hover:text-white'
          }`}
        >
          <KeyRound size={17} className={pathname === '/profile' ? 'text-white' : 'text-blue-300'} />
          <span>Změnit heslo</span>
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-blue-100 hover:bg-white/10 hover:text-white transition-colors"
        >
          <LogOut size={17} className="text-blue-300" />
          <span>Odhlásit se</span>
        </button>
      </div>
    </div>
  );
}
