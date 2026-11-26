<script setup lang="ts">
import { computed } from 'vue'
import { Settings2, Flag, Lock, TriangleAlert, CircleCheck } from 'lucide-vue-next'
import type { CommittedPlan, PlannerConfig } from '../model/types'

const props = defineProps<{
  config: PlannerConfig
  verdictKind: 'safe' | 'closed' | 'unknown' | null
  committed: CommittedPlan | null
  canCommit: boolean
}>()
const emit = defineEmits<{ recompute: []; commit: [] }>()

const gusts = computed(() => props.config.wind.gusts)
const deg = (r: number) => Math.round((r * 180) / Math.PI)
</script>

<template>
  <section class="instrument config-panel" aria-label="场景输入">
    <h2><Settings2 :size="17" /> 场景输入</h2>

    <div class="grid2">
      <label>水深 (m)
        <input type="number" min="4" max="60" step="0.5" v-model.number="config.waterDepth" />
      </label>
      <label>通行净宽 (m)
        <input type="number" min="4" max="40" step="0.5" v-model.number="config.requiredClearance" />
      </label>
    </div>

    <div v-for="(buoy, i) in config.buoys" :key="buoy.id" class="buoy-input">
      <b>浮标 {{ buoy.id }}</b>
      <div class="grid3">
        <label>质量 kg<input type="number" min="50" step="10" v-model.number="buoy.mass" /></label>
        <label>直径 m<input type="number" min="0.5" step="0.1" v-model.number="buoy.diameter" /></label>
        <label>锚抓力 kgf<input type="number" min="50" step="10" v-model.number="buoy.holdingKg" /></label>
      </div>
      <div class="grid3">
        <label>锚点 X<input type="number" step="1" v-model.number="buoy.anchor.x" /></label>
        <label>锚点 Y<input type="number" step="1" v-model.number="buoy.anchor.y" /></label>
        <label>受风面积 m²<input type="number" min="0.2" step="0.1" v-model.number="buoy.windArea" /></label>
      </div>
      <fieldset class="chain-pick">
        <legend>可选锚链（{{ buoy.id }}，在矩阵中切换选用）</legend>
        <span v-for="c in buoy.chains" :key="c.id" class="chain-chip">{{ c.id }} · {{ c.length }} m</span>
      </fieldset>
    </div>

    <div class="gust-box">
      <b>两股阵风 · 起始相位仅知范围</b>
      <div v-for="g in gusts" :key="g.id" class="gust-row">
        <span>阵风 {{ g.id }}</span>
        <label>周期 s<input type="number" min="3" step="0.5" v-model.number="g.period" /></label>
        <label>基准 kn<input type="number" min="0" step="0.5" v-model.number="g.baseKnots" /></label>
        <label>振幅 kn<input type="number" min="0" step="0.5" v-model.number="g.ampKnots" /></label>
        <label>相位 °<input type="number" min="0" max="360" v-model.number="g.phaseMinDeg" />~<input type="number" min="0" max="360" v-model.number="g.phaseMaxDeg" /></label>
      </div>
    </div>

    <button type="button" class="primary block" @click="emit('recompute')"><Settings2 :size="15" /> 重新穷举验证</button>

    <div class="commit-box">
      <button type="button" class="commit" :disabled="!canCommit" @click="emit('commit')">
        <Flag :size="16" /> 用选中锚链开赛
      </button>
      <p v-if="verdictKind === 'closed'" class="warn"><TriangleAlert :size="14" /> 当前方案存在封口反例，禁止开赛</p>
      <p v-else-if="verdictKind === 'unknown'" class="muted"><Lock :size="14" /> 尚未证明安全：开赛需裁判长人工豁免</p>
      <p v-else-if="verdictKind === 'safe'" class="ok"><CircleCheck :size="14" /> 全相位可保证通行，可提交裁判</p>
      <div v-if="committed" class="locked-note">
        <Lock :size="13" /> 已锁定：链 {{ committed.chainAId }} + {{ committed.chainBId }}，
        相位 φ1={{ Math.round(committed.realizedPhases[0]) }}° φ2={{ Math.round(committed.realizedPhases[1]) }}°，
        裁判全程采用同一组漂标位置。
      </div>
    </div>
  </section>
</template>
