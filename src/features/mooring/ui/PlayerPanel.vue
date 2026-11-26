<script setup lang="ts">
import { computed } from 'vue'
import { Pause, Play, RotateCcw, Wind } from 'lucide-vue-next'
import { clock } from '../../../shared/format'
import type { PlanVerdict, PlannerConfig, SimTrace } from '../model/types'

const props = defineProps<{
  config: PlannerConfig
  trace: SimTrace | null
  cursor: number
  playing: boolean
  verdict: PlanVerdict | null
  activePhases: [number, number]
}>()
const emit = defineEmits<{ toggle: []; seek: [t: number]; replay: [] }>()

const gapSeries = computed(() => {
  if (!props.trace) return ''
  const w = 300, h = 64
  const frames = props.trace.frames
  const min = Math.min(...frames.map(f => f.gap))
  const max = Math.max(...frames.map(f => f.gap))
  const span = Math.max(0.01, max - min)
  return frames.map((f, i) => {
    const x = (i / (frames.length - 1)) * w
    const y = h - 6 - ((f.gap - min) / span) * (h - 14)
    return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')
})

const markerX = computed(() => {
  if (!props.trace) return 0
  return (props.cursor / props.config.horizon) * 300
})
const thresholdY = computed(() => {
  if (!props.trace) return 0
  const frames = props.trace.frames
  const min = Math.min(...frames.map(f => f.gap))
  const max = Math.max(...frames.map(f => f.gap))
  const span = Math.max(0.01, max - min)
  return 64 - 6 - ((props.config.requiredClearance - min) / span) * (64 - 14)
})
const deg = (r: number) => Math.round((r * 180) / Math.PI)
</script>

<template>
  <section class="instrument player" aria-label="摆动时间线回放">
    <h2><Wind :size="17" /> 共存运动时间线
      <b v-if="verdict" :class="verdict.kind">{{ { safe: '可保证', closed: '已封口', unknown: '无法证明' }[verdict.kind] }}</b>
    </h2>
    <p class="hint">
      两标在<strong>同一时钟、同一阵风实现</strong>下共同摆动；相位 φ1={{ deg(activePhases[0]) }}°、φ2={{ deg(activePhases[1]) }}°
      <template v-if="verdict?.worst">（自动定位到验证器发现的最不利反例）</template>
    </p>

    <svg class="gap-chart" viewBox="0 0 300 64" aria-label="净宽随时间变化">
      <line x1="0" :x2="300" :y1="thresholdY" :y2="thresholdY" stroke="#ff8a7a" stroke-dasharray="4 3" stroke-width="1.2" />
      <text x="296" :y="thresholdY - 3" text-anchor="end" class="chart-note">通行宽度 {{ config.requiredClearance }} m</text>
      <path :d="gapSeries" fill="none" stroke="#ffd455" stroke-width="1.8" />
      <line :x1="markerX" :x2="markerX" y1="0" y2="64" stroke="#f1e9cd" stroke-width="1.2" />
    </svg>

    <div class="player-row">
      <button type="button" class="icon-button" @click="emit('toggle')">
        <component :is="playing ? Pause : Play" :size="16" />{{ playing ? '暂停' : '播放' }}
      </button>
      <button type="button" class="icon-button" @click="emit('replay')"><RotateCcw :size="15" /> 回最窄时刻</button>
      <output data-testid="play-time">{{ clock(cursor) }}</output>
    </div>
    <input type="range" min="0" :max="config.horizon" step="0.1" :value="cursor"
      aria-label="回放时间" @input="emit('seek', Number(($event.target as HTMLInputElement).value))" />

    <div v-if="verdict?.worst" class="counterexample" :class="verdict.kind">
      <span>最窄时刻 t = {{ verdict.worst.time.toFixed(1) }} s</span>
      <span>净宽 <b data-testid="worst-gap">{{ verdict.worst.gap.toFixed(2) }} m</b></span>
      <span v-if="verdict.worst.drag" class="warn-text">伴随走锚/过载</span>
      <span v-else-if="verdict.worst.gap < config.requiredClearance" class="warn-text">两标相向漂移，门线封口</span>
      <span v-else class="ok-text">未封口，但这是全相位空间的最不利点</span>
    </div>
  </section>
</template>
