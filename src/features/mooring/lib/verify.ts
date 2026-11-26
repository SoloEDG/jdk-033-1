import { radians } from '../../../shared/math'
import type {
  ChainGrade, PhaseCell, PlanVerdict, PlannerConfig,
} from '../model/types'
import { simulate } from './simulation'

/** 粗网格分辨率（每股阵风相位方向上的采样数）。 */
const COARSE_GRID = 11
/** 边界单元自适应细化的最大递归深度。 */
const MAX_REFINE_DEPTH = 3
/** 判定安全所要求的最小裕度（m）：净宽必须高出通行宽度该值才算“证明安全”。 */
const SAFE_MARGIN = 1.5

export interface VerifyContext {
  config: PlannerConfig
  grades: Map<string, ChainGrade>
  chainAId: string
  chainBId: string
  onProgress?: (done: number, total: number) => void
}

/**
 * 对一组锚链方案做相位空间验证。
 *
 * 关键原则：每个 (phi1, phi2) 网格点对应“一条可共存的运动时间线”——
 * 两标在同一阵风实现、同一时钟下共同摆动。封口判定只取该时间线内部的最窄时刻，
 * 绝不把 A 标最危险时刻与 B 标最危险时刻拼成一次虚构封口。
 *
 * 三态：
 *  - safe   ：全部已采样单元均保留安全裕度，且细化后无边界异常 → 可保证通行；
 *  - closed ：至少一条时间线出现封口（净宽 < 通行宽度）或走锚/过载；
 *  - unknown ：粗采样未封口但裕度不足、且细化后仍无法证明安全。
 */
export function verifyPlan(ctx: VerifyContext): PlanVerdict {
  const { config, grades, chainAId, chainBId } = ctx
  const [g1, g2] = config.wind.gusts
  const p1Min = radians(g1.phaseMinDeg)
  const p1Max = radians(g1.phaseMaxDeg)
  const p2Min = radians(g2.phaseMinDeg)
  const p2Max = radians(g2.phaseMaxDeg)
  const clearance = config.requiredClearance

  const cells: PhaseCell[] = []
  let dragHits = 0
  let closureHits = 0
  let worst: PlanVerdict['worst'] = null
  let done = 0
  const totalJobs = COARSE_GRID * COARSE_GRID

  const runCell = (phi1: number, phi2: number, depth: number): PhaseCell => {
    const trace = simulate(config, grades, chainAId, chainBId, phi1, phi2)
    const cell: PhaseCell = {
      phi1, phi2,
      minGap: trace.minGap,
      minGapTime: trace.minGapTime,
      drag: trace.everDrag,
      depth,
    }
    if (cell.drag) dragHits++
    if (cell.minGap < clearance) closureHits++
    if (!worst || cell.minGap < worst.gap) {
      worst = { phi1, phi2, time: trace.minGapTime, gap: trace.minGap, drag: cell.drag }
    }
    done++
    ctx.onProgress?.(done, totalJobs)
    return cell
  }

  // 1) 粗网格全覆盖
  const grid: PhaseCell[][] = []
  for (let i = 0; i < COARSE_GRID; i++) {
    const row: PhaseCell[] = []
    const phi1 = p1Min + (p1Max - p1Min) * (i / (COARSE_GRID - 1))
    for (let j = 0; j < COARSE_GRID; j++) {
      const phi2 = p2Min + (p2Max - p2Min) * (j / (COARSE_GRID - 1))
      const cell = runCell(phi1, phi2, 0)
      row.push(cell)
      cells.push(cell)
    }
    grid.push(row)
  }

  // 2) 边界自适应细化：若相邻单元一安全一危险（或裕度跨越阈值），在中点补点
  const isCritical = (c: PhaseCell) => c.drag || c.minGap < clearance + SAFE_MARGIN
  const seen = new Set(cells.map(c => `${c.phi1.toFixed(6)}|${c.phi2.toFixed(6)}`))
  const addRefinement = (c1: PhaseCell, c2: PhaseCell, depth: number) => {
    if (depth >= MAX_REFINE_DEPTH) return
    const phi1 = (c1.phi1 + c2.phi1) / 2
    const phi2 = (c1.phi2 + c2.phi2) / 2
    const key = `${phi1.toFixed(6)}|${phi2.toFixed(6)}`
    if (seen.has(key)) return
    seen.add(key)
    const mid = runCell(phi1, phi2, depth)
    cells.push(mid)
    if (isCritical(mid) !== isCritical(c1)) addRefinement(mid, c1, depth + 1)
    if (isCritical(mid) !== isCritical(c2)) addRefinement(mid, c2, depth + 1)
  }
  for (let i = 0; i < COARSE_GRID; i++) {
    for (let j = 0; j < COARSE_GRID; j++) {
      const c00 = grid[i][j]
      for (const nb of [grid[i + 1]?.[j], grid[i][j + 1]].filter(Boolean) as PhaseCell[]) {
        if (isCritical(c00) !== isCritical(nb)) addRefinement(c00, nb, 1)
      }
    }
  }

  // 3) 汇总结论
  const worstGap = Math.min(...cells.map(c => c.minGap))
  const anyClosure = cells.some(c => c.minGap < clearance || c.drag)
  const allProvenSafe = cells.every(c => !c.drag && c.minGap >= clearance + SAFE_MARGIN)
  const kind = anyClosure ? 'closed' : allProvenSafe ? 'safe' : 'unknown'
  // 覆盖率：粗网格基础上经细化后，每 36° 等效单元的检验密度（仅作透明度展示）
  const coarseCount = COARSE_GRID * COARSE_GRID
  const coverage = cells.length / coarseCount

  return {
    kind,
    chainAId,
    chainBId,
    worstGap,
    worst,
    coverage,
    cells,
    dragHits,
    closureHits,
  }
}
