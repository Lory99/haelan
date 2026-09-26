import { useId, useMemo, useState } from 'react'
import { useTranslation } from '../i18n/index.js'
import { formatMetricValue } from '../format.js'
import { calendarLayout } from './calendar.js'
import { ANNOTATION_JOIN } from './base.js'
import { heatValue, type HeatmapDay } from './ActivityHeatmap.js'

// Order matches calendar.ts's weekdayIndex (Monday first); the same keys ActivityHeatmap reads,
// so both renderings name the days identically in every language.
const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

// A stable reference for a caller that omits annotations/excluded, the same device
// ActivityHeatmap's own EMPTY is: a fresh `[]` literal per render would rebuild every memo below.
const EMPTY = Object.freeze([]) as never[]

/**
 * Which of the six shades a day gets: 0 is the empty square (no reading, or a true zero), 1-5
 * ride the chart's own scale ramp from `scale-1` to `scale-5`. The domain is the period's own max,
 * the same "same as steps" rule the old echarts heatmap used: the darkest square is always the
 * period's best day, whether that is 14,000 steps or 3 workouts.
 */
export function gridLevel(value: number | null | undefined, max: number): 0 | 1 | 2 | 3 | 4 | 5 {
  if (value === null || value === undefined || max <= 0 || value <= 0) return 0
  return (1 + Math.min(4, Math.floor((value / max) * 5))) as 1 | 2 | 3 | 4 | 5
}

/**
 * The activity grids as calendar-style squares, in two shapes chosen by the range behind them.
 *
 * Up to a month the days run horizontally, one row per week, Monday to Sunday left to right,
 * filling the card's width: a week or a month of squares occupies the card instead of huddling
 * in its corner. Past a month the same squares switch to GitHub's own vertical week columns
 * with small fixed squares, because dozens of full-width rows would run the card off the page.
 * The caller picks the shape (Activity keys it off the range tab); the colours, tooltips, marks
 * and accessible table are identical in both.
 *
 * The data contract is ActivityHeatmap's own: the same `days` rows, the same `metric` switch
 * between `steps` and `workouts`, the same absence/excluded/annotated vocabulary in the tooltip
 * and the same accessible table beside the grid. Only the rendering changed.
 *
 * The headline and basis sit inside the grid in StatTile's own order (value, then basis), because
 * the Card shell prints its basis above its children: handing Card the basis would read title,
 * basis, total, grid, while every other card in the app reads title, total, basis, chart.
 */
export function ContributionGrid({ days, max, label, metric = 'steps', layout = 'rows', totalValue, totalUnit, basis, annotations = EMPTY, excluded = EMPTY, onPointClick }: {
  days: HeatmapDay[]
  max: number
  label: string
  metric?: 'steps' | 'workout_count'
  // 'rows' fills the card one row per week (week and month tabs); 'columns' draws one small
  // week column per week (past a month), GitHub-style.
  layout?: 'rows' | 'columns'
  // The period's own total, formatted by the caller (it owns i18n and the catalogue formatter):
  // steps read "48,213 steps", workouts "7 workouts", always over the filtered range. Absent when
  // no day reported at all, so an empty period never headlines the bare "0" a formatter hands
  // back for nothing summarised (the rule pages.test.tsx's own zero assertion holds app-wide).
  totalValue?: string
  totalUnit?: string
  // The card's basis line, rendered here between the headline and the grid for the StatTile order
  // above rather than handed to Card (which would print it before the headline).
  basis?: string
  // Same prop names and shapes ActivityHeatmap takes, so the page hands both grids the same values.
  annotations?: { date: string; text: string }[]
  excluded?: string[]
  onPointClick?: (localDate: string) => void
}) {
  const { t, i18n } = useTranslation()
  const tableId = useId()
  const [shown, setShown] = useState(false)

  const { weeks, cells } = useMemo(() => calendarLayout(days.map((d) => d.date)), [days])
  const weekdayLabels = useMemo(() => WEEKDAY_KEYS.map((key) => t(`charts.weekday.${key}`)), [t])
  const valueHeader = metric === 'workout_count' ? t('charts.columns.workouts') : t('charts.columns.steps')

  // One short month name per week, printed where the month turns over: beside the row in rows
  // mode, above the column in columns mode.
  const monthLabels = useMemo(() => {
    const out: (string | null)[] = []
    let prev = ''
    for (let week = 0; week < weeks; week++) {
      const first = cells.find((c) => c.week === week)?.date
      if (first === undefined) { out.push(null); continue }
      const month = first.slice(0, 7)
      out.push(month === prev ? null
        : new Date(`${first}T00:00:00Z`).toLocaleString(i18n.language, { month: 'short', timeZone: 'UTC' }))
      prev = month
    }
    return out
  }, [cells, weeks, i18n.language])

  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days])
  const noteByDate = useMemo(() => {
    const out = new Map<string, string>()
    for (const a of annotations) {
      const prev = out.get(a.date)
      out.set(a.date, prev === undefined ? a.text : `${prev}${ANNOTATION_JOIN}${a.text}`)
    }
    return out
  }, [annotations])

  // The spoken and hovered line for one square: the formatted value, or the reason there is none,
  // plus any note on the day. An excluded day that still carries a reading names both facts: the
  // value says what the device recorded, "excluded" says the reader threw it out. A valueless
  // excluded day already reads "excluded" as its reason, so it is not repeated as a mark on top
  // of itself.
  const tipFor = (date: string): string => {
    const isExcluded = excluded.includes(date)
    const note = noteByDate.get(date) ?? ''
    const value = heatValue(byDate.get(date), metric)
    const reading = value === null || value === undefined
      ? t(isExcluded ? 'charts.absence.excluded' : 'charts.absence.noReading')
      : `${valueHeader}: ${formatMetricValue(value, metric, i18n.language, '')}`
    const mark = isExcluded && value !== null && value !== undefined ? t('charts.absence.excluded') : ''
    return [date, reading, mark, note].filter(Boolean).join(', ')
  }

  return (
    <figure style={{ margin: 0 }}>
      {/* The period total in the tile's own headline style (StatTile's `.value` line), so the card
          answers "how much" at a glance and the grid below answers "on which days". */}
      {totalValue !== undefined && (
        <div className="value">{totalValue}{totalUnit && <span style={{ fontSize: 'var(--font-size-lg)', color: 'var(--text-muted)' }}> {totalUnit}</span>}</div>
      )}
      {basis !== undefined && <p className="basis">{basis}</p>}
      {/* Seven fractional tracks in rows mode (Monday to Sunday, filling the card up to
          --contrib-max); one fixed small track per week in columns mode, scrolling sideways. */}
      <div className="contrib" role="group" aria-label={label} data-layout={layout}>
        {layout === 'rows' ? (
          <div className="contrib-head" aria-hidden="true"
            style={{ gridTemplateColumns: 'var(--contrib-gutter) repeat(7, minmax(0, 1fr))' }}>
            <span />
            {weekdayLabels.map((weekday, index) => <span key={index} className="contrib-wday">{weekday}</span>)}
          </div>
        ) : (
          <div className="contrib-head" aria-hidden="true"
            style={{ gridTemplateColumns: `var(--contrib-gutter) repeat(${weeks}, var(--contrib-cell))` }}>
            <span />
            {monthLabels.map((month, week) => <span key={week} className="contrib-month">{month ?? ''}</span>)}
          </div>
        )}
        <div className="contrib-grid"
          style={{ gridTemplateColumns: layout === 'rows'
            ? 'var(--contrib-gutter) repeat(7, minmax(0, 1fr))'
            : `var(--contrib-gutter) repeat(${weeks}, var(--contrib-cell))` }}>
          {layout === 'rows'
            ? monthLabels.map((month, week) => (
              <span key={week} className="contrib-month" style={{ gridColumn: 1, gridRow: week + 1 }}>
                {month ?? ''}
              </span>
            ))
            : [0, 2, 4].map((weekday) => (
              <span key={weekday} className="contrib-wday" style={{ gridColumn: 1, gridRow: weekday + 1 }}>
                {weekdayLabels[weekday] ?? ''}
              </span>
            ))}
          {cells.map((cell) => {
            const value = heatValue(byDate.get(cell.date), metric)
            const isExcluded = excluded.includes(cell.date)
            const note = noteByDate.get(cell.date) ?? ''
            const tip = tipFor(cell.date)
            const square = {
              className: 'contrib-day',
              // Rows: across the week (Monday opens the row); columns: down the week (Monday
              // opens the column), GitHub's own order.
              style: layout === 'rows'
                ? { gridColumn: cell.weekday + 2, gridRow: cell.week + 1 }
                : { gridColumn: cell.week + 2, gridRow: cell.weekday + 1 },
              'data-level': gridLevel(value, max),
              'data-excluded': isExcluded || undefined,
              'data-annotated': note !== '' || undefined,
              title: tip,
            } as const
            // A real button only when a press has somewhere to go (the annotate panel): a dead
            // button names a day and then does nothing with it. Without a handler the square is a
            // titled span, and the table below still carries the numbers.
            return onPointClick === undefined
              ? <span key={cell.date} {...square} />
              : <button key={cell.date} type="button" {...square} aria-label={tip}
                  onClick={() => onPointClick(cell.date)} />
          })}
        </div>
      </div>
      {/* The same show-numbers contract ChartFigure gives every echarts chart: the table sits in the
          accessibility tree whether or not the toggle has been pressed, and the toggle changes
          pixels only. */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="button" className="chart-table-toggle" aria-expanded={shown} aria-controls={tableId}
          aria-label={t(shown ? 'charts.tableToggle.hideFor' : 'charts.tableToggle.showFor', { label })}
          onClick={() => setShown((current) => !current)}>
          {t(shown ? 'charts.tableToggle.hide' : 'charts.tableToggle.show')}
        </button>
      </div>
      <div id={tableId} className={shown ? 'chart-table' : 'sr-only'}>
        <table className={shown ? '' : 'sr-only'}>
          <caption>{label}</caption>
          <thead>
            <tr>
              {[t('charts.columns.date'), t('charts.columns.weekday'), valueHeader, t('charts.columns.note')]
                .map((c) => <th key={c} scope="col">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {cells.map((cell, i) => {
              const isExcluded = excluded.includes(cell.date)
              const absent = t(isExcluded ? 'charts.absence.excluded' : 'charts.absence.noReading')
              return (
                <tr key={i}>
                  <th scope="row">{cell.date}</th>
                  <td>{weekdayLabels[cell.weekday] ?? ''}</td>
                  <td>{formatMetricValue(heatValue(byDate.get(cell.date), metric) ?? null, metric, i18n.language, absent)}</td>
                  <td>{[isExcluded ? t('charts.absence.excluded') : '', noteByDate.get(cell.date) ?? '']
                    .filter(Boolean).join(ANNOTATION_JOIN)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </figure>
  )
}
