import type { Status } from '../schema/enums.js';

export const GRID = 8;

export const CANVAS = {
  background: '#FFFFFF',
  marginX: 32,
  marginTop: 40,
  titleColor: '#0F172A',
  descriptionColor: '#475569',
};

export const TEXT = {
  caption: { size: 10, weight: 600, letterSpacing: 0.5, color: '#64748B' },
  label: { size: 14, weight: 600, maxLines: 3 },
  tech: { size: 12, weight: 400, maxLines: 2 },
  edgeLabel: { size: 11, weight: 400, maxWidth: 180, maxLines: 2 },
  groupTitle: { size: 11, weight: 600, letterSpacing: 0.6, color: '#475569' },
  title: { size: 20, weight: 600 },
  description: { size: 13, weight: 400 },
  badge: { size: 10, weight: 600 },
  note: { size: 11, weight: 400, color: '#475569' },
  slug: { size: 11, weight: 400, maxLines: 1, color: '#64748B' },
  subtitle: { size: 12, weight: 400, maxLines: 3, color: '#475569' },
  tag: { size: 10, weight: 600, height: 18, padX: 6, bg: '#FFFFFF', stroke: '#CBD5E1', text: '#334155' },
} as const;

export const FONT_FAMILY_REGULAR = "Inter, 'Helvetica Neue', Arial, sans-serif";
export const FONT_FAMILY_SEMIBOLD = "'Inter SemiBold', Inter, 'Helvetica Neue', Arial, sans-serif";

export interface StatusStyle {
  stroke: string;
  strokeWidth: number;
  dash?: string;
  fill: string;
  badgeBg: string;
  badgeText: string;
  labelColor: string;
  techColor: string;
  showBadge: boolean;
}

export const STATUS_STYLE: Record<Status, StatusStyle> = {
  new: {
    stroke: '#15803D',
    strokeWidth: 2.5,
    fill: '#DCFCE7',
    badgeBg: '#15803D',
    badgeText: '#FFFFFF',
    labelColor: '#0F172A',
    techColor: '#334155',
    showBadge: true,
  },
  changed: {
    stroke: '#B45309',
    strokeWidth: 2.5,
    dash: '7 4',
    fill: '#FEF3C7',
    badgeBg: '#B45309',
    badgeText: '#FFFFFF',
    labelColor: '#0F172A',
    techColor: '#334155',
    showBadge: true,
  },
  unchanged: {
    stroke: '#94A3B8',
    strokeWidth: 1.25,
    fill: '#F8FAFC',
    badgeBg: '#94A3B8',
    badgeText: '#FFFFFF',
    labelColor: '#334155',
    techColor: '#64748B',
    showBadge: false,
  },
};

export interface EdgeStyle {
  stroke: string;
  strokeWidth: number;
  dash?: string;
}

export const EDGE_STATUS_STYLE: Record<Status, EdgeStyle> = {
  new: { stroke: '#15803D', strokeWidth: 2 },
  changed: { stroke: '#B45309', strokeWidth: 2, dash: '6 4' },
  unchanged: { stroke: '#94A3B8', strokeWidth: 1.5 },
};

export const GROUP_STYLE = {
  stroke: '#CBD5E1',
  strokeWidth: 1,
  environmentDash: '4 3',
  fillByDepth: ['#F8FAFC', '#F1F5F9', '#E9EEF5'],
  titleBarHeight: 32,
  padding: 24,
};

export const LAYOUT_CONST = {
  gridCell: GRID,
  nodeMinHeight: 64,
  nodeContentWidthMin: 136,
  nodeContentWidthMax: 216,
  columnGapMin: 64,
  columnGapForLabelMin: 96,
  columnGapForLabelMax: 280,
  columnGapLabelPadding: 48,
  rowGapNodeNode: 32,
  rowGapWithGroup: 40,
  maxItemsPerColumnBeforeSplit: 8,
  columnSplitGap: 64,
  badgeHeight: 18,
  badgeOffsetFromCorner: 8,
};

export const ROUTE_COST = {
  step: 1,
  turn: 6,
  reuseSameOrientation: 10,
  perpendicularCrossing: 2,
  groupTitleBar: 8,
  nearGroupBorder: 3,
  insideForeignGroup: 1,
  nearGroupBorderDistance: 4,
};

export const ARROWHEAD = { length: 10, width: 8 };

export const ICON_CARD = {
  padX: 14,
  padY: 12,
  radius: 8,
  tile: 48,
  tileRadius: 8,
  icon: 36,
  tileFill: '#FFFFFF',
  tileStroke: '#E2E8F0',
  gapTileText: 12,
  textWMin: 112,
  textWMax: 184,
  minHeight: 72,
  labelMaxLines: 2,
  subtitleMaxLines: 3,
  dividerGap: 8,
  dividerColor: '#E2E8F0',
};
