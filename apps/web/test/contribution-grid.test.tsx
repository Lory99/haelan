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

function square(date: string): HTMLElement {
  const found = squares().find((s) =>
    s.getAttribute('aria-label')?.startsWith(date) ?? s.getAttribute('title')?.startsWith(date))
  if (!found) throw new Error(`no square for ${date}`)
  return found
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
  // Shape, not paint: a single week is one row of seven squares, Monday to Sunday left to right
  // under a full weekday header, with the month named once in the row's own gutter.
  it('lays days out horizontally, one row per week', () => {
    mountGrid(<ContributionGrid days={WEEK} max={12000} label="Steps per day"
      totalValue="48,000" totalUnit="steps" onPointClick={() => {}} />)
    expect(squares()).toHaveLength(7)
    expect(squares().every((s) => s.tagName === 'BUTTON')).toBe(true)
    expect([...container!.querySelectorAll('.contrib-wday')].map((el) => el.textContent))
      .toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
    expect(container!.querySelector('.contrib-month')?.textContent).toBe('Aug')
    // Row-major placement: Monday opens the row, Sunday closes it, everything on week one's row.
    expect(square('2026-08-10').getAttribute('style')).toContain('grid-column: 2')
    expect(square('2026-08-16').getAttribute('style')).toContain('grid-column: 8')
    for (const s of squares()) expect(s.getAttribute('style')).toContain('grid-row: 1')
  })

  // A second week is a second row: the next Monday sits under the first, not beside it.
  it('starts a new row for each week', () => {
    const days: HeatmapDay[] = [...WEEK, day('2026-08-17', 9000)]
    mountGrid(<ContributionGrid days={days} max={12000} label="Steps per day"
      totalValue="57,000" totalUnit="steps" onPointClick={() => {}} />)
    expect(squares()).toHaveLength(8)
    expect(square('2026-08-17').getAttribute('style')).toContain('grid-column: 2')
    expect(square('2026-08-17').getAttribute('style')).toContain('grid-row: 2')
  })

  // Paint: the level rides the value against this period's max, through the data attribute the
  // stylesheet reads, so no computed colour is asserted here (happy-dom applies no stylesheet).
  it('buckets each square against the period max', () => {
    mountGrid(<ContributionGrid days={WEEK} max={12000} label="Steps per day"
      totalValue="48,000" totalUnit="steps" onPointClick={() => {}} />)
    const level = (date: string): string | null => square(date).getAttribute('data-level')
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
    const level = (date: string): string | null => square(date).getAttribute('data-level')
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
    const monday = square('2026-08-10')
    expect(monday.hasAttribute('data-excluded')).toBe(true)
    expect(monday.getAttribute('aria-label')).toContain('excluded')
    const tuesday = square('2026-08-11')
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
      totalValue="48,000" totalUnit="steps" basis="calendar heatmap, 6 of 7 days"
      onPointClick={() => {}} />)
    const figure = container!.querySelector('figure')!
    // StatTile's own order (value, then basis), which Card's basis prop would invert: the total
    // sits under the card's title and the basis under the total. Only the first three children
    // are ordered here; the toggle and the table follow.
    const order = [...figure.children].map((el) => el.className).slice(0, 3)
    expect(order).toEqual(['value', 'basis', 'contrib'])
    expect(container!.querySelector('.value')?.textContent).toBe('48,000 steps')
    expect(container!.querySelector('.basis')?.textContent).toContain('6 of 7 days')
  })

  // An empty period headlines nothing: a bare "0" would state a reading that never happened, the
  // exact claim pages.test.tsx's own zero rule holds the whole app to. The basis line below still
  // says there were no readings.
  it('headlines no total when no day reported', () => {
    const empty: HeatmapDay[] = [day('2026-08-10', null), day('2026-08-11', null)]
    mountGrid(<ContributionGrid days={empty} max={0} label="Steps per day"
      basis="calendar heatmap, no readings in these 2 days" onPointClick={() => {}} />)
    expect(container!.querySelector('.value')).toBeNull()
    expect(container!.querySelector('.basis')?.textContent).toContain('no readings')
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
