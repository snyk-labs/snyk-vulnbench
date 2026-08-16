import { LayoutDashboard, Users, Settings, Shield } from 'lucide-react';
import { Link, useOutletContext } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { useAuth } from '../../contexts/AuthContext';
import { useTenant } from '../../contexts/TenantContext';
import { useBranding } from '../../contexts/BrandingContext';

export default function DashboardPage() {
  const { user } = useAuth();
  const { activeTenant, role, isRootTenant } = useTenant();
  const { branding } = useBranding();
  const { showTeam } = useOutletContext<{ showTeam: boolean }>();

  return (
    <div>
      {branding.dashboardHtml && (
        <div className="mb-8" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(branding.dashboardHtml) }} />
      )}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">
          Welcome back, {user?.displayName?.split(' ')[0]}
        </h1>
        <p className="text-dark-400 mt-1">
          {activeTenant?.tenantName} &middot; <span className="capitalize">{role}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link
          to="/dashboard"
          className="bg-dark-900/50 backdrop-blur-sm border border-dark-800 rounded-2xl p-6 hover:border-dark-700 transition-colors"
        >
          <div className="w-12 h-12 rounded-xl bg-primary-500/20 flex items-center justify-center mb-4">
            <LayoutDashboard className="w-6 h-6 text-primary-400" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">Dashboard</h3>
          <p className="text-sm text-dark-400">View your organization's activity and metrics.</p>
        </Link>

        {showTeam && (
          <Link
            to="/team"
            className="bg-dark-900/50 backdrop-blur-sm border border-dark-800 rounded-2xl p-6 hover:border-dark-700 transition-colors"
          >
            <div className="w-12 h-12 rounded-xl bg-accent-purple/20 flex items-center justify-center mb-4">
              <Users className="w-6 h-6 text-accent-purple" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-1">Team</h3>
            <p className="text-sm text-dark-400">Manage your team members and invitations.</p>
          </Link>
        )}

        <Link
          to="/settings"
          className="bg-dark-900/50 backdrop-blur-sm border border-dark-800 rounded-2xl p-6 hover:border-dark-700 transition-colors"
        >
          <div className="w-12 h-12 rounded-xl bg-accent-cyan/20 flex items-center justify-center mb-4">
            <Settings className="w-6 h-6 text-accent-cyan" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">Settings</h3>
          <p className="text-sm text-dark-400">Manage your account and preferences.</p>
        </Link>

        {isRootTenant && (
          <Link
            to="/test-entitlements"
            className="bg-dark-900/50 backdrop-blur-sm border border-dark-800 rounded-2xl p-6 hover:border-dark-700 transition-colors"
          >
            <div className="w-12 h-12 rounded-xl bg-accent-emerald/20 flex items-center justify-center mb-4">
              <Shield className="w-6 h-6 text-accent-emerald" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-1">Test Entitlements</h3>
            <p className="text-sm text-dark-400">Test plan entitlements and verify upgrade flows.</p>
          </Link>
        )}
      </div>
    </div>
  );
}
