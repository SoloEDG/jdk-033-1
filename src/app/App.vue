<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { Anchor, Flag } from 'lucide-vue-next'
import {
  useMooring, ChartView, MatrixPanel, BuoyPanel, PlayerPanel, ConfigPanel,
} from '../features/mooring'

const m = useMooring()
const { config, grades } = m

const frameIndex = computed(() => m.frameAtCursor.value ? Math.round(m.cursor.value / 0.1) : 0)
const canCommit = computed(() => m.currentVerdict.value?.kind === 'safe')

onMounted(() => { m.runAll() })
onUnmounted(() => m.stopPlay())
</script>

<template>
  <main class="shell">
    <header class="masthead">
      <div class="brand">
        <Anchor :size="30" :stroke-width="1.8" />
        <div><h1>赛前锚链规划台</h1><span>MARK MOORING PLANNER · 针岬湾</span></div>
      </div>
      <div class="mast-data">
        <Flag :size="16" /> 门标 A/B 双漂标 · 阵风相位穷举验证
      </div>
    </header>

    <div class="workspace">
      <div class="main-column">
        <ChartView
          :config="config"
          :trace="m.trace.value"
          :frame-index="frameIndex"
          :chain-a-id="m.chainAId.value"
          :chain-b-id="m.chainBId.value"
          :grades="grades"
          :committed="m.committed.value"
        />
        <PlayerPanel
          :config="config"
          :trace="m.trace.value"
          :cursor="m.cursor.value"
          :playing="m.playing.value"
          :verdict="m.currentVerdict.value"
          :active-phases="m.activePhases.value"
          @toggle="m.togglePlay"
          @seek="m.seek"
          @replay="() => m.currentVerdict.value?.worst && m.seek(m.currentVerdict.value.worst.time)"
        />
        <MatrixPanel
          :config="config"
          :matrix="m.matrix.value"
          :chain-a-id="m.chainAId.value"
          :chain-b-id="m.chainBId.value"
          :verifying="m.verifying.value"
          :progress="m.progress.value"
          @inspect="(a, b) => m.inspectCell(a, b)"
        />
      </div>

      <aside class="instruments" aria-label="规划仪表">
        <BuoyPanel
          :config="config"
          :grades="grades"
          :chain-a-id="m.chainAId.value"
          :chain-b-id="m.chainBId.value"
          :single-swings="m.singleSwings.value"
          :total-force-kg="m.totalForceKg"
          :peak-knots="m.peakKnots.value"
        />
        <ConfigPanel
          :config="config"
          :verdict-kind="m.currentVerdict.value?.kind ?? null"
          :committed="m.committed.value"
          :can-commit="canCommit"
          @recompute="m.runAll"
          @commit="m.commit"
        />
      </aside>
    </div>
  </main>
</template>
