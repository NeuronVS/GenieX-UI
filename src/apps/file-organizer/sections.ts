/** Sub-sections shown in the sidebar when the File Manager app is active. */
export type FileOrganizerSection = 'files' | 'settings';

export const FILE_ORGANIZER_SECTIONS: Array<{ id: FileOrganizerSection; label: string; icon: string }> = [
  { id: 'files', label: 'Files', icon: '🗂️' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];
