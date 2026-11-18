import type { SVGProps } from 'react';

export type IconName =
  | 'search'
  | 'plus'
  | 'save'
  | 'undo'
  | 'redo'
  | 'eye'
  | 'eye-off'
  | 'lock'
  | 'unlock'
  | 'trash'
  | 'copy'
  | 'paste'
  | 'duplicate'
  | 'edit'
  | 'play'
  | 'pause'
  | 'sparkles'
  | 'monitor'
  | 'tablet'
  | 'smartphone'
  | 'grid'
  | 'check'
  | 'x'
  | 'chevron-right'
  | 'chevron-down'
  | 'zoom-in'
  | 'zoom-out'
  | 'workflow'
  | 'sliders'
  | 'layout'
  | 'text'
  | 'input'
  | 'link'
  | 'database'
  | 'bell'
  | 'box'
  | 'move'
  | 'history'
  | 'upload'
  | 'layers'
  | 'maximize'
  | 'panel-left'
  | 'panel-right';

const PATHS: Record<IconName, string[]> = {
  search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z', 'm21 21-4.35-4.35'],
  plus: ['M12 5v14', 'M5 12h14'],
  save: ['M5 3h12l4 4v14H5z', 'M9 3v6h7', 'M8 15h8v6H8z'],
  undo: ['M9 14 4 9l5-5', 'M4 9h10a6 6 0 0 1 0 12h-3'],
  redo: ['m15 14 5-5-5-5', 'M20 9H10a6 6 0 0 0 0 12h3'],
  eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'],
  'eye-off': [
    'm3 3 18 18',
    'M10.6 5.2A11 11 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4',
    'M6.2 6.3C3.5 8.1 2 12 2 12s3.5 7 10 7a10 10 0 0 0 4-.8'
  ],
  lock: ['M6 11h12v10H6z', 'M9 11V7a3 3 0 0 1 6 0v4'],
  unlock: ['M6 11h12v10H6z', 'M9 11V7a3 3 0 0 1 6 0'],
  trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 14h10l1-14', 'M10 11v6', 'M14 11v6'],
  copy: ['M9 9h11v11H9z', 'M5 15H4V4h11v1'],
  paste: ['M9 4h6v3H9z', 'M6 6h3v3h6V6h3v14H6z'],
  duplicate: ['M8 8h12v12H8z', 'M4 16V4h12'],
  edit: ['m4 20 4-1 11-11-3-3L5 16z', 'M14 6l3 3'],
  play: ['m8 5 11 7-11 7z'],
  pause: ['M8 5v14', 'M16 5v14'],
  sparkles: [
    'm12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
    'M19 17l.7 2.3L22 20l-2.3.7L19 23l-.7-2.3L16 20l2.3-.7z'
  ],
  monitor: ['M3 4h18v13H3z', 'M8 21h8', 'M12 17v4'],
  tablet: ['M6 3h12v18H6z', 'M11 18h2'],
  smartphone: ['M8 2h8v20H8z', 'M11 18h2'],
  grid: ['M4 4h6v6H4z', 'M14 4h6v6h-6z', 'M4 14h6v6H4z', 'M14 14h6v6h-6z'],
  check: ['m5 12 5 5L20 7'],
  x: ['M6 6l12 12', 'M18 6 6 18'],
  'chevron-right': ['m9 6 6 6-6 6'],
  'chevron-down': ['m6 9 6 6 6-6'],
  'zoom-in': ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z', 'm21 21-4.35-4.35', 'M11 8v6', 'M8 11h6'],
  'zoom-out': ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z', 'm21 21-4.35-4.35', 'M8 11h6'],
  workflow: ['M5 4h5v5H5z', 'M14 15h5v5h-5z', 'M7.5 9v4h7', 'M14 13v2'],
  sliders: ['M4 6h16', 'M4 12h16', 'M4 18h16', 'M9 4v4', 'M16 10v4', 'M7 16v4'],
  layout: ['M4 4h16v16H4z', 'M4 10h16', 'M10 10v10'],
  text: ['M5 6h14', 'M12 6v13', 'M9 19h6'],
  input: ['M4 7h16v10H4z', 'M8 10h3', 'M8 14h6'],
  link: [
    'M10 13a5 5 0 0 0 7 .1l2-2a5 5 0 0 0-7-7l-1 1',
    'M14 11a5 5 0 0 0-7-.1l-2 2a5 5 0 0 0 7 7l1-1'
  ],
  database: [
    'M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3Z',
    'M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6',
    'M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3'
  ],
  bell: ['M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9', 'M10 21h4'],
  box: ['m12 3 9 5v8l-9 5-9-5V8z', 'm3 8 9 5 9-5', 'M12 13v8'],
  move: ['M12 2v20', 'M2 12h20', 'm9 5 3-3 3 3', 'm9 19 3 3 3-3', 'm5 9-3 3 3 3', 'm19 9 3 3-3 3'],
  history: ['M3 12a9 9 0 1 0 3-6.7', 'M3 4v5h5', 'M12 7v5l3 2'],
  upload: ['M12 16V4', 'm7 9 5-5 5 5', 'M4 16v4h16v-4'],
  layers: ['m12 3 9 5-9 5-9-5z', 'm3 13 9 5 9-5', 'm3 17 9 5 9-5'],
  maximize: ['M4 9V4h5', 'M20 9V4h-5', 'M4 15v5h5', 'M20 15v5h-5'],
  'panel-left': ['M4 4h16v16H4z', 'M9 4v16'],
  'panel-right': ['M4 4h16v16H4z', 'M15 4v16']
};

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 16, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {(PATHS[name] ?? PATHS.box).map((path, index) => (
        <path key={index} d={path} />
      ))}
    </svg>
  );
}
