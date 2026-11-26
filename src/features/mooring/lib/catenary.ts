import { radians } from '../../../shared/math'
import type { BuoySpec, ChainGrade, Point, WindSpec } from '../model/types'

/** 标准大气压空气密度 kg/m³ */
const AIR_DENSITY = 1.225
/** 海水密度 kg/m³（浮力修正） */
const SEA_DENSITY = 1025
const G = 9.81
/** 数值求解收敛精度（m） */
const EPS = 1e-5

export interface ChainStatic {
  grade: ChainGrade
  /** 总长 m */
  length: number
  /** 每米水中重量 N/m（海水减重，取 0.87 系数近似） */
  w: number
}

export function makeChain(grade: ChainGrade, length: number): ChainStatic {
  return { grade, length, w: grade.weightPerMeter * G * 0.87 }
}

export interface CatenaryResult {
  /** 水平张力 N */
  H: number
  /** 顶端（浮标端）总张力 N */
  topTension: number
  /** 卧底余量 m（≥0） */
  slack: number
  /** 链是否进入拉直极限 */
  taut: boolean
}

/**
 * 悬链线静力学。锚点在海床 (0,0)，浮标端相对锚点水平偏移 u、抬升 depth。
 * 分两种形态：
 *  1) 有卧底余量（链在海床处水平离开）：恒等式给出 a = (u²-h²)/(2h)，要求 u≥h；
 *  2) 全链悬起（u<h 或链较短）：由 L²-h² = 2a²(cosh(u/a)-1) 即
 *     sqrt(L²-h²) = 2a·sinh(u/2a) 二分求 a。
 * 水平张力 H = w·a。
 */
export function solveCatenary(chain: ChainStatic, u: number, depth: number): CatenaryResult {
  const { w, length: L } = chain
  const h = Math.max(EPS, depth)
  const span = Math.hypot(u, h)
  // 链长不足直线距离：进入弹性拉直极限，给出连续且快速增长的张力。
  // 等效弹性模量取锚链常见量级，使 H 随伸长度平滑上升，避免起步瞬态的假“走锚”。
  if (L <= span + EPS) {
    const overstretch = Math.max(0, (span - L) / L)
    const EA = w * L * 6.0 // 等效轴向刚度（N），随链重标定
    const H = w * Math.max(1, h) * 0.5 + EA * overstretch
    const topTension = Math.hypot(H, w * L * 0.5)
    return { H, topTension, slack: 0, taut: true }
  }
  let a: number
  let slack = 0
  let topTension: number
  if (u >= h) {
    // 形态一：海床水平切点 + 卧底余量
    a = Math.max(EPS, (u * u - h * h) / (2 * h))
    const S = a * Math.asinh(u / a) // 悬起段长度
    if (S <= L) {
      slack = Math.max(0, L - S)
      topTension = w * a * Math.cosh(S / a)
      return { H: w * a, topTension, slack, taut: false }
    }
    // 链不足以形成水平切点：落入全悬支
    a = solveGeneralA(u, h, L)
    const zSum = 2 * Math.atanh(Math.min(0.9999, h / L))
    const z2 = (zSum + u / a) / 2
    topTension = w * a * Math.cosh(z2)
  } else {
    // u<h：若链长够垂到海床，链呈垂直垂挂+床面堆积，水平张力近似 0
    if (L >= h) {
      return { H: w * EPS * 10, topTension: w * h, slack: L - h, taut: false }
    }
    // 链短到无法触床：全悬支
    a = solveGeneralA(u, h, L)
    const zSum = 2 * Math.atanh(Math.min(0.9999, h / L))
    const z2 = (zSum + u / a) / 2
    topTension = w * a * Math.cosh(z2)
  }
  return { H: w * a, topTension, slack, taut: false }
}

/** 二分求解全悬悬链线参数 a。f(a)=2a·sinh(u/2a) 单调递减，值域 (u, +∞)。 */
function solveGeneralA(u: number, h: number, L: number): number {
  const target = Math.sqrt(L * L - h * h)
  const f = (a: number) => 2 * a * Math.sinh(u / (2 * a))
  let lo = EPS
  let hi = Math.max(1, L)
  let guard = 0
  while (f(lo) < target && guard < 60) { lo /= 2; guard++ }
  guard = 0
  while (f(hi) > target && guard < 60) { hi *= 2; guard++ }
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2
    if (f(mid) > target) lo = mid
    else hi = mid
    if (hi - lo < EPS * Math.max(1, lo)) break
  }
  return (lo + hi) / 2
}

/** 风载荷 F = 0.5·ρ·Cd·A·v²（N）。 */
export function windForceNewton(buoy: BuoySpec, windKnots: number): number {
  const v = windKnots * 0.514444
  return 0.5 * AIR_DENSITY * buoy.dragCoef * buoy.windArea * v * v
}

/** 表层流附加力（取风速 3% 折算的流速，方向同轴）。 */
export function currentForceNewton(buoy: BuoySpec, windKnots: number): number {
  const vCurrent = windKnots * 0.514444 * 0.03
  const submergedArea = buoy.diameter * buoy.diameter * 0.6
  return 0.5 * SEA_DENSITY * 1.05 * submergedArea * vCurrent * vCurrent
}

export interface WindSample {
  knots: number
  fromDeg: number
}

/**
 * 两股阵风叠加的风时序。phi1/phi2（弧度）为起始相位，规划时只知道范围，
 * 对相位空间穷举；播放与开赛时取固定实现。
 * 风速 = 基准 + A1·sin(2πt/T1 + φ1) + A2·sin(2πt/T2 + φ2)。
 */
export function windAt(wind: WindSpec, t: number, phi1: number, phi2: number): WindSample {
  const [g1, g2] = wind.gusts
  const raw = g1.baseKnots
    + g1.ampKnots * Math.sin((2 * Math.PI * t) / g1.period + phi1)
    + g2.ampKnots * Math.sin((2 * Math.PI * t) / g2.period + phi2)
  const knots = Math.max(0.5, raw)
  const swing = wind.swingDeg * (0.55 * Math.sin((2 * Math.PI * t) / (g1.period * 1.7) + phi1 * 0.5)
    + 0.45 * Math.sin((2 * Math.PI * t) / (g2.period * 2.3) + phi2 * 0.5))
  return { knots, fromDeg: wind.fromBearing + swing }
}

/** 风轴向单位向量（风“吹去”的方向，即浮标受力方向）。 */
export function windAxis(fromDeg: number): Point {
  const to = fromDeg + 180
  return { x: Math.sin(radians(to)), y: -Math.cos(radians(to)) }
}

/**
 * 准静态平衡偏移：给定总水平外力 F（N），反求沿风偏移 u 使 H(u)=F。
 * H 关于 u 单调，二分求解。
 */
export function equilibriumOffset(chain: ChainStatic, forceN: number, depth: number): {
  u: number
  cat: CatenaryResult
} {
  const maxU = chain.length * 0.98
  if (solveCatenary(chain, 0, depth).H >= forceN) {
    return { u: 0, cat: solveCatenary(chain, 0, depth) }
  }
  let lo = 0
  let hi = maxU
  let cat = solveCatenary(chain, hi, depth)
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    cat = solveCatenary(chain, mid, depth)
    if (cat.H > forceN) hi = mid
    else lo = mid
    if (hi - lo < EPS) break
  }
  return { u: (lo + hi) / 2, cat }
}
