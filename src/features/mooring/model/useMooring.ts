import { computed, reactive, ref, shallowRef } from 'vue'
import { CHAIN_GRADES, defaultConfig } from '../model/defaults'
import { simulate, singleBuoySwing, totalForce } from '../lib/simulation'
import { verifyPlan } from '../lib/verify'
import { windAt } from '../lib/catenary'
import type {
  BuoySpec, ChainGrade, CommittedPlan, PlanVerdict, PlannerConfig, SimTrace,
} from '../model/types'

const G = 9.81

export interface MatrixCell {
  chainAId: string
  chainBId: string
  verdict: PlanVerdict
}

export function useMooring() {
  const config = reactive<PlannerConfig>(defaultConfig())
  const grades = new Map<string, ChainGrade>(CHAIN_GRADES.map(g => [g.id, g]))
  const chainAId = ref(config.buoys[0].chains[0].id)
  const chainBId = ref(config.buoys[1].chains[1].id)

  const matrix = shallowRef<MatrixCell[]>([])
  const verifying = ref(false)
  const progress = ref({ done: 0, total: 1 })

  /** 当前选中链组合的联合时间线（相位取验证得到的最不利反例；无反例则取范围中点）。 */
  const trace = shallowRef<SimTrace | null>(null)
  const activePhases = ref<[number, number]>([0, 0])
  const playing = ref(false)
  const cursor = ref(0)
  /** 用户正在查看的反例单元（默认跟随当前链组合的最不利情形）。 */
  const selectedCounterexample = ref<PlanVerdict['worst']>(null)
  const committed = shallowRef<CommittedPlan | null>(loadCommitted())

  const currentVerdict = computed(() =>
    matrix.value.find(m => m.chainAId === chainAId.value && m.chainBId === chainBId.value)?.verdict ?? null)

  const peakKnots = computed(() => {
    let peak = 0
    const [g1, g2] = config.wind.gusts
    for (let t = 0; t <= config.horizon; t += 1) {
      for (const p1 of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
        for (const p2 of [0.7, 2, 4, 5.5]) {
          peak = Math.max(peak, windAt(config.wind, t, p1, p2).knots)
        }
      }
    }
    void g1; void g2
    return peak
  })

  /** 单标在峰值风下的摆幅与受力（用于对照“单标最大摆幅”并强调其不足以判定双标门）。 */
  const singleSwings = computed(() => config.buoys.map(buoy => {
    const chainId = buoy.id === 'A' ? chainAId.value : chainBId.value
    const option = buoy.chains.find(c => c.id === chainId)!
    const grade = grades.get(option.gradeId)!
    return {
      buoyId: buoy.id,
      chainId,
      ...singleBuoySwing(buoy, grade, chainId, config.waterDepth, peakKnots.value),
    }
  }))

  function gradeOf(buoy: BuoySpec, chainId: string) {
    const option = buoy.chains.find(c => c.id === chainId)!
    return { option, grade: grades.get(option.gradeId)! }
  }

  async function runAll() {
    verifying.value = true
    progress.value = { done: 0, total: 1 }
    const [aIds, bIds] = [config.buoys[0].chains.map(c => c.id), config.buoys[1].chains.map(c => c.id)]
    const results: MatrixCell[] = []
    // 先统计全部作业量（含每组验证的粗网格+细化），保证进度不越界
    let totalJobs = 0
    const tally = (done: number, total: number) => { progress.value = { done, total } }
    for (const a of aIds) {
      for (const b of bIds) {
        const verdict = verifyPlan({ config, grades, chainAId: a, chainBId: b, onProgress: (d, t) => tally(totalJobs + d, totalJobs + t) })
        totalJobs += verdict.cells.length
        results.push({ chainAId: a, chainBId: b, verdict })
        // 让出主线程，便于进度条渲染
        await new Promise(r => setTimeout(r, 0))
      }
    }
    progress.value = { done: totalJobs, total: totalJobs }
    matrix.value = results
    verifying.value = false
    loadTraceForCurrent()
  }

  function phasesOf(verdict: PlanVerdict | null): [number, number] {
    if (verdict?.worst) return [verdict.worst.phi1, verdict.worst.phi2]
    const [g1, g2] = config.wind.gusts
    const mid = (lo: number, hi: number) => ((lo + hi) / 2) * Math.PI / 180
    return [mid(g1.phaseMinDeg, g1.phaseMaxDeg), mid(g2.phaseMinDeg, g2.phaseMaxDeg)]
  }

  function loadTraceForCurrent() {
    const verdict = currentVerdict.value
    const [p1, p2] = phasesOf(verdict)
    activePhases.value = [p1, p2]
    trace.value = simulate(config, grades, chainAId.value, chainBId.value, p1, p2)
    selectedCounterexample.value = verdict?.worst ?? null
    cursor.value = verdict?.worst?.time ?? 0
    playing.value = false
  }

  function selectChains(a: string, b: string) {
    chainAId.value = a
    chainBId.value = b
    if (matrix.value.length) loadTraceForCurrent()
  }

  /** 点开矩阵中任一方案：在原赛道海图上播放其最不利反例的最窄时刻。 */
  function inspectCell(a: string, b: string) {
    selectChains(a, b)
  }

  let timer = 0
  function togglePlay() {
    if (!trace.value) return
    if (playing.value) { playing.value = false; return }
    playing.value = true
    const stepMs = 100
    timer = window.setInterval(() => {
      if (!trace.value) return
      cursor.value += stepMs / 1000
      if (cursor.value >= config.horizon) {
        cursor.value = 0
      }
    }, stepMs)
  }
  function stopPlay() {
    playing.value = false
    clearInterval(timer)
  }
  function seek(t: number) {
    stopPlay()
    cursor.value = Math.max(0, Math.min(config.horizon, t))
  }

  /** 开赛：固定当前链组合与一组相位实现，裁判全程沿用同一组漂标位置序列。 */
  function commit() {
    if (!trace.value) return
    const plan: CommittedPlan = {
      chainAId: chainAId.value,
      chainBId: chainBId.value,
      realizedPhases: [
        activePhases.value[0] * 180 / Math.PI,
        activePhases.value[1] * 180 / Math.PI,
      ],
      committedAt: new Date().toISOString(),
    }
    committed.value = plan
    saveCommitted(plan)
  }

  const frameAtCursor = computed(() => {
    if (!trace.value) return null
    const frames = trace.value.frames
    const k = Math.round(cursor.value / 0.1)
    return frames[Math.min(frames.length - 1, Math.max(0, k))]
  })

  /** 裁判视图所需：开赛方案对应的完整漂标位置时间线。 */
  const committedTrace = computed(() => {
    if (!committed.value) return null
    return simulate(
      config, grades,
      committed.value.chainAId, committed.value.chainBId,
      committed.value.realizedPhases[0] * Math.PI / 180,
      committed.value.realizedPhases[1] * Math.PI / 180,
    )
  })

  return {
    config, grades, chainAId, chainBId, matrix, verifying, progress,
    trace, activePhases, playing, cursor, selectedCounterexample, committed,
    currentVerdict, singleSwings, peakKnots, frameAtCursor, committedTrace,
    gradeOf, runAll, selectChains, inspectCell, togglePlay, stopPlay, seek, commit,
    totalForceKg: (buoy: BuoySpec, knots: number) => totalForce(buoy, knots) / G,
  }
}

const STORAGE_KEY = 'mooring-plan-v1'
function loadCommitted(): CommittedPlan | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as CommittedPlan) : null
  } catch { return null }
}
function saveCommitted(plan: CommittedPlan) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(plan)) } catch { /* 忽略隐私模式 */ }
}
