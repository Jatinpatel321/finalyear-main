import api from './axios';

export const adminApi = {
  // Analytics
  getAnalytics: () =>
    api.get('/v1/admin/analytics'),

  // Vendor management
  getVendors: () =>
    api.get('/v1/admin/vendors'),

  getPendingVendors: async () => {
    const res = await api.get('/v1/admin/vendors');
    if (Array.isArray(res.data)) {
      res.data = res.data.filter((v: any) => !v.is_approved && v.is_active !== false);
    }
    return res;
  },

  approveVendor: (id: number) =>
    api.post(`/v1/admin/vendors/${id}/approve`),

  rejectVendor: (id: number) =>
    api.post(`/v1/admin/vendors/${id}/reject`),

  // User management
  toggleUser: (id: number) =>
    api.post(`/v1/admin/users/${id}/toggle`),

  getUsers: (params?: {
    page?: number;
    page_size?: number;
    search?: string;
    role?: string;
    is_active?: boolean;
  }) =>
    api.get('/v1/admin/users', { params }),

  updateUserStatus: (id: number, is_active: boolean) =>
    api.patch(`/v1/admin/users/${id}/status`, { is_active }),

  // Orders
  getAllOrders: (params?: Record<string, unknown>) =>
    api.get('/v1/admin/orders', { params }),

  flagOrderFraud: (id: number) =>
    api.post(`/v1/admin/orders/${id}/fraud`),

  // Ledger
  getLedger: (params?: Record<string, unknown>) =>
    api.get('/v1/admin/ledger', { params }),

  // Shutdown
  toggleShutdown: (enabled: boolean = true) =>
    api.post('/v1/admin/shutdown', null, { params: { enabled } }),

  // Announcements
  sendAnnouncement: (_title: string, message: string) =>
    api.post('/v1/admin/announce', null, { params: { message } }),

  // Policies
  getFacultyPolicy: () =>
    api.get('/v1/admin/policies/faculty-priority'),

  setFacultyPolicy: (policy: any) =>
    api.post('/v1/admin/policies/faculty-priority', null, {
      params: {
        enabled: policy.is_active,
        start_hour: policy.time_windows?.[0]?.start ? parseInt(policy.time_windows[0].start.split(':')[0]) : 12,
        end_hour: policy.time_windows?.[0]?.end ? parseInt(policy.time_windows[0].end.split(':')[0]) : 14,
      },
    }),

  getUniversityPolicy: () =>
    api.get('/v1/admin/policies/university'),

  setUniversityPolicy: (policy: any) =>
    api.post('/v1/admin/policies/university', null, {
      params: {
        enabled: policy.is_active,
        break_start_hour: policy.break_windows?.[0]?.start ? parseInt(policy.break_windows[0].start.split(':')[0]) : 12,
        break_end_hour: policy.break_windows?.[0]?.end ? parseInt(policy.break_windows[0].end.split(':')[0]) : 14,
        max_orders_per_user: policy.max_orders_per_user_per_day ?? 3,
        min_slot_duration_minutes: 15,
      },
    }),

  // Health
  getHealth: () =>
    api.get('/health'),

  // Audit logs
  getAuditLogs: (params?: {
    page?: number;
    page_size?: number;
    search?: string;
    action_category?: string;
    date_from?: string;
    date_to?: string;
  }) =>
    api.get('/v1/admin/audit-logs', { params }),

  // Conflict resolution
  getConflicts: () =>
    api.get('/v1/admin/conflicts'),

  // Export endpoints
  exportOrders: (params?: { date_from?: string; date_to?: string; status?: string }) =>
    api.get('/v1/admin/export/orders', { params, responseType: 'blob' }),

  exportUsers: (params?: { role?: string; is_active?: boolean }) =>
    api.get('/v1/admin/export/users', { params, responseType: 'blob' }),

  exportVendors: () =>
    api.get('/v1/admin/export/vendors', { responseType: 'blob' }),

  exportComplaints: (params?: { status?: string }) =>
    api.get('/v1/admin/export/complaints', { params, responseType: 'blob' }),

  exportRevenue: (params?: { date_from?: string; date_to?: string }) =>
    api.get('/v1/admin/export/revenue', { params, responseType: 'blob' }),
};