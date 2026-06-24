import { apiClient, authHeaders } from './apiClient';

export type RecommendationItem = {
  id?: number | null;
  vendor_id?: number | null;
  name: string;
  price?: number | null;
  image_url?: string | null;
  reason?: string | null;
  score?: number | null;
  is_available?: boolean | null;
  pairs_with?: string[] | null;
};

export type RecommendationsResponse = {
  user_id: number;
  recommended_items: RecommendationItem[];
  trending_items: RecommendationItem[];
  popular_items: RecommendationItem[];
  top_recommended: RecommendationItem[];
  personalized_items: RecommendationItem[];
};

export type VendorRecommendationItem = {
  vendor_id: number;
  vendor_name: string;
  vendor_type: string;
  category: string | null;
  logo_url: string | null;
  rank_score: number;
  live_load: string;
  express_pickup: boolean;
  reason: string;
};

export type VendorRecommendationsResponse = {
  recommendations: VendorRecommendationItem[];
};

export type MenuSuggestionItem = {
  item_id: number;
  item_name: string;
  vendor_id: number;
  vendor_name: string;
  price_paise: number;
  image_url: string | null;
  is_available: boolean;
  reason: string;
  confidence: number;
};

export type MenuSuggestionsResponse = {
  personalized: MenuSuggestionItem[];
  trending: MenuSuggestionItem[];
};

export type SmartReorderItem = {
  item_id: number;
  item_name: string;
  vendor_id: number;
  vendor_name: string;
  price_paise: number;
  image_url: string | null;
  order_count: number;
  last_ordered_at: string;
  suggested_quantity: number;
  suggested_slot_id: number | null;
  suggested_slot_time: string | null;
};

export type SmartReorderResponse = {
  items: SmartReorderItem[];
  best_reorder_time: string;
  best_reorder_slot_id: number | null;
};

export type PickupTimeSlot = {
  slot_id: number;
  vendor_id: number;
  vendor_name: string;
  start_time: string;
  end_time: string;
  eta_minutes: number;
  congestion_level: string;
  delay_risk: string;
  score: number;
};

export type BestPickupTimeResponse = {
  best_slot: PickupTimeSlot | null;
  alternative_slots: PickupTimeSlot[];
  preferred_hour: number;
  preferred_hour_source: string;
};

export type PeakHourPeriod = {
  start_hour: number;
  end_hour: number;
  label: string;
  severity: string;
  avg_wait_minutes: number;
  order_volume: number;
};

export type PeakHourAlertData = {
  is_peak_now: boolean;
  current_period: PeakHourPeriod | null;
  peak_periods_today: PeakHourPeriod[];
  off_peak_windows: { hour: number; label: string; expected_wait_minutes: number }[];
  suggested_action: string;
};

export type PopularNearbyVendor = {
  vendor_id: number;
  vendor_name: string;
  vendor_type: string;
  category: string | null;
  logo_url: string | null;
  order_count: number;
  avg_rating: number;
  live_load: string;
};

export type PopularNearbyResponse = {
  food_vendors: PopularNearbyVendor[];
  stationery_vendors: PopularNearbyVendor[];
};

export async function getRecommendations(userId: number): Promise<RecommendationsResponse> {
  const res = await apiClient.get(`/recommendations/${userId}`);
  return res.data as RecommendationsResponse;
}

export async function getVendorRecommendations(): Promise<VendorRecommendationsResponse> {
  const res = await apiClient.get('/ai/vendor-recommendations', {
    headers: await authHeaders(),
  });
  return res.data as VendorRecommendationsResponse;
}

export async function getMenuSuggestions(): Promise<MenuSuggestionsResponse> {
  const res = await apiClient.get('/ai/menu-suggestions', {
    headers: await authHeaders(),
  });
  return res.data as MenuSuggestionsResponse;
}

export async function getSmartReorder(): Promise<SmartReorderResponse> {
  const res = await apiClient.get('/ai/smart-reorder', {
    headers: await authHeaders(),
  });
  return res.data as SmartReorderResponse;
}

export async function getBestPickupTime(): Promise<BestPickupTimeResponse> {
  const res = await apiClient.get('/ai/best-pickup-time', {
    headers: await authHeaders(),
  });
  return res.data as BestPickupTimeResponse;
}

export async function getPeakHourAlerts(): Promise<PeakHourAlertData> {
  const res = await apiClient.get('/ai/peak-hour-alerts', {
    headers: await authHeaders(),
  });
  return res.data as PeakHourAlertData;
}

export async function getPopularNearby(): Promise<PopularNearbyResponse> {
  const res = await apiClient.get('/ai/popular-nearby', {
    headers: await authHeaders(),
  });
  return res.data as PopularNearbyResponse;
}
