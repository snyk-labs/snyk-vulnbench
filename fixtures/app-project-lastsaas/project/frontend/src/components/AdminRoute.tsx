import { Navigate, Outlet } from 'react-router-dom';
import { useTenant } from '../contexts/TenantContext';

export default function AdminRoute() {
  const { isRootTenant } = useTenant();

  if (!isRootTenant) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
