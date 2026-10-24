import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Supabase client configuration.
 *
 * Using the production publishable key and project URL.
 */
const SUPABASE_URL = 'https://ilwdaoxftjscrztawkna.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_kw6DQ5YdNTo25DsWnKoXDA_bKdST-vK';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
