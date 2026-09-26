// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { act } from 'react'
import { ContributionGrid, gridLevel } from '../src/charts/ContributionGrid.js'
import type { HeatmapDay } from '../src/charts/ActivityHeatmap.js'
import { I18nProvider } from '../src/i18n/index.js'

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => { root?.unmount() })
  container?.remove()
  container = null
  root = null
})

// Monday 2026-08-10 through Sunday 2026-08-16: a single week, so the grid is one week column
// of seven squares, with one "Aug" label above it.
const day = (date: string, steps: number | null, workouts?: number | null): HeatmapDay => ({
  date, hrMin: null, hrMean: null, hrMax: null, sleepMinutes: null,
  steps, workouts: workouts ?? null, worn: steps !== null,
})

const WEEK: HeatmapDay[] = [
  day('2026-08-10', 8000), day('2026-08-11', 4000), day('2026-08-12', null),
  day('2026-08-13', 12000), day('2026-08-14', 0), day('2026-08-15', 6000),
  day('2026-08-16', 10000),
]

function mountGrid(node: React.ReactNode): void {
  act(() => { root?.render(<I18nProvider lng="en">{node}</I18nProvider>) })
}

function squares(): HTMLElement[] {
  return [...container!.querySelectorAll('.contrib-day')].filter(
    (el) => !el.classList.contains('contrib-sw'),
  ) as HTMLElement[]
}

describe('gridLevel', () => {
  // The darkest square is always the period's best day, whatever the metric's own units are:
  // 100 of max 100 and 3 of max 3 both read level 5, which is what "same as steps" means for a
  // workout count whose whole domain fits in one hand.
  it('maps the max to the darkest shade and small values to the lightest', () => {
    expect(gridLevel(100, 100)).toBe(5)
    expect(gridLevel(3, 3)).toBe(5)
    expect(gridLevel(1, 100)).toBe(1)
    expect(gridLevel(50, 100)).toBe(3)
  })

  // No reading and a true zero share the empty square; the tooltip and the table below still say
  // which of the two a day is, so the paint stays one vocabulary for one grid.
  it('leaves the empty square for missing, zero and degenerate domains', () => {
    expect(gridLevel(null, 100)).toBe(0)
    expect(gridLevel(undefined, 100)).toBe(0)
    expect(gridLevel(0, 100)).toBe(0)
    expect(gridLevel(50, 0)).toBe(0)
  })
})

describe('ContributionGrid', () => {
  // Shape, not paint: seven days in one week column, each a square carrying its level, with the
  // month named once above the column it opens.
  it('draws one square per day with the month over its week', () => {
    mountGrid(<ContributionGrid days={WEEK} max={12000} label="Steps per day"
      totalValue="48,000" totalUnit="steps" onPointClick={() => {}} />)
    expect(squares()).toHaveLength(7)
    expect(squares().every((s) => s.tagName === 'BUTTON')).toBe(true)
    expect(container!.querySelector('.contrib-month')?.textContent).toBe('Aug')
    // A real gap grid, not stretched bands: fixed cells share one gutter and one column template.
    expect(container!.querySelector('.contrib-grid')).not.toBeNull()
    expect(container!.querySelector('.contrib-wday')?.textContent).toBe('Mon')
  })

  // Paint: the level rides the value against this period's max, through the data attribute the
  // stylesheet reads, so no computed colour is asserted here (happy-dom applies no stylesheet).
  it('buckets each square against the period max', () => {
    mountGrid(<ContributionGrid days={WEEK} max={12000} label="Steps per day"
      totalValue="48,000" totalUnit="steps" onPointClick={() => {}} />)
    const level = (date: string): string | null =>
      squares().find((s) => s.getAttribute('aria-label')?.startsWith(date))?.getAttribute('data-level') ?? null
    expect(level('2026-08-13')).toBe('5')
    expect(level('2026-08-10')).toBe('4')
    expect(level('2026-08-11')).toBe('2')
    expect(level('2026-08-14')).toBe('0')
    expect(level('2026-08-12')).toBe('0')
  })

  // The workouts card reads its own field through the same grid: metric="workout_count" looks at
  // `workouts`, never at `steps`.
  it('reads workout counts through metric="workout_count"', () => {
    const days: HeatmapDay[] = [day('2026-08-10', null, 2), day('2026-08-11', null, 0), day('2026-08-12', null, null)]
    mountGrid(<ContributionGrid days={days} max={2} metric="workout_count" label="Workouts per day"
      totalValue="2" totalUnit="workouts" onPointClick={() => {}} />)
    const level = (date: string): string | null =>
      squares().find((s) => s.getAttribute('aria-label')?.startsWith(date))?.getAttribute('data-level') ?? null
    expect(level('2026-08-10')).toBe('5')
    expect(level('2026-08-11')).toBe('0')
    expect(level('2026-08-12')).toBe('0')
    expect(container!.querySelector('table')?.querySelector('thead')?.textContent).toContain('Workouts')
  })

  // Marks ride the square itself now that there is no echarts overlay: excluded days wear the
  // excluded paint, annotated days an inset ring, and a press names the day it landed on.
  it('marks excluded days and reports the pressed square', () => {
    const onPointClick = vi.fn()
    mountGrid(<ContributionGrid days={WEEK} max={12000} label="Steps per day"
      totalValue="48,000" totalUnit="steps" excluded={['2026-08-10']}
      annotations={[{ date: '2026-08-11', text: 'hotel gym' }]} onPointClick={onPointClick} />)
    const monday = squares().find((s) => s.getAttribute('aria-label')?.startsWith('2026-08-10'))!
    expect(monday.hasAttribute('data-excluded')).toBe(true)
    expect(monday.getAttribute('aria-label')).toContain('excluded')
    const tuesday = squares().find((s) => s.getAttribute('aria-label')?.startsWith('2026-08-11'))!
    expect(tuesday.hasAttribute('data-annotated')).toBe(true)
    expect(tuesday.getAttribute('aria-label')).toContain('hotel gym')
    act(() => { monday.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(onPointClick).toHaveBeenCalledWith('2026-08-10')
  })

  // No handler, no dead buttons: the squares stay titled spans and the table still carries the
  // numbers, the same conditional ChartFigure's own tap controls follow.
  it('renders titled spans rather than buttons without a click handler', () => {
    mountGrid(<ContributionGrid days={WEEK} max={12000} label="Steps per day"
      totalValue="48,000" totalUnit="steps" />)
    expect(container!.querySelector('.contrib-grid button')).toBeNull()
    expect(squares()).toHaveLength(7)
    expect(squares()[0]!.tagName).toBe('SPAN')
    expect(squares()[0]!.getAttribute('title')).toContain('2026-08-10')
  })

  // The card's own "how much": the formatted period total over the filtered range, in the tile's
  // headline style, above the "on which days" grid.
  it('headlines the period total above the grid', () => {
    mountGrid(<ContributionGrid days={WEEK} max={12000} label="Steps per day"
      totalValue="48,000" totalUnit="steps" onPointClick={() => {}} />)
    expect(container!.querySelector('.value')?.textContent).toBe('48,000 steps')
  })

  // The same show-numbers contract as every echarts chart: hidden-but-present table until the
  // toggle is pressed, then the translated columns and one row per day.
  it('toggles an accessible table with one row per day', () => {
    mountGrid(<ContributionGrid days={WEEK} max={12000} label="Steps per day"
      totalValue="48,000" totalUnit="steps" onPointClick={() => {}} />)
    const toggle = container!.querySelector('.chart-table-toggle') as HTMLElement
    expect(toggle.textContent).toBe('Show numbers')
    expect(container!.querySelector('thead')?.textContent).toContain('Weekday')
    act(() => { toggle.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(container!.querySelector('.chart-table')).not.toBeNull()
    expect(container!.querySelectorAll('tbody tr')).toHaveLength(7)
    expect(container!.textContent).toContain('8,000')
  })
})
