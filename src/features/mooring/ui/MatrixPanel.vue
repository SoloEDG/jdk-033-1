<script setup lang="ts">
import { computed } from 'vue'
import { CircleCheck, CircleHelp, TriangleAlert, Grid3x3 } from 'lucide-vue-next'
import type { MatrixCell } from '../model/useMooring'
import type { PlannerConfig } from '../model/types'

const props = defineProps<{
  config: PlannerConfig
  matrix: MatrixCell[]
  chainAId: string
  chainBId: string
  verifying: boolean
  progress: { done: number; total: number }
}>()
const emit = defineEmits<{ inspect: [a: string, b: string] }>()

const aIds = computed(() => props.config.buoys[0].chains.map(c => c.id))
const bIds = computed(() => props.config.buoys[1].chains.map(c => c.id))

function cell(a: string, b: string) {
  return props.matrix.find(m => m.chainAId === a && m.chainBId === b)
}
const labelMap = { safe: '可保证', closed: '已封口', unknown: '无法证明' }
const iconMap = { safe: CircleCheck, closed: TriangleAlert, unknown: CircleHelp }
const pct = computed(() => Math.round((props.progress.done / Math.max(1, props.progress.total)) * 100))
</script>

<template>
  <section class="instrument matrix-panel" aria-label="锚链方案矩阵">
    <h2><Grid3x3 :size="17" /> 锚链组合验证 <b>联合时间线 · 相位穷举</b></h2>
    <p class="hint">每格为 A/B 各选一条链的方案；颜色是对两股阵风全部可知相位穷举后的结论，点击任一格可在海图回看其最窄时刻。</p>
    <div v-if="verifying" class="verify-progress">
      <div class="bar"><span :style="{ width: pct + '%' }" /></div>
      <small>相位空间检验中 {{ pct }}%</small>
    </div>
    <table v-else class="matrix">
      <thead>
        <tr><th></th><th v-for="b in bIds" :key="b">B · {{ b }}</th></tr>
      </thead>
      <tbody>
        <tr v-for="a in aIds" :key="a">
          <th>A · {{ a }}</th>
          <td v-for="b in bIds" :key="b">
            <button type="button" class="cell" :class="cell(a, b)?.verdict.kind"
              :aria-pressed="chainAId === a && chainBId === b"
              @click="emit('inspect', a, b)">
              <component :is="iconMap[cell(a, b)?.verdict.kind ?? 'unknown']" :size="15" />
              <span>{{ cell(a, b) ? labelMap[cell(a, b)!.verdict.kind] : '—' }}</span>
              <small v-if="cell(a, b)">{{ cell(a, b)!.verdict.worstGap.toFixed(1) }} m</small>
            </button>
          </td>
        </tr>
      </tbody>
    </table>
    <ul class="legend">
      <li><i class="dot safe" />可保证通行（含 1.5 m 证明裕度）</li>
      <li><i class="dot closed" />已出现封口 / 走锚（存在共存时间线反例）</li>
      <li><i class="dot unknown" />无法证明（未封口但裕度不足）</li>
    </ul>
  </section>
</template>
