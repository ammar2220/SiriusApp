import { supabase } from '../cloud/supabaseClient';
import { CloudProfile } from '../../types/cloud';
import { Alert } from 'react-native';

/**
 * ProfileService handles the synchronization of the user's
 * profile in the Supabase 'profiles' table.
 */
export class ProfileService {
  /**
   * Ensures a profile exists for the current authenticated user.
   * If it doesn't exist, it creates one.
   */
  async syncProfile(): Promise<CloudProfile | null> {
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error('[ProfileService] No authenticated user found:', authError);
      return null;
    }

    const userId = user.id;
    console.log('[ProfileService] Syncing profile for userId:', userId);

    // 1. Try to read the existing profile first
    const { data: existingProfile, error: fetchError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    console.log('[ProfileService] SELECT result:', { existingProfile, fetchError });

    if (!fetchError && existingProfile) {
      return existingProfile;
    }

    // 2. Only if no profile exists, create one using user_metadata
    const displayName = user.user_metadata?.display_name || 'Sirius User';

    const { data: newProfile, error: upsertError } = await supabase
      .from('profiles')
      .upsert({ id: userId, display_name: displayName }, { onConflict: 'id' })
      .select()
      .single();

    if (upsertError) {
      console.error('[ProfileService] Error creating profile:', upsertError);
      return null;
    }

    return newProfile;
  }
}

export default new ProfileService();
