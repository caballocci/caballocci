import { SchedulePicker } from '../../shared/schedule-picker'
import { toLocalDateTimeInput } from './editor-utils'
import { recordScheduleHistory } from '../../shared/schedule-picker'

export { parseTimeInput, recordScheduleHistory } from '../../shared/schedule-picker'

export function EditorSchedule({ historyKey, historyVersion, scheduledAt, onChange }: {
  historyKey: string
  historyVersion: number
  scheduledAt: string | null
  onChange(date: string, time: string, label: string): void
}) {
  return <SchedulePicker
    historyKey={historyKey}
    historyVersion={historyVersion}
    value={toLocalDateTimeInput(scheduledAt)}
    onChange={(next, label) => onChange(next ? next.slice(0, 10) : '', next ? next.slice(11, 16) : '', label)}
  />
}
