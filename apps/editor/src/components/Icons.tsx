import type { SVGProps } from 'react';
import type { IconType } from 'react-icons';
import {
  LuActivity,
  LuBell,
  LuBox,
  LuCheck,
  LuChevronDown,
  LuChevronLeft,
  LuChevronRight,
  LuChevronUp,
  LuCircleCheck,
  LuCircleHelp,
  LuClipboard,
  LuClock,
  LuCode,
  LuCommand,
  LuCopy,
  LuCrosshair,
  LuDatabase,
  LuDownload,
  LuEye,
  LuEyeOff,
  LuFilePlus2,
  LuFileText,
  LuFilter,
  LuFolder,
  LuHistory,
  LuKeyboard,
  LuLayers,
  LuLayoutDashboard,
  LuLayoutGrid,
  LuLink2,
  LuList,
  LuLockKeyhole,
  LuLockKeyholeOpen,
  LuMaximize,
  LuMinus,
  LuMonitor,
  LuMove,
  LuPalette,
  LuPanelBottom,
  LuPanelLeft,
  LuPanelRight,
  LuPause,
  LuPenLine,
  LuPlay,
  LuPlus,
  LuRedo2,
  LuRocket,
  LuSave,
  LuScissors,
  LuSearch,
  LuSettings,
  LuShieldCheck,
  LuSlidersHorizontal,
  LuSmartphone,
  LuSparkles,
  LuTable2,
  LuTag,
  LuTablet,
  LuTextCursorInput,
  LuTrash2,
  LuType,
  LuUndo2,
  LuUpload,
  LuWandSparkles,
  LuWorkflow,
  LuX,
  LuZoomIn,
  LuZoomOut
} from 'react-icons/lu';

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
  | 'cut'
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
  | 'chevron-left'
  | 'chevron-up'
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
  | 'panel-right'
  | 'panel-bottom'
  | 'file'
  | 'file-plus'
  | 'folder'
  | 'settings'
  | 'rocket'
  | 'activity'
  | 'shield'
  | 'keyboard'
  | 'command'
  | 'help'
  | 'download'
  | 'filter'
  | 'crosshair'
  | 'minus'
  | 'code'
  | 'palette'
  | 'table'
  | 'list'
  | 'wand'
  | 'circle-check'
  | 'tag'
  | 'clock';

const ICONS: Record<IconName, IconType> = {
  search: LuSearch,
  plus: LuPlus,
  save: LuSave,
  undo: LuUndo2,
  redo: LuRedo2,
  eye: LuEye,
  'eye-off': LuEyeOff,
  lock: LuLockKeyhole,
  unlock: LuLockKeyholeOpen,
  trash: LuTrash2,
  copy: LuCopy,
  cut: LuScissors,
  paste: LuClipboard,
  duplicate: LuCopy,
  edit: LuPenLine,
  play: LuPlay,
  pause: LuPause,
  sparkles: LuSparkles,
  monitor: LuMonitor,
  tablet: LuTablet,
  smartphone: LuSmartphone,
  grid: LuLayoutGrid,
  check: LuCheck,
  x: LuX,
  'chevron-right': LuChevronRight,
  'chevron-down': LuChevronDown,
  'chevron-left': LuChevronLeft,
  'chevron-up': LuChevronUp,
  'zoom-in': LuZoomIn,
  'zoom-out': LuZoomOut,
  workflow: LuWorkflow,
  sliders: LuSlidersHorizontal,
  layout: LuLayoutDashboard,
  text: LuType,
  input: LuTextCursorInput,
  link: LuLink2,
  database: LuDatabase,
  bell: LuBell,
  box: LuBox,
  move: LuMove,
  history: LuHistory,
  upload: LuUpload,
  layers: LuLayers,
  maximize: LuMaximize,
  'panel-left': LuPanelLeft,
  'panel-right': LuPanelRight,
  'panel-bottom': LuPanelBottom,
  file: LuFileText,
  'file-plus': LuFilePlus2,
  folder: LuFolder,
  settings: LuSettings,
  rocket: LuRocket,
  activity: LuActivity,
  shield: LuShieldCheck,
  keyboard: LuKeyboard,
  command: LuCommand,
  help: LuCircleHelp,
  download: LuDownload,
  filter: LuFilter,
  crosshair: LuCrosshair,
  minus: LuMinus,
  code: LuCode,
  palette: LuPalette,
  table: LuTable2,
  list: LuList,
  wand: LuWandSparkles,
  'circle-check': LuCircleCheck,
  tag: LuTag,
  clock: LuClock
};

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 16, ...rest }: IconProps) {
  const Component = ICONS[name] ?? LuBox;
  return <Component aria-hidden="true" size={size} {...rest} />;
}

export const ICON_DEFINITIONS = Object.keys(ICONS) as IconName[];
