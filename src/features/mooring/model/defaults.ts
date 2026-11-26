import type { ChainGrade, PlannerConfig } from './types'

/** 锚链规格表（有档 Studlink 锚链，WLL 为含安全系数的工作载荷上限）。 */
export const CHAIN_GRADES: ChainGrade[] = [
  { id: 'g13', name: '13 mm 有档锚链', weightPerMeter: 3.6, workingLoadKg: 1200 },
  { id: 'g17', name: '17 mm 有档锚链', weightPerMeter: 6.1, workingLoadKg: 2100 },
  { id: 'g20', name: '20 mm 有档锚链', weightPerMeter: 8.5, workingLoadKg: 2900 },
]

const rad = (d: number) => (d * Math.PI) / 180

/**
 * 默认赛前场景：针岬湾西侧小门。
 * 两锚沿门线（方位 40°）相距 24 m；盛行西风（来向 268°）与门线斜交，
 * 两标系泊固有周期不同（约 10 s / 13 s），阵风下产生相位差——
 * 同向漂移时门仍可通行，相向漂移时门线收窄甚至封口。
 * 海图坐标即米制局部坐标；要求通行净宽 12 m。
 */
export function defaultConfig(): PlannerConfig {
  const mid = { x: 416, y: 300 }
  const bearing = 40
  const gx = Math.sin(rad(bearing))
  const gy = -Math.cos(rad(bearing))
  const half = 12
  return {
    waterDepth: 14,
    requiredClearance: 12,
    horizon: 120,
    buoys: [
      {
        id: 'A',
        name: '门标 A',
        mass: 320,
        diameter: 2.0,
        windArea: 1.9,
        dragCoef: 1.15,
        anchor: { x: mid.x - gx * half, y: mid.y - gy * half },
        nominal: { x: mid.x - gx * half, y: mid.y - gy * half },
        holdingKg: 700,
        chains: [
          { id: 'A1', gradeId: 'g13', length: 18 },
          { id: 'A2', gradeId: 'g17', length: 25 },
          { id: 'A3', gradeId: 'g17', length: 32 },
        ],
      },
      {
        id: 'B',
        name: '门标 B',
        mass: 460,
        diameter: 2.4,
        windArea: 2.6,
        dragCoef: 1.1,
        anchor: { x: mid.x + gx * half, y: mid.y + gy * half },
        nominal: { x: mid.x + gx * half, y: mid.y + gy * half },
        holdingKg: 850,
        chains: [
          { id: 'B1', gradeId: 'g13', length: 20 },
          { id: 'B2', gradeId: 'g17', length: 27 },
          { id: 'B3', gradeId: 'g20', length: 34 },
        ],
      },
    ],
    wind: {
      fromBearing: 268,
      swingDeg: 14,
      gusts: [
        { id: 1, period: 22, baseKnots: 18, ampKnots: 8, phaseMinDeg: 0, phaseMaxDeg: 360 },
        { id: 2, period: 13, baseKnots: 0, ampKnots: 5, phaseMinDeg: 40, phaseMaxDeg: 260 },
      ],
    },
  }
}
