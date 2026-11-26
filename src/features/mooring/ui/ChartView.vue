<script setup lang="ts">
import { computed } from 'vue'
import { Anchor, Ruler, TriangleAlert, CircleCheck, CircleHelp } from 'lucide-vue-next'
import type { CommittedPlan, PlannerConfig, Point, SimTrace } from '../model/types'
import { makeChain, windAxis } from '../lib/catenary'

const props = defineProps<{
  config: PlannerConfig
  trace: SimTrace | null
  frameIndex: number
  chainAId: string
  chainBId: string
  grades: Map<string, { id: string; name: string; weightPerMeter: number; workingLoadKg: number }>
  committed: CommittedPlan | null
}>()

const VIEW = { w: 960, h: 570 }

const frame = computed(() => props.trace?.frames[Math.min(props.frameIndex, props.trace.frames.length - 1)] ?? null)

const envelopeA = computed(() => props.trace ? envelope(props.trace.frames.map(f => f.pa)) : [])
const envelopeB = computed(() => props.trace ? envelope(props.trace.frames.map(f => f.pb)) : [])

function envelope(points: Point[]): Point[] {
  if (points.length < 3) return points
  // 凸包（Andrew monotone chain），用于绘制可达水域包线
  const pts = [...points].sort((p, q) => p.x - q.x || p.y - q.y)
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: Point[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Point[] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1))
}

const path = (pts: Point[]) => pts.length ? pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') + ' Z' : ''

const buoyA = computed(() => props.config.buoys[0])
const buoyB = computed(() => props.config.buoys[1])

const chainOf = (buoyIndex: 0 | 1, chainId: string) => {
  const buoy = props.config.buoys[buoyIndex]
  const option = buoy.chains.find(c => c.id === chainId)!
  return makeChain(props.grades.get(option.gradeId)!, option.length)
}

/** 当前帧锚链形态（用直线+悬链线弧近似绘制，取锚点到浮标的下垂弧）。 */
function chainArc(anchor: Point, buoyPos: Point, buoyIndex: 0 | 1, chainId: string) {
  const chain = chainOf(buoyIndex, chainId)
  const mx = (anchor.x + buoyPos.x) / 2
  const my = (anchor.y + buoyPos.y) / 2
  const dx = buoyPos.x - anchor.x
  const dy = buoyPos.y - anchor.y
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  // 下垂量：链越松弛弧越大
  const slack = Math.max(0, chain.length - len)
  const sag = Math.min(26, 4 + slack * 0.9)
  return `M${anchor.x.toFixed(1)} ${anchor.y.toFixed(1)} Q${(mx + nx * sag).toFixed(1)} ${(my + ny * sag).toFixed(1)} ${buoyPos.x.toFixed(1)} ${buoyPos.y.toFixed(1)}`
}

const gateLine = computed(() => {
  if (!frame.value) return null
  const { pa, pb } = frame.value
  return { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y }
})

const windArrow = computed(() => {
  if (!frame.value) return null
  const ax = windAxis(frame.value.windFrom)
  const cx = 470, cy = 92
  const len = 34 + frame.value.windKnots * 1.1
  return { x1: cx - ax.x * len / 2, y1: cy - ax.y * len / 2, x2: cx + ax.x * len / 2, y2: cy + ax.y * len / 2 }
})

const clearanceOk = computed(() => (frame.value?.gap ?? 0) >= props.config.requiredClearance)

// 网格水深点装饰
const soundings = Array.from({ length: 22 }, (_, i) => ({
  x: 70 + (i % 7) * 135 + ((i * 37) % 23),
  y: 120 + Math.floor(i / 7) * 130 + ((i * 53) % 19),
  d: 9 + ((i * 7) % 11),
}))
</script>

<template>
  <section class="chart" aria-label="赛道海图">
    <svg class="sea-chart" :viewBox="`0 0 ${VIEW.w} ${VIEW.h}`" role="img" aria-label="门标摆动海图">
      <defs>
        <pattern id="sea-grid" width="48" height="48" patternUnits="userSpaceOnUse">
          <path d="M48 0H0V48" fill="none" stroke="#8fb4b5" stroke-opacity=".22" />
        </pattern>
      </defs>
      <rect :width="VIEW.w" :height="VIEW.h" fill="#27555b" />
      <rect :width="VIEW.w" :height="VIEW.h" fill="url(#sea-grid)" />
      <text v-for="(s, i) in soundings" :key="i" :x="s.x" :y="s.y" fill="#a7c2bd" opacity=".5" class="depth">{{ s.d }}</text>

      <!-- 可达水域包线 -->
      <path :d="path(envelopeA)" fill="#ffd455" fill-opacity=".10" stroke="#ffd455" stroke-opacity=".55" stroke-dasharray="3 5" />
      <path :d="path(envelopeB)" fill="#e77c62" fill-opacity=".10" stroke="#e77c62" stroke-opacity=".55" stroke-dasharray="3 5" />

      <!-- 名义门线 -->
      <line :x1="buoyA.anchor.x" :y1="buoyA.anchor.y" :x2="buoyB.anchor.x" :y2="buoyB.anchor.y"
        stroke="#cdd8c8" stroke-opacity=".45" stroke-dasharray="2 7" />

      <template v-if="frame">
        <!-- 锚链 -->
        <path :d="chainArc(buoyA.anchor, frame.pa, 0, chainAId)" fill="none" stroke="#d8d2b8" stroke-width="2" opacity=".9" />
        <path :d="chainArc(buoyB.anchor, frame.pb, 1, chainBId)" fill="none" stroke="#d8d2b8" stroke-width="2" opacity=".9" />

        <!-- 当前门线与净宽 -->
        <line v-bind="gateLine" :stroke="clearanceOk ? '#9fe0a8' : '#ff6b5e'" stroke-width="3" stroke-linecap="round" />
        <!-- 通行船宽示意（沿门线居中） -->
        <g :transform="`translate(${(frame.pa.x + frame.pb.x) / 2} ${(frame.pa.y + frame.pb.y) / 2})`" opacity=".92">
          <rect :x="-config.requiredClearance / 2" :y="-3.4" :width="config.requiredClearance" :height="6.8"
            fill="none" :stroke="clearanceOk ? '#bdecc4' : '#ff9a90'" stroke-dasharray="4 3" />
        </g>

        <!-- 浮标 -->
        <g v-for="(pos, idx) in [frame.pa, frame.pb]" :key="idx">
          <circle :cx="pos.x" :cy="pos.y" :r="(idx === 0 ? buoyA.diameter : buoyB.diameter) / 2 * 3.2"
            :fill="idx === 0 ? '#ffd455' : '#e77c62'" stroke="#1c3a3c" stroke-width="2" />
          <text :x="pos.x" :y="pos.y + 4" text-anchor="middle" class="buoy-label">{{ idx === 0 ? 'A' : 'B' }}</text>
        </g>
      </template>

      <!-- 锚点 -->
      <g v-for="(buoy, idx) in config.buoys" :key="buoy.id">
        <g :transform="`translate(${buoy.anchor.x} ${buoy.anchor.y})`">
          <circle r="6.5" fill="#20333a" stroke="#e9e2c6" stroke-width="1.6" />
          <g transform="translate(-6.5 -6.5)"><Anchor :size="13" :stroke-width="2" color="#e9e2c6" /></g>
        </g>
        <text :x="buoy.anchor.x + 11" :y="buoy.anchor.y + 18" fill="#d8e0d2" class="water-text">锚 {{ buoy.id }}</text>
      </g>

      <!-- 风矢 -->
      <g v-if="windArrow">
        <line v-bind="windArrow" stroke="#f1e9cd" stroke-width="2" />
        <circle cx="470" cy="92" r="30" fill="none" stroke="#f1e9cd" stroke-opacity=".4" />
        <text x="470" y="50" text-anchor="middle" fill="#f1e9cd" class="depth">{{ frame?.windKnots.toFixed(1) }} kn</text>
      </g>

      <!-- 指北针与比例尺 -->
      <g transform="translate(902 56)" stroke="#f1e9cd" fill="none">
        <circle r="20" opacity=".5" /><path d="M0 14V-12M-9 0H9" /><path d="M-4-7L0-13 4-7" />
        <text x="0" y="-25" text-anchor="middle" fill="#f1e9cd" stroke="none" class="depth">N</text>
      </g>
      <g transform="translate(40 540)" stroke="#a5c3bb" fill="none">
        <path d="M0-5V0H100V-5M50 0V-5" /><text y="-10" fill="#c4d8ce" stroke="none" class="depth">10 m</text>
      </g>
    </svg>

    <div class="chart-tag">
      <component :is="clearanceOk ? CircleCheck : TriangleAlert" :size="15" />
      <span>当前净宽 <b data-testid="live-gap">{{ frame?.gap.toFixed(2) ?? '—' }} m</b> / 需 {{ config.requiredClearance }} m</span>
    </div>
    <div class="chart-state">
      <component :is="committed ? CircleCheck : CircleHelp" :size="14" />
      {{ committed ? '裁判方案已锁定' : '规划中（相位未锁定）' }}
      <Ruler :size="13" style="margin-left:4px" />
    </div>
  </section>
</template>
