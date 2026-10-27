import { PersonalSettings } from '@/features/settings/PersonalSettings';
import { SecuritySettings } from '@/features/settings/SecuritySettings';
import { CustomInstructionsSettings } from '@/features/settings/CustomInstructionsSettings';
import { AdminPageBody } from '../AdminPageBody';

/** Settings · Account · Profile: about you, then chat preferences. */
export function ProfileSettingsPage() {
  return (
    <AdminPageBody>
      <PersonalSettings />
      <CustomInstructionsSettings />
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
