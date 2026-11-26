/** 锚链规划领域模型：全部长度单位米、质量千克、力用牛（展示时换算 kgf）。 */

export interface Point {
  x: number
  y: number
}

/** 锚链规格（单位长度重量决定悬链线刚度，破断力决定安全裕度）。 */
export interface ChainGrade {
  id: string
  name: string
  /** 每米空气中重量 kg/m */
  weightPerMeter: number
  /** 工作载荷上限 kgf（安全系数后的允许拉力） */
  workingLoadKg: number
}

/** 可选锚链方案 = 规格 × 链长。 */
export interface ChainOption {
  id: string
  gradeId: string
  /** 链长 m（含卧底余量） */
  length: number
}

export interface BuoySpec {
  id: 'A' | 'B'
  name: string
  /** 浮标质量 kg */
  mass: number
  /** 标体直径 m（决定占用水域半径） */
  diameter: number
  /** 水上受风面积 m² */
  windArea: number
  /** 形状阻力系数 */
  dragCoef: number
  /** 锚点坐标（海图米制坐标） */
  anchor: Point
  /** 名义布标位置（无风静态期望位） */
  nominal: Point
  /** 锚抓力 kgf（锚的水平持驻能力） */
  holdingKg: number
  /** 候选锚链 */
  chains: ChainOption[]
}

export interface GustSpec {
  id: 1 | 2
  period: number
  baseKnots: number
  ampKnots: number
  /** 起始相位的可知范围（度） */
  phaseMinDeg: number
  phaseMaxDeg: number
}

export interface WindSpec {
  /** 风的来向（度，罗经） */
  fromBearing: number
  /** 风向摆动半幅（度） */
  swingDeg: number
  gusts: [GustSpec, GustSpec]
}

export interface PlannerConfig {
  waterDepth: number
  /** 船只通行所需净宽 m（船宽 + 安全余量） */
  requiredClearance: number
  /** 仿真时域 s */
  horizon: number
  buoys: [BuoySpec, BuoySpec]
  wind: WindSpec
}

/** 单个浮标在某一时刻的沿风偏移解。 */
export interface BuoyState {
  /** 沿风轴向偏移 m（相对锚点，0=回到锚点正上方） */
  u: number
  /** 沿风速度 m/s */
  v: number
  /** 锚链顶端张力 kgf */
  topTensionKg: number
  /** 水平拉力 kgf（锚需要提供的水平持驻力） */
  horizontalKg: number
  /** 是否走锚 / 链被拉直失效 */
  dragging: boolean
  /** 锚链是否拉直（悬链线进入 taut 极限） */
  taut: boolean
}

export interface TraceFrame {
  t: number
  pa: Point
  pb: Point
  /** 两标外壳之间的净通道宽度 m */
  gap: number
  windKnots: number
  windFrom: number
  drag: boolean
}

export interface SimTrace {
  frames: TraceFrame[]
  minGap: number
  minGapTime: number
  everDrag: boolean
  maxTensionKg: number
}

export interface PhaseCell {
  phi1: number
  phi2: number
  minGap: number
  minGapTime: number
  drag: boolean
  depth: number
}

export type VerdictKind = 'safe' | 'closed' | 'unknown'

export interface PlanVerdict {
  kind: VerdictKind
  chainAId: string
  chainBId: string
  /** 全相位空间内最不利净宽 m */
  worstGap: number
  /** 最不利反例（封口或逼近封口的相位与时刻） */
  worst: { phi1: number; phi2: number; time: number; gap: number; drag: boolean } | null
  /** 已细化覆盖的相位单元比例 */
  coverage: number
  cells: PhaseCell[]
  /** 走锚反例数量 */
  dragHits: number
  /** 封口（净宽不足）反例数量 */
  closureHits: number
}

export interface CommittedPlan {
  chainAId: string
  chainBId: string
  /** 开赛采用的固定相位实现（度），裁判全程沿用 */
  realizedPhases: [number, number]
  committedAt: string
}
