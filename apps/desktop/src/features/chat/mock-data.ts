export interface MockOrg {
  id: string;
  name: string;
  shortName: string;
}

/**
 * Placeholder org info used by OrgSwitcher and TopBar until the real
 * organization-selector feature lands (depends on Member rows + active org).
 */
export const mockOrg: MockOrg = {
  id: 'placeholder',
  name: 'Personal',
  shortName: 'Personal',
};
