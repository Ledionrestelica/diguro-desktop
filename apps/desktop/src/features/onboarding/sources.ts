import driveLogo from '@/assets/integrations/google-drive.svg';
import notionLogo from '@/assets/integrations/notion.svg';
import slackLogo from '@/assets/integrations/slack.svg';
import oneDriveLogo from '@/assets/integrations/onedrive.svg';
import ferndeskLogo from '@/assets/integrations/ferndesk.jpg';

export type SourceId = 'google-drive' | 'notion' | 'slack' | 'onedrive' | 'ferndesk' | 'urls';

export type Source = {
  id: SourceId;
  name: string;
  description: string;
  logo: string | null;
  action: string;
  /** Team-only sources aren't offered on a personal account. */
  teamOnly: boolean;
};

/** Third-party sources in the order the Connect step lists them. Upload from
 *  computer is handled separately — it's the only one that works today. */
export const SOURCES: Source[] = [
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'Docs, Sheets, Slides and PDFs',
    logo: driveLogo,
    action: 'Connect',
    teamOnly: false,
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Wikis and team pages',
    logo: notionLogo,
    action: 'Connect',
    teamOnly: false,
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Channels and shared files',
    logo: slackLogo,
    action: 'Connect',
    teamOnly: true,
  },
  {
    id: 'onedrive',
    name: 'OneDrive',
    description: 'Word, Excel and PDFs',
    logo: oneDriveLogo,
    action: 'Connect',
    teamOnly: false,
  },
  {
    id: 'ferndesk',
    name: 'Ferndesk',
    description: 'Help center articles',
    logo: ferndeskLogo,
    action: 'Connect',
    teamOnly: true,
  },
  {
    id: 'urls',
    name: 'Public domain',
    description: 'Pages from public websites',
    logo: null,
    action: 'Add URLs',
    teamOnly: false,
  },
];
