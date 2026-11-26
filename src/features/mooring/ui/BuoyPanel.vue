<script setup lang="ts">
import { computed } from 'vue'
import { Anchor, Weight, Waves } from 'lucide-vue-next'
import type { BuoySpec, ChainGrade, PlannerConfig } from '../model/types'

const props = defineProps<{
  config: PlannerConfig
  grades: Map<string, ChainGrade>
  chainAId: string
  chainBId: string
  singleSwings: { buoyId: string; chainId: string; u: number; topTensionKg: number; horizontalKg: number; taut: boolean; overload: boolean; drag: boolean }[]
  totalForceKg: (buoy: BuoySpec, knots: number) => number
  peakKnots: number
}>()

function chainLabel(buoy: BuoySpec, chainId: string) {
  const option = buoy.chains.find(c => c.id === chainId)!
  const grade = props.grades.get(option.gradeId)!
  return `${option.id} · ${grade.name} · ${option.length} m`
}
const rows = computed(() => props.config.buoys.map(buoy => ({
  buoy,
  chainId: buoy.id === 'A' ? props.chainAId : props.chainBId,
  swing: props.singleSwings.find(s => s.buoyId === buoy.id)!,
})))
</script>

<template>
  <section class="instrument" aria-label="浮标与锚链参数">
    <h2><Anchor :size="17" /> 浮标 · 锚点 · 锚链</h2>
    <div v-for="row in rows" :key="row.buoy.id" class="buoy-card">
      <header>
        <b>{{ row.buoy.id }} · {{ row.buoy.name }}</b>
        <span>{{ chainLabel(row.buoy, row.chainId) }}</span>
      </header>
      <dl>
        <div><dt><Weight :size="13" /> 浮标质量</dt><dd>{{ row.buoy.mass }} kg</dd></div>
        <div><dt>标体直径</dt><dd>{{ row.buoy.diameter }} m</dd></div>
        <div><dt>锚抓力</dt><dd>{{ row.buoy.holdingKg }} kgf</dd></div>
        <div><dt>锚点坐标</dt><dd>({{ row.buoy.anchor.x }}, {{ row.buoy.anchor.y }})</dd></div>
      </dl>
      <div class="swing" :class="{ bad: row.swing.overload || row.swing.drag || row.swing.taut }">
        <Waves :size="14" />
        <span>峰值 {{ peakKnots.toFixed(0) }} kn 单标最大摆幅 <b>{{ row.swing.u.toFixed(1) }} m</b></span>
        <span>张力 {{ row.swing.topTensionKg.toFixed(0) }} / 水平 {{ row.swing.horizontalKg.toFixed(0) }} kgf</span>
      </div>
      <p v-if="row.swing.overload || row.swing.drag" class="warn">
        {{ row.swing.overload ? '超过锚链工作载荷' : '' }}{{ row.swing.overload && row.swing.drag ? '；' : '' }}{{ row.swing.drag ? '超过锚抓力（走锚）' : '' }}
      </p>
    </div>
    <p class="hint">注意：单标摆幅只描述各自最坏位置，不能据此判断门线——两标是否封口取决于同一阵风时间线上的<strong>相对</strong>运动。</p>
  </section>
</template>
