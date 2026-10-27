import { PersonalSettings } from '@/features/settings/PersonalSettings';
import { SecuritySettings } from '@/features/settings/SecuritySettings';
import { AdminPageBody } from '../AdminPageBody';

/** Settings · Account · Profile. */
export function ProfileSettingsPage() {
  return (
    <AdminPageBody>
      <PersonalSettings />
    </AdminPageBody>
  );
}

/** Settings · Account · Security. */
export function SecuritySettingsPage() {
  return (
    <AdminPageBody>
      <SecuritySettings />
    </AdminPageBody>
  );
}
