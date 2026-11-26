import type {
  BuoySpec, ChainGrade, PlannerConfig, SimTrace, TraceFrame,
} from '../model/types'
import {
  currentForceNewton, equilibriumOffset, makeChain, solveCatenary, windAt, windAxis,
  windForceNewton, type ChainStatic,
} from './catenary'

const G = 9.81
const DT = 0.1
const EPS = 1e-6

interface BuoyRuntime {
  spec: BuoySpec
  chain: ChainStatic
  px: number
  py: number
  vx: number
  vy: number
  maxTensionKg: number
  drag: boolean
  overload: boolean
}

/** 某风速下浮标受到的总水平外力（N）。 */
export function totalForce(buoy: BuoySpec, knots: number): number {
  return windForceNewton(buoy, knots) + currentForceNewton(buoy, knots)
}

function makeRuntime(spec: BuoySpec, grades: Map<string, ChainGrade>, chainId: string): BuoyRuntime {
  const option = spec.chains.find(c => c.id === chainId)
  if (!option) throw new Error(`浮标 ${spec.id} 缺少锚链方案 ${chainId}`)
  const grade = grades.get(option.gradeId)
  if (!grade) throw new Error(`未知锚链规格 ${option.gradeId}`)
  return {
    spec,
    chain: makeChain(grade, option.length),
    px: spec.anchor.x,
    py: spec.anchor.y,
    vx: 0,
    vy: 0,
    maxTensionKg: 0,
    drag: false,
    overload: false,
  }
}

/**
 * 运行一次两标联合时域仿真。phi1/phi2 为固定相位实现（弧度）。
 * 纯函数：相同输入必然得到相同轨迹，保证反例可复算、裁判可复用同一组漂标位置。
 */
export function simulate(
  config: PlannerConfig,
  grades: Map<string, ChainGrade>,
  chainAId: string,
  chainBId: string,
  phi1: number,
  phi2: number,
): SimTrace {
  const depth = config.waterDepth
  const a = makeRuntime(config.buoys[0], grades, chainAId)
  const b = makeRuntime(config.buoys[1], grades, chainBId)
  // 从基准风平衡位启动，避免起步瞬态污染最窄时刻结论
  const baseAxis = windAxis(config.wind.fromBearing)
  for (const rt of [a, b]) {
    const force = totalForce(rt.spec, config.wind.gusts[0].baseKnots)
    const { u } = equilibriumOffset(rt.chain, force, depth)
    rt.px = rt.spec.anchor.x + baseAxis.x * u
    rt.py = rt.spec.anchor.y + baseAxis.y * u
  }

  const frames: TraceFrame[] = []
  let minGap = Infinity
  let minGapTime = 0
  let everDrag = false
  let maxTensionKg = 0
  const steps = Math.round(config.horizon / DT)

  for (let k = 0; k <= steps; k++) {
    const t = k * DT
    const sample = windAt(config.wind, t, phi1, phi2)
    const axis = windAxis(sample.fromDeg)
    stepBuoy(a, axis, sample.knots, depth)
    stepBuoy(b, axis, sample.knots, depth)

    const centerDist = Math.hypot(a.px - b.px, a.py - b.py)
    const gap = centerDist - (a.spec.diameter + b.spec.diameter) / 2
    if (gap < minGap) { minGap = gap; minGapTime = t }
    const drag = a.drag || b.drag || a.overload || b.overload
    everDrag ||= drag
    maxTensionKg = Math.max(maxTensionKg, a.maxTensionKg, b.maxTensionKg)

    frames.push({
      t,
      pa: { x: a.px, y: a.py },
      pb: { x: b.px, y: b.py },
      gap,
      windKnots: sample.knots,
      windFrom: sample.fromDeg,
      drag,
    })
  }
  return { frames, minGap, minGapTime, everDrag, maxTensionKg }
}

function stepBuoy(
  rt: BuoyRuntime,
  axis: { x: number; y: number },
  knots: number,
  depth: number,
) {
  const force = totalForce(rt.spec, knots)
  const dx = rt.px - rt.spec.anchor.x
  const dy = rt.py - rt.spec.anchor.y
  const r = Math.hypot(dx, dy)
  const cat = solveCatenary(rt.chain, Math.max(r, 0.001), depth)
  rt.maxTensionKg = Math.max(rt.maxTensionKg, cat.topTension / G)
  if (cat.topTension / G > rt.chain.grade.workingLoadKg) rt.overload = true
  if (cat.H / G > rt.spec.holdingKg) rt.drag = true

  // 水平张力指向锚点
  const tH = cat.H
  const tx = r > EPS ? -tH * dx / r : 0
  const ty = r > EPS ? -tH * dy / r : 0
  // 水动力线性阻尼（与标体直径平方成比例），阻尼比约 0.12，保留系泊动态相位差
  const c = 9 * rt.spec.diameter * rt.spec.diameter
  const m = rt.spec.mass
  const ax = (force * axis.x + tx - c * rt.vx) / m
  const ay = (force * axis.y + ty - c * rt.vy) / m
  rt.vx += ax * DT
  rt.vy += ay * DT
  let nx = rt.px + rt.vx * DT
  let ny = rt.py + rt.vy * DT

  // 链长半径约束：不可越过最大摆幅
  const ndx = nx - rt.spec.anchor.x
  const ndy = ny - rt.spec.anchor.y
  const nr = Math.hypot(ndx, ndy)
  const maxR = rt.chain.length * 0.995
  if (nr > maxR) {
    nx = rt.spec.anchor.x + ndx / nr * maxR
    ny = rt.spec.anchor.y + ndy / nr * maxR
    rt.vx *= 0.2
    rt.vy *= 0.2
  }
  rt.px = nx
  rt.py = ny
}

/** 单标在峰值风速下的准静态最大摆幅与受力（供面板展示单标最坏情况）。 */
export function singleBuoySwing(
  buoy: BuoySpec,
  grade: ChainGrade,
  chainId: string,
  depth: number,
  maxKnots: number,
) {
  const option = buoy.chains.find(c => c.id === chainId)
  if (!option) throw new Error(`浮标 ${buoy.id} 缺少锚链方案 ${chainId}`)
  const chain = makeChain(grade, option.length)
  const force = totalForce(buoy, maxKnots)
  const { u, cat } = equilibriumOffset(chain, force, depth)
  return {
    u,
    topTensionKg: cat.topTension / G,
    horizontalKg: cat.H / G,
    taut: cat.taut,
    overload: cat.topTension / G > grade.workingLoadKg,
    drag: cat.H / G > buoy.holdingKg,
  }
}
